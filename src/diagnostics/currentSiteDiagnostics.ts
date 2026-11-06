import { classifyProxyProbeError, type ProxyProbeError } from "./proxyProbeErrors";
import { routeList, routeProxyString, routingEnabled } from "../rules/routes";
import type { ApplyProxySettingsResult, ProxySettingsAdapter } from "../proxy/applyProxySettings";
import { getMessage, setLanguagePreference } from "../i18n/i18n";
import { buildPacScript } from "../proxy/buildPac";
import { canonicalizeHostname } from "../rules/canonicalizeHostname";
import { checkDenylistedHost } from "../rules/denylist";
import { domainMatchesRule, findEffectiveDomainRule } from "../rules/domainMatcher";
import type { DomainRule } from "../rules/ruleTypes";
import { getLocalSettings } from "../storage/localStore";
import { getSyncSettings } from "../storage/syncStore";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../storage/storageTypes";

export const currentSiteDiagnosticMessageType = "smart-proxy-route-helper:run-current-site-diagnostic" as const;

export type CurrentSiteDiagnosticStatus =
  | "certificate_error"
  | "tls_error"
  | "proxy_reachable"
  | "proxy_unreachable"
  | "missing_proxy_config"
  | "unsupported_url"
  | "error";

export type CurrentSiteDiagnosticRequest = {
  type: typeof currentSiteDiagnosticMessageType;
  url?: string;
  routeId?: string;
  tabId?: number;
};

export type CurrentSiteDiagnosticResponse = {
  status: CurrentSiteDiagnosticStatus;
  message: string;
  domain?: string;
  httpsVerified?: boolean;
  errorCode?: string;
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
  routeId?: string;
  verifyPac?: (pacScript: string) => Promise<boolean>;
  observeProxyErrors?: (listener: (error: unknown) => void) => (() => void);
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
    (status === "certificate_error" || status === "tls_error" || status === "proxy_reachable" ||
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

  const normalized = canonicalizeHostname(url);

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
  const canonical = canonicalizeHostname(domain);

  return {
    domain: canonical.ok ? canonical.domain : domain,
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
  routeId?: string;
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

  if (input.routeId !== undefined) {
    if (!routeList(input.syncSettings).some(route => route.id === input.routeId) || !routingEnabled(input.localSettings)) return { ok: false, response: response("missing_proxy_config", getMessage("routesPaused"), target.domain) };
    const selectedProxy = routeProxyString(input.localSettings, input.routeId);
    if (!selectedProxy) return { ok: false, response: response("missing_proxy_config", getMessage("routesMissing"), target.domain) };
    const probeRules = [
      ...input.syncSettings.rules.filter(rule => { const canonical = canonicalizeHostname(rule.domain); return !canonical.ok || canonical.domain !== target.domain; }),
      { ...createDiagnosticProbeRule(target.domain, input.createdAt), includeSubdomains: false, routeId: input.routeId }
    ];
    const routeProxyStrings = Object.fromEntries(routeList(input.syncSettings).map(route => [route.id, routeProxyString(input.localSettings, route.id) ?? "PROXY 127.0.0.1:9"]));
    const pac = buildPacScript({ rules: probeRules, localProxyConfig: null, routeProxyStrings });
    if (!pac.ok) return { ok: false, response: response("error", getMessage("diagnosticCheckFailed"), target.domain) };
    return { ok: true, domain: target.domain, probeUrl: target.probeUrl, pacScript: "// Smart Proxy diagnostic override\n" + pac.pacScript, proxyString: selectedProxy, probeRules };
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

async function fetchWithTimeout(fetcher: DiagnosticFetch, url: string, timeoutMs: number, scoped = false): Promise<"reachable" | "timeout" | "network"> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;
  const deadline = new Promise<"timeout">(resolve => {
    timeoutId = setTimeout(() => { controller.abort(); resolve("timeout"); }, timeoutMs);
  });
  const request = (async (): Promise<"reachable" | "timeout" | "network"> => {
    try {
      await fetcher(url, {
        cache: "no-store", credentials: "omit", mode: "no-cors",
        redirect: scoped ? "manual" : "follow", signal: controller.signal
      });
      return "reachable";
    } catch (error) {
      return controller.signal.aborted || (error instanceof DOMException && error.name === "TimeoutError") ? "timeout" : "network";
    }
  })();
  try { return await Promise.race([request, deadline]); }
  finally { clearTimeout(timeoutId!); }
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

  setLanguagePreference(localSettings.language ?? "auto");
  const plan = buildCurrentSiteDiagnosticPlan({
    url,
    syncSettings,
    localSettings,
    createdAt: options.createdAt,
    routeId: options.routeId
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
  const observed: ProxyProbeError[] = [];
  const stopObserving = options.observeProxyErrors?.(error => {
    const classified = classifyProxyProbeError(error);
    if (classified && observed.length < 8) observed.push(classified);
  });

  try {
    appliedProbe = true;
    await options.proxySettings.applyPacScript(plan.pacScript);

    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const outcome = await fetchWithTimeout(fetcher, plan.probeUrl, options.timeoutMs ?? defaultDiagnosticTimeoutMs, options.routeId !== undefined);

    diagnosticResponse = outcome === "reachable"
      ? response("proxy_reachable", options.routeId ? getMessage("routesTestOk") : reachableMessage(), plan.domain)
      : response("proxy_unreachable", options.routeId ? getMessage("routesTestFail") : unreachableMessage(), plan.domain);
    if (options.routeId) {
      const isHttps = plan.probeUrl.startsWith("https:");
      diagnosticResponse.httpsVerified = isHttps && outcome === "reachable";
      if (outcome === "timeout") diagnosticResponse.message = getMessage("routesTestTimeout");
      if (!isHttps && outcome === "reachable") diagnosticResponse.message = getMessage("routesHttpOnly");
      const chromeError = observed.find(error => error.kind === "certificate") ?? observed[0];
      if (chromeError) {
        diagnosticResponse = {
          status: chromeError.kind === "certificate" ? "certificate_error" : "tls_error",
          message: getMessage(chromeError.kind === "certificate" ? options.routeId === "work" ? "routesCertificateWork" : "routesCertificate" : "routesTlsFailure", [chromeError.code]),
          domain: plan.domain, errorCode: chromeError.code, httpsVerified: false
        };
      } else if (outcome !== "reachable") diagnosticResponse.message += " " + getMessage("routesTlsUnknown");
    }
    if (options.verifyPac && !(await options.verifyPac(plan.pacScript))) diagnosticResponse = response("error", getMessage("routesControlLost"), plan.domain);
  } catch (error) {
    diagnosticResponse = response("error", errorMessage(error), plan.domain);
  } finally {
    stopObserving?.();
    if (appliedProbe) {
      diagnosticResponse = (await restoreAfterProbe(options)) ?? diagnosticResponse;
    }
  }

  return diagnosticResponse;
}
