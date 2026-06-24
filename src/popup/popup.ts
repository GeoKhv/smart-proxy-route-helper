import { checkDenylistedHost } from "../rules/denylist";
import { domainMatchesRule } from "../rules/domainMatcher";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainRule, RuleSource } from "../rules/ruleTypes";
import {
  currentSiteDiagnosticMessageType,
  isCurrentSiteDiagnosticResponse,
  type CurrentSiteDiagnosticResponse
} from "../diagnostics/currentSiteDiagnostics";
import { getSyncSettings, updateSyncSettings } from "../storage/syncStore";
import type { SyncSettings } from "../storage/storageTypes";

type MessageKind = "success" | "error" | "neutral";

export type CurrentTabDomainResult =
  | {
      ok: true;
      domain: string;
    }
  | {
      ok: false;
      message: string;
    };

export type PopupRuleStatus =
  | {
      state: "blocked";
      message: string;
    }
  | {
      state: "exact";
      exactRule: DomainRule;
      message: string;
    }
  | {
      state: "inherited";
      parentRule: DomainRule;
      message: string;
    }
  | {
      state: "none";
      message: string;
    };

export type AddCurrentSiteRuleResult =
  | {
      ok: true;
      status: "added" | "duplicate" | "inherited";
      rules: DomainRule[];
      domain: string;
      parentRule?: DomainRule;
    }
  | {
      ok: false;
      error: string;
    };

export type RemoveCurrentSiteRuleResult = {
  status: "removed" | "not-found" | "inherited";
  rules: DomainRule[];
  domain: string;
  parentRule?: DomainRule;
};

let checkedReachableDomain: string | null = null;

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": "Internal browser pages cannot be routed.",
    localhost: "Localhost cannot be routed.",
    "loopback-ip": "Loopback addresses cannot be routed.",
    "private-ip": "Private network addresses cannot be routed.",
    "internal-suffix": "Internal local domains cannot be routed.",
    "single-label-host": "Open a public domain with a dot to manage a site rule.",
    "invalid-host": "Open a valid http or https site to manage a rule."
  };

  return messages[reason] ?? "This site cannot be routed.";
}

function unsupportedUrlMessage(url: string): string {
  let protocol = "";

  try {
    protocol = new URL(url).protocol.replace(/:$/, "");
  } catch {
    return "Open a valid http or https site to manage a rule.";
  }

  const protocolLabel = protocol ? `${protocol}://` : "This page";

  return `${protocolLabel} pages cannot be routed. Open an http or https site first.`;
}

function normalizeKnownDomain(input: string): string | null {
  const normalized = normalizeDomain(input);

  return normalized.ok ? normalized.domain : null;
}

function exactRuleForDomain(domain: string, rules: readonly DomainRule[]): DomainRule | undefined {
  return rules.find((rule) => normalizeKnownDomain(rule.domain) === domain);
}

function parentRuleForDomain(domain: string, rules: readonly DomainRule[]): DomainRule | undefined {
  return rules.find((rule) => {
    const ruleDomain = normalizeKnownDomain(rule.domain);

    return ruleDomain !== null && ruleDomain !== domain && domainMatchesRule(domain, rule);
  });
}

function isStoredDenylistedDomain(domain: string, denylist: readonly string[]): boolean {
  return denylist.some((entry) => domainMatchesRule(domain, { domain: entry, includeSubdomains: true }));
}

export function getCurrentTabDomain(url: string | undefined): CurrentTabDomainResult {
  if (!url) {
    return {
      ok: false,
      message: "Open a supported site to manage a proxy routing rule."
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      message: "Open a valid http or https site to manage a rule."
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      message: unsupportedUrlMessage(url)
    };
  }

  const normalized = normalizeDomain(url);

  if (!normalized.ok) {
    return {
      ok: false,
      message: normalized.error.message
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      message: denylistMessage(denylist.reason)
    };
  }

  return {
    ok: true,
    domain: normalized.domain
  };
}

export function getPopupRuleStatus(domain: string, settings: Pick<SyncSettings, "rules" | "denylist">): PopupRuleStatus {
  const builtInDenylist = checkDenylistedHost(domain);

  if (builtInDenylist.denied) {
    return {
      state: "blocked",
      message: denylistMessage(builtInDenylist.reason)
    };
  }

  if (isStoredDenylistedDomain(domain, settings.denylist)) {
    return {
      state: "blocked",
      message: `${domain} is blocked by the synced denylist. Open Options to review stored lists.`
    };
  }

  const exactRule = exactRuleForDomain(domain, settings.rules);

  if (exactRule) {
    return {
      state: "exact",
      exactRule,
      message: `${domain} is routed through proxy by an exact synced rule.`
    };
  }

  const parentRule = parentRuleForDomain(domain, settings.rules);

  if (parentRule) {
    return {
      state: "inherited",
      parentRule,
      message: `${domain} is routed through proxy by the parent rule ${parentRule.domain}. Open Options to edit it.`
    };
  }

  return {
    state: "none",
    message: `${domain} is using the direct route unless another proxy setting applies.`
  };
}

export function addCurrentSiteRule(
  currentRules: readonly DomainRule[],
  input: string,
  createdAt: string = new Date().toISOString(),
  source: RuleSource = "manual"
): AddCurrentSiteRuleResult {
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

  if (exactRuleForDomain(normalized.domain, currentRules)) {
    return {
      ok: true,
      status: "duplicate",
      rules: [...currentRules],
      domain: normalized.domain
    };
  }

  const parentRule = parentRuleForDomain(normalized.domain, currentRules);

  if (parentRule) {
    return {
      ok: true,
      status: "inherited",
      rules: [...currentRules],
      domain: normalized.domain,
      parentRule
    };
  }

  return {
    ok: true,
    status: "added",
    rules: [
      ...currentRules,
      {
        domain: normalized.domain,
        includeSubdomains: true,
        mode: "proxy",
        source,
        createdAt
      }
    ],
    domain: normalized.domain
  };
}

export function removeCurrentSiteRule(currentRules: readonly DomainRule[], input: string): RemoveCurrentSiteRuleResult {
  const normalized = normalizeDomain(input);
  const domain = normalized.ok ? normalized.domain : input.trim().toLowerCase();
  const exactRule = exactRuleForDomain(domain, currentRules);

  if (exactRule) {
    return {
      status: "removed",
      rules: currentRules.filter((rule) => normalizeKnownDomain(rule.domain) !== domain),
      domain
    };
  }

  const parentRule = parentRuleForDomain(domain, currentRules);

  if (parentRule) {
    return {
      status: "inherited",
      rules: [...currentRules],
      domain,
      parentRule
    };
  }

  return {
    status: "not-found",
    rules: [...currentRules],
    domain
  };
}

function getElement<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing popup element: ${selector}`);
  }

  return element;
}

function setStatus(element: HTMLElement, message: string, kind: MessageKind = "neutral"): void {
  element.textContent = message;
  element.dataset.kind = kind;
}

function setButtonVisible(button: HTMLButtonElement, visible: boolean): void {
  button.hidden = !visible;
}

function resetDiagnosticOffer(): void {
  checkedReachableDomain = null;
  setButtonVisible(getElement<HTMLButtonElement>("#save-diagnostic-rule"), false);
}

async function getActiveTabUrl(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab?.url;
}

function renderUnsupported(result: Extract<CurrentTabDomainResult, { ok: false }>): void {
  resetDiagnosticOffer();
  getElement<HTMLElement>("#current-domain").textContent = "Not available";
  setStatus(getElement<HTMLElement>("#route-status"), result.message, "error");
  setStatus(getElement<HTMLElement>("#action-status"), "Open a regular website tab to add a proxy route.", "neutral");
  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#remove-current-site"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#check-via-proxy"), false);
}

function renderSupported(domain: string, settings: SyncSettings): void {
  resetDiagnosticOffer();
  const status = getPopupRuleStatus(domain, settings);

  getElement<HTMLElement>("#current-domain").textContent = domain;
  setStatus(getElement<HTMLElement>("#route-status"), status.message, status.state === "blocked" ? "error" : "neutral");
  setStatus(getElement<HTMLElement>("#action-status"), "Use explicit controls to update synced site rules.", "neutral");

  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site"), status.state === "none");
  setButtonVisible(getElement<HTMLButtonElement>("#remove-current-site"), status.state === "exact");
  setButtonVisible(getElement<HTMLButtonElement>("#check-via-proxy"), status.state !== "blocked");
}

async function refreshPopup(): Promise<CurrentTabDomainResult> {
  const result = getCurrentTabDomain(await getActiveTabUrl());

  if (!result.ok) {
    renderUnsupported(result);
    return result;
  }

  const settings = await getSyncSettings();
  renderSupported(result.domain, settings);
  return result;
}

async function handleAddCurrentSite(): Promise<void> {
  resetDiagnosticOffer();
  const result = getCurrentTabDomain(await getActiveTabUrl());
  const actionStatus = getElement<HTMLElement>("#action-status");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  const current = await getSyncSettings();
  const addResult = addCurrentSiteRule(current.rules, result.domain);

  if (!addResult.ok) {
    setStatus(actionStatus, addResult.error, "error");
    return;
  }

  if (addResult.status === "duplicate") {
    renderSupported(result.domain, current);
    setStatus(actionStatus, `${addResult.domain} already has a synced rule.`, "neutral");
    return;
  }

  if (addResult.status === "inherited") {
    renderSupported(result.domain, current);
    setStatus(
      actionStatus,
      `${addResult.domain} is already routed by parent rule ${addResult.parentRule?.domain}. Open Options to edit it.`,
      "neutral"
    );
    return;
  }

  const updated = await updateSyncSettings({
    rules: addResult.rules
  });

  renderSupported(result.domain, updated);
  setStatus(actionStatus, `Added synced proxy route for ${addResult.domain}.`, "success");
}

async function handleRemoveCurrentSite(): Promise<void> {
  resetDiagnosticOffer();
  const result = getCurrentTabDomain(await getActiveTabUrl());
  const actionStatus = getElement<HTMLElement>("#action-status");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  const current = await getSyncSettings();
  const removeResult = removeCurrentSiteRule(current.rules, result.domain);

  if (removeResult.status === "inherited") {
    renderSupported(result.domain, current);
    setStatus(
      actionStatus,
      `${removeResult.domain} is routed by parent rule ${removeResult.parentRule?.domain}. Open Options to edit parent rules.`,
      "neutral"
    );
    return;
  }

  if (removeResult.status === "not-found") {
    renderSupported(result.domain, current);
    setStatus(actionStatus, `No exact synced rule for ${removeResult.domain}.`, "neutral");
    return;
  }

  const updated = await updateSyncSettings({
    rules: removeResult.rules
  });

  renderSupported(result.domain, updated);
  setStatus(actionStatus, `Removed exact synced rule for ${removeResult.domain}.`, "success");
}

async function requestCurrentSiteDiagnostic(url: string): Promise<CurrentSiteDiagnosticResponse> {
  const response = (await chrome.runtime.sendMessage({
    type: currentSiteDiagnosticMessageType,
    url
  })) as unknown;

  if (!isCurrentSiteDiagnosticResponse(response)) {
    return {
      status: "error",
      message: "Could not complete the proxy check."
    };
  }

  return response;
}

async function handleCheckViaProxy(): Promise<void> {
  resetDiagnosticOffer();

  const activeUrl = await getActiveTabUrl();
  const result = getCurrentTabDomain(activeUrl);
  const actionStatus = getElement<HTMLElement>("#action-status");
  const checkButton = getElement<HTMLButtonElement>("#check-via-proxy");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  if (!activeUrl) {
    setStatus(actionStatus, "Open a supported site before checking proxy reachability.", "error");
    return;
  }

  checkButton.disabled = true;
  setStatus(actionStatus, "Checking via your configured local proxy...", "neutral");

  try {
    const diagnostic = await requestCurrentSiteDiagnostic(activeUrl);
    const current = await getSyncSettings();
    renderSupported(result.domain, current);

    if (diagnostic.status === "proxy_reachable") {
      const routeStatus = getPopupRuleStatus(result.domain, current);

      if (routeStatus.state === "none") {
        checkedReachableDomain = diagnostic.domain ?? result.domain;
        setButtonVisible(getElement<HTMLButtonElement>("#save-diagnostic-rule"), true);
        setStatus(
          actionStatus,
          "This site appears reachable through your local proxy. You can add it as a synced proxy route.",
          "success"
        );
        return;
      }

      setStatus(
        actionStatus,
        "This site appears reachable through your local proxy. A synced rule already covers it.",
        "success"
      );
      return;
    }

    if (diagnostic.status === "proxy_unreachable") {
      setStatus(actionStatus, "This site did not appear reachable through your local proxy.", "error");
      return;
    }

    setStatus(actionStatus, diagnostic.message, diagnostic.status === "missing_proxy_config" ? "neutral" : "error");
  } finally {
    checkButton.disabled = false;
  }
}

async function handleSaveDiagnosticRule(): Promise<void> {
  const domain = checkedReachableDomain;
  const actionStatus = getElement<HTMLElement>("#action-status");

  if (!domain) {
    setStatus(actionStatus, "Run a successful proxy check before adding a diagnostic rule.", "neutral");
    return;
  }

  const currentResult = getCurrentTabDomain(await getActiveTabUrl());

  if (!currentResult.ok || currentResult.domain !== domain) {
    resetDiagnosticOffer();
    setStatus(actionStatus, "Run the proxy check again for the current site before adding a rule.", "error");
    return;
  }

  const current = await getSyncSettings();
  const addResult = addCurrentSiteRule(current.rules, domain, new Date().toISOString(), "diagnostic");

  if (!addResult.ok) {
    setStatus(actionStatus, addResult.error, "error");
    return;
  }

  if (addResult.status === "duplicate") {
    renderSupported(domain, current);
    setStatus(actionStatus, `${addResult.domain} already has a synced rule.`, "neutral");
    return;
  }

  if (addResult.status === "inherited") {
    renderSupported(domain, current);
    setStatus(
      actionStatus,
      `${addResult.domain} is already routed by parent rule ${addResult.parentRule?.domain}. Open Options to edit it.`,
      "neutral"
    );
    return;
  }

  const updated = await updateSyncSettings({
    rules: addResult.rules
  });

  renderSupported(domain, updated);
  setStatus(actionStatus, `Added synced proxy route for ${addResult.domain}.`, "success");
}

function initPopupPage(): void {
  getElement<HTMLButtonElement>("#add-current-site").addEventListener("click", () => {
    void handleAddCurrentSite().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : "Could not add the current site.",
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#remove-current-site").addEventListener("click", () => {
    void handleRemoveCurrentSite().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : "Could not remove the current site.",
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#check-via-proxy").addEventListener("click", () => {
    void handleCheckViaProxy().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : "Could not complete the proxy check.",
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#save-diagnostic-rule").addEventListener("click", () => {
    void handleSaveDiagnosticRule().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : "Could not add the checked site.",
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  void refreshPopup().catch((error: unknown) => {
    setStatus(
      getElement<HTMLElement>("#route-status"),
      error instanceof Error ? error.message : "Could not load the current site.",
      "error"
    );
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initPopupPage);
}
