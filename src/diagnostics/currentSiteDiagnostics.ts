import type { ApplyProxySettingsResult, ProxySettingsAdapter } from "../proxy/applyProxySettings";
import { getMessage } from "../i18n/i18n";
import { buildPacScript } from "../proxy/buildPac";
import { checkDenylistedHost } from "../rules/denylist";
import { domainMatchesRule, findEffectiveDomainRule } from "../rules/domainMatcher";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainRule } from "../rules/ruleTypes";
import { getLocalSettings } from "../storage/localStore";
import { getSyncSettings } from "../storage/syncStore";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../storage/storageTypes";

export const currentSiteDiagnosticMessageType = "smart-proxy-route-helper:run-current-site-diagnostic" as const;

export type CurrentSiteDiagnosticStatus =
  | "proxy_reachable"
  | "proxy_unreachable"
  | "missing_proxy_config"
  | "unsupported_url"
  | "error";

export type CurrentSiteDiagnosticRequest = {
  type: typeof currentSiteDiagnosticMessageType;
  url?: string;
};

export type CurrentSiteDiagnosticResponse = {
  status: CurrentSiteDiagnosticStatus;
  message: string;
  domain?: string;
};

export type CurrentSiteDiagnosticTarget =
  | {
      ok: true;
      url: string;
      probeUrl: string;
      domain: string;
    }
  | {
      ok: false;
      response: CurrentSiteDiagnosticResponse;
    };

export type CurrentSiteDiagnosticPlan =
  | {
      ok: true;
      domain: string;
      probeUrl: string;
      pacScript: string;
      proxyString: string;
      probeRules: DomainRule[];
    }
  | {
      ok: false;
      response: CurrentSiteDiagnosticResponse;
    };

export type DiagnosticFetch = (input: string, init: RequestInit) => Promise<unknown>;

export type RunCurrentSiteDiagnosticOptions = {
  proxySettings: ProxySettingsAdapter;
  restoreProxySettings: () => Promise<ApplyProxySettingsResult>;
  syncStorage?: StorageAreaAdapter;
  localStorage?: StorageAreaAdapter;
  fetcher?: DiagnosticFetch;
  timeoutMs?: number;
  createdAt?: string;
};

const defaultDiagnosticTimeoutMs = 7000;
const configureLocalProxyMessage = (): string => getMessage("diagnosticConfigureProxy");
const reachableMessage = (): string => getMessage("diagnosticReachable");
const unreachableMessage = (): string => getMessage("diagnosticUnreachable");

function response(
  status: CurrentSiteDiagnosticStatus,
  message: string,
  domain?: string
): CurrentSiteDiagnosticResponse {
  return domain
    ? {
        status,
        message,
        domain
      }
    : {
        status,
        message
      };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return getMessage("diagnosticCheckFailed");
}

function unsupportedUrlMessage(url: string): string {
  try {
    const protocol = new URL(url).protocol.replace(/:$/, "");
    const protocolLabel = protocol ? `${protocol}://` : getMessage("commonThisPage");

    return getMessage("diagnosticProtocolCannotCheck", [protocolLabel]);
  } catch {
    return getMessage("diagnosticOpenValidSite");
  }
}

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": getMessage("diagnosticInternalPage"),
    localhost: getMessage("diagnosticLocalhost"),
    "loopback-ip": getMessage("diagnosticLoopback"),
    "private-ip": getMessage("diagnosticPrivate"),
    "internal-suffix": getMessage("diagnosticInternalDomain"),
    "single-label-host": getMessage("diagnosticOpenPublicDomain"),
    "invalid-host": getMessage("diagnosticOpenValidSite")
  };

  return messages[reason] ?? getMessage("diagnosticSiteCannotCheck");
}

function isStoredDenylistedDomain(domain: string, denylist: readonly string[]): boolean {
  return denylist.some((entry) => domainMatchesRule(domain, { domain: entry, includeSubdomains: true }));
}

function hasUsableLocalProxyConfig(localSettings: LocalSettings): boolean {
  return localSettings.deviceProxy.enabled && localSettings.deviceProxy.config !== null;
}

export function isCurrentSiteDiagnosticRequest(input: unknown): input is CurrentSiteDiagnosticRequest {
  return (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    input.type === currentSiteDiagnosticMessageType
  );
}

export function isCurrentSiteDiagnosticResponse(input: unknown): input is CurrentSiteDiagnosticResponse {
  if (typeof input !== "object" || input === null || !("status" in input) || !("message" in input)) {
    return false;
  }

  const status = input.status;

  return (
    typeof input.message === "string" &&
    (!("domain" in input) || typeof input.domain === "string") &&
    (status === "proxy_reachable" ||
      status === "proxy_unreachable" ||
      status === "missing_proxy_config" ||
      status === "unsupported_url" ||
      status === "error")
  );
}

export function getCurrentSiteDiagnosticTarget(url: string | undefined): CurrentSiteDiagnosticTarget {
  if (!url) {
    return {
      ok: false,
      response: response("unsupported_url", getMessage("diagnosticOpenSupportedSite"))
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      response: response("unsupported_url", getMessage("diagnosticOpenValidSite"))
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      response: response("unsupported_url", unsupportedUrlMessage(url))
    };
  }

  const normalized = normalizeDomain(url);

  if (!normalized.ok) {
    return {
      ok: false,
      response: response("unsupported_url", normalized.error.message)
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      response: response("unsupported_url", denylistMessage(denylist.reason), normalized.domain)
    };
  }

  return {
    ok: true,
    url,
    probeUrl: `${parsedUrl.origin}/`,
    domain: normalized.domain
  };
}

export function createDiagnosticProbeRule(domain: string, createdAt: string = new Date().toISOString()): DomainRule {
  return {
    domain,
    includeSubdomains: true,
    action: "proxy",
    mode: "proxy",
    source: "diagnostic",
    createdAt
  };
}

export function rulesWithDiagnosticProbe(
  currentRules: readonly DomainRule[],
  domain: string,
  createdAt?: string
): DomainRule[] {
  const probeRule = createDiagnosticProbeRule(domain, createdAt);
  const effectiveRule = findEffectiveDomainRule(probeRule.domain, currentRules);
  const alreadyCoveredByProxyRule = effectiveRule?.rule.action === "proxy";

  return alreadyCoveredByProxyRule ? [...currentRules] : [...currentRules, probeRule];
}

export function buildCurrentSiteDiagnosticPlan(input: {
  url?: string;
  syncSettings: SyncSettings;
  localSettings: LocalSettings;
  createdAt?: string;
}): CurrentSiteDiagnosticPlan {
  const target = getCurrentSiteDiagnosticTarget(input.url);

  if (!target.ok) {
    return target;
  }

  if (isStoredDenylistedDomain(target.domain, input.syncSettings.denylist)) {
    return {
      ok: false,
      response: response(
        "unsupported_url",
        getMessage("popupSyncedDenylistBlocked", [target.domain]),
        target.domain
      )
    };
  }

  if (!hasUsableLocalProxyConfig(input.localSettings)) {
    return {
      ok: false,
      response: response("missing_proxy_config", configureLocalProxyMessage(), target.domain)
    };
  }

  const probeRules = rulesWithDiagnosticProbe(input.syncSettings.rules, target.domain, input.createdAt);
  const pacResult = buildPacScript({
    rules: probeRules,
    localProxyConfig: input.localSettings.deviceProxy.config
  });

  if (!pacResult.ok) {
    return {
      ok: false,
      response: response("missing_proxy_config", configureLocalProxyMessage(), target.domain)
    };
  }

  return {
    ok: true,
    domain: target.domain,
    probeUrl: target.probeUrl,
    pacScript: pacResult.pacScript,
    proxyString: pacResult.proxyString,
    probeRules
  };
}

async function fetchWithTimeout(fetcher: DiagnosticFetch, url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      mode: "no-cors",
      redirect: "follow",
      signal: controller.signal
    });

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function restoreAfterProbe(options: RunCurrentSiteDiagnosticOptions): Promise<CurrentSiteDiagnosticResponse | null> {
  try {
    const restoreResult = await options.restoreProxySettings();

    if (!restoreResult.ok) {
      return response(
        "error",
        getMessage("diagnosticRestoreFailed", [restoreResult.errorMessage])
      );
    }

    return null;
  } catch (error) {
    return response("error", getMessage("diagnosticRestoreFailed", [errorMessage(error)]));
  }
}

export async function runCurrentSiteDiagnostic(
  url: string | undefined,
  options: RunCurrentSiteDiagnosticOptions
): Promise<CurrentSiteDiagnosticResponse> {
  let syncSettings: SyncSettings;
  let localSettings: LocalSettings;

  try {
    [syncSettings, localSettings] = await Promise.all([
      getSyncSettings(options.syncStorage),
      getLocalSettings(options.localStorage)
    ]);
  } catch (error) {
    return response("error", errorMessage(error));
  }

  const plan = buildCurrentSiteDiagnosticPlan({
    url,
    syncSettings,
    localSettings,
    createdAt: options.createdAt
  });

  if (!plan.ok) {
    return plan.response;
  }

  let diagnosticResponse: CurrentSiteDiagnosticResponse = response(
    "error",
    getMessage("diagnosticCheckFailed"),
    plan.domain
  );
  let appliedProbe = false;

  try {
    await options.proxySettings.applyPacScript(plan.pacScript);
    appliedProbe = true;

    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const reachable = await fetchWithTimeout(fetcher, plan.probeUrl, options.timeoutMs ?? defaultDiagnosticTimeoutMs);

    diagnosticResponse = reachable
      ? response("proxy_reachable", reachableMessage(), plan.domain)
      : response("proxy_unreachable", unreachableMessage(), plan.domain);
  } catch (error) {
    diagnosticResponse = response("error", errorMessage(error), plan.domain);
  } finally {
    if (appliedProbe) {
      diagnosticResponse = (await restoreAfterProbe(options)) ?? diagnosticResponse;
    }
  }

  return diagnosticResponse;
}
