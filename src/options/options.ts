import { supportedLocalProxySchemes, validateLocalProxyConfig } from "../proxy/proxyConfig";
import type { LocalProxyConfig, LocalProxyScheme } from "../proxy/proxyConfig";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainRule } from "../rules/ruleTypes";
import { getLocalSettings, updateLocalSettings } from "../storage/localStore";
import { getSyncSettings, updateSyncSettings } from "../storage/syncStore";
import type { DeviceProxySettings, LocalSettings, SyncSettings } from "../storage/storageTypes";

const suggestedLocalProxyConfig: LocalProxyConfig = {
  scheme: "socks5",
  host: "127.0.0.1",
  port: 10808
};

type FieldErrors = Partial<Record<"scheme" | "host" | "port" | "domain", string>>;

export type LocalProxyFormInput = {
  enabled: boolean;
  scheme: string;
  host: string;
  port: string;
};

export type LocalProxyFormResult =
  | {
      ok: true;
      deviceProxy: DeviceProxySettings;
    }
  | {
      ok: false;
      errors: FieldErrors;
    };

export type AddRuleResult =
  | {
      ok: true;
      rules: DomainRule[];
      normalizedDomain: string;
      status: "added" | "duplicate";
    }
  | {
      ok: false;
      error: string;
    };

function isLocalProxyScheme(input: string): input is LocalProxyScheme {
  return supportedLocalProxySchemes.includes(input as LocalProxyScheme);
}

function hasBlankProxyConfig(input: LocalProxyFormInput): boolean {
  return input.scheme.trim() === "" && input.host.trim() === "" && input.port.trim() === "";
}

function proxyValidationErrorField(errorCode: string): keyof FieldErrors {
  if (errorCode === "invalid-scheme") {
    return "scheme";
  }

  if (errorCode === "invalid-port") {
    return "port";
  }

  return "host";
}

export function parseLocalProxyForm(input: LocalProxyFormInput): LocalProxyFormResult {
  if (!input.enabled && hasBlankProxyConfig(input)) {
    return {
      ok: true,
      deviceProxy: {
        enabled: false,
        config: null
      }
    };
  }

  const port = Number(input.port);
  const validation = validateLocalProxyConfig({
    scheme: isLocalProxyScheme(input.scheme) ? input.scheme : input.scheme.trim(),
    host: input.host,
    port
  });

  if (!validation.ok) {
    return {
      ok: false,
      errors: {
        [proxyValidationErrorField(validation.error.code)]: validation.error.message
      }
    };
  }

  return {
    ok: true,
    deviceProxy: {
      enabled: input.enabled,
      config: validation.config
    }
  };
}

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": "Internal browser pages cannot be routed.",
    localhost: "Localhost cannot be routed.",
    "loopback-ip": "Loopback addresses cannot be routed.",
    "private-ip": "Private network addresses cannot be routed.",
    "internal-suffix": "Internal local domains cannot be routed.",
    "single-label-host": "Enter a public domain with a dot.",
    "invalid-host": "Enter a valid domain or URL."
  };

  return messages[reason] ?? "This domain cannot be routed.";
}

export function addDomainRule(
  currentRules: readonly DomainRule[],
  input: string,
  includeSubdomains: boolean,
  createdAt: string = new Date().toISOString()
): AddRuleResult {
  const normalized = normalizeDomain(input);

  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error.message
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      error: denylistMessage(denylist.reason)
    };
  }

  const duplicate = currentRules.some(
    (rule) => rule.domain === normalized.domain && rule.includeSubdomains === includeSubdomains
  );

  if (duplicate) {
    return {
      ok: true,
      rules: [...currentRules],
      normalizedDomain: normalized.domain,
      status: "duplicate"
    };
  }

  return {
    ok: true,
    rules: [
      ...currentRules,
      {
        domain: normalized.domain,
        includeSubdomains,
        mode: "proxy",
        source: "manual",
        createdAt
      }
    ],
    normalizedDomain: normalized.domain,
    status: "added"
  };
}

export function removeRuleAtIndex(currentRules: readonly DomainRule[], index: number): DomainRule[] {
  if (!Number.isInteger(index) || index < 0 || index >= currentRules.length) {
    return [...currentRules];
  }

  return currentRules.filter((_, ruleIndex) => ruleIndex !== index);
}

function getElement<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing options page element: ${selector}`);
  }

  return element;
}

function setStatus(element: HTMLElement, message: string, kind: "success" | "error" | "neutral" = "neutral"): void {
  element.textContent = message;
  element.dataset.kind = kind;
}

function setError(selector: string, message = ""): void {
  getElement<HTMLElement>(selector).textContent = message;
}

function clearProxyErrors(): void {
  setError("#proxy-scheme-error");
  setError("#proxy-host-error");
  setError("#proxy-port-error");
}

function renderLocalSettings(settings: LocalSettings): void {
  const config = settings.deviceProxy.config ?? suggestedLocalProxyConfig;

  getElement<HTMLInputElement>("#proxy-enabled").checked = settings.deviceProxy.enabled;
  getElement<HTMLSelectElement>("#proxy-scheme").value = config.scheme;
  getElement<HTMLInputElement>("#proxy-host").value = config.host;
  getElement<HTMLInputElement>("#proxy-port").value = String(config.port);
}

function localProxyFormInput(): LocalProxyFormInput {
  return {
    enabled: getElement<HTMLInputElement>("#proxy-enabled").checked,
    scheme: getElement<HTMLSelectElement>("#proxy-scheme").value,
    host: getElement<HTMLInputElement>("#proxy-host").value,
    port: getElement<HTMLInputElement>("#proxy-port").value
  };
}

function renderRules(settings: SyncSettings): void {
  const list = getElement<HTMLUListElement>("#rule-list");
  list.replaceChildren();

  if (settings.rules.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No synced proxy rules yet.";
    list.append(empty);
    return;
  }

  settings.rules.forEach((rule, index) => {
    const item = document.createElement("li");
    item.className = "rule-item";

    const summary = document.createElement("div");
    const domain = document.createElement("div");
    domain.className = "rule-domain";
    domain.textContent = rule.domain;

    const metadata = document.createElement("div");
    metadata.className = "metadata";
    metadata.textContent = [
      `mode: ${rule.mode}`,
      `source: ${rule.source}`,
      rule.includeSubdomains ? "includes subdomains" : "exact domain only"
    ].join(" · ");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.dataset.ruleIndex = String(index);
    removeButton.setAttribute("aria-label", `Remove ${rule.domain}`);

    summary.append(domain, metadata);
    item.append(summary, removeButton);
    list.append(item);
  });
}

function renderStoredLists(settings: SyncSettings): void {
  const summary = getElement<HTMLElement>("#denylist-summary");
  const denylistText =
    settings.denylist.length > 0 ? `Denylist: ${settings.denylist.join(", ")}` : "Denylist: no stored entries.";
  const ignoredText =
    settings.ignoredDomains.length > 0
      ? `Ignored domains: ${settings.ignoredDomains.join(", ")}`
      : "Ignored domains: no stored entries.";

  summary.textContent = `${denylistText} ${ignoredText}`;
}

async function refreshSyncView(): Promise<SyncSettings> {
  const settings = await getSyncSettings();
  renderRules(settings);
  renderStoredLists(settings);
  return settings;
}

async function handleLocalProxySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  clearProxyErrors();

  const status = getElement<HTMLElement>("#local-proxy-status");
  const parsed = parseLocalProxyForm(localProxyFormInput());

  if (!parsed.ok) {
    setError("#proxy-scheme-error", parsed.errors.scheme);
    setError("#proxy-host-error", parsed.errors.host);
    setError("#proxy-port-error", parsed.errors.port);
    setStatus(status, "Fix the highlighted local proxy setting before saving.", "error");
    return;
  }

  await updateLocalSettings((current) => ({
    ...current,
    deviceProxy: parsed.deviceProxy
  }));

  setStatus(status, "Local proxy settings saved on this device.", "success");
}

async function handleRuleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  setError("#rule-domain-error");

  const status = getElement<HTMLElement>("#rule-status");
  const input = getElement<HTMLInputElement>("#rule-domain");
  const includeSubdomains = getElement<HTMLInputElement>("#rule-subdomains").checked;
  const current = await getSyncSettings();
  const addResult = addDomainRule(current.rules, input.value, includeSubdomains);

  if (!addResult.ok) {
    const message = addResult.error;
    setError("#rule-domain-error", message);
    setStatus(status, message, "error");
    renderRules(current);
    renderStoredLists(current);
    return;
  }

  const updated =
    addResult.status === "duplicate"
      ? current
      : await updateSyncSettings({
          rules: addResult.rules
        });

  renderRules(updated);
  renderStoredLists(updated);

  if (addResult.status === "duplicate") {
    setStatus(status, `${addResult.normalizedDomain} is already in synced rules.`, "neutral");
    return;
  }

  input.value = "";
  setStatus(status, `Added synced rule for ${addResult.normalizedDomain}.`, "success");
}

async function handleRuleListClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-rule-index]");

  if (!button) {
    return;
  }

  const index = Number(button.dataset.ruleIndex);
  const updated = await updateSyncSettings((current) => ({
    ...current,
    rules: removeRuleAtIndex(current.rules, index)
  }));

  renderRules(updated);
  renderStoredLists(updated);
  setStatus(getElement<HTMLElement>("#rule-status"), "Synced rule removed.", "success");
}

async function initOptionsPage(): Promise<void> {
  const [localSettings] = await Promise.all([getLocalSettings(), refreshSyncView()]);
  renderLocalSettings(localSettings);
  setStatus(getElement<HTMLElement>("#local-proxy-status"), "Loaded local settings.", "neutral");
  setStatus(getElement<HTMLElement>("#rule-status"), "Loaded synced rules.", "neutral");

  getElement<HTMLFormElement>("#local-proxy-form").addEventListener("submit", (event) => {
    void handleLocalProxySubmit(event);
  });
  getElement<HTMLFormElement>("#rule-form").addEventListener("submit", (event) => {
    void handleRuleSubmit(event);
  });
  getElement<HTMLUListElement>("#rule-list").addEventListener("click", (event) => {
    void handleRuleListClick(event);
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    void initOptionsPage().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#local-proxy-status"),
        error instanceof Error ? error.message : "Could not load options.",
        "error"
      );
    });
  });
}
