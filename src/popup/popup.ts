import { checkDenylistedHost } from "../rules/denylist";
import { domainMatchesRule } from "../rules/domainMatcher";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainRule, RuleSource } from "../rules/ruleTypes";
import {
  currentSiteDiagnosticMessageType,
  isCurrentSiteDiagnosticResponse,
  type CurrentSiteDiagnosticResponse
} from "../diagnostics/currentSiteDiagnostics";
import {
  currentPageResourceHostsMessageType,
  isCurrentPageResourceHostsResponse,
  type CurrentPageResourceHostsResponse
} from "../diagnostics/currentPageResourceHosts";
import type { RelatedDomainCandidate } from "../diagnostics/relatedDomainCandidates";
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

export type DiagnosticActionStatus = {
  message: string;
  kind: MessageKind;
  saveReachableDomain?: string;
};

export type RelatedDomainPreviewActionStatus = {
  message: string;
  kind: MessageKind;
};

let checkedReachableDomain: string | null = null;

type ActiveTabSnapshot = {
  id?: number;
  url?: string;
};

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

export function getDiagnosticActionStatus(
  diagnostic: CurrentSiteDiagnosticResponse,
  domain: string,
  routeStatus: PopupRuleStatus
): DiagnosticActionStatus {
  if (diagnostic.status === "proxy_reachable") {
    if (routeStatus.state === "none") {
      return {
        message: "This site appears reachable through your local proxy. You can add it as a synced proxy route.",
        kind: "success",
        saveReachableDomain: diagnostic.domain ?? domain
      };
    }

    return {
      message: "This site appears reachable through your local proxy. A synced rule already covers it.",
      kind: "success"
    };
  }

  if (diagnostic.status === "proxy_unreachable") {
    if (routeStatus.state === "exact" || routeStatus.state === "inherited") {
      return {
        message:
          "A synced rule covers this site, but it did not appear reachable through your local proxy. Check your local proxy settings.",
        kind: "error"
      };
    }

    return {
      message: "This site did not appear reachable through your local proxy.",
      kind: "error"
    };
  }

  return {
    message: diagnostic.message,
    kind: diagnostic.status === "missing_proxy_config" ? "neutral" : "error"
  };
}

function formatCandidateDomains(candidates: readonly RelatedDomainCandidate[], limit = 4): string {
  const domains = candidates.slice(0, limit).map((candidate) => candidate.domain);
  const extraCount = candidates.length - domains.length;

  return extraCount > 0 ? `${domains.join(", ")} and ${extraCount} more` : domains.join(", ");
}

export function getRelatedDomainPreviewActionStatus(
  preview: CurrentPageResourceHostsResponse
): RelatedDomainPreviewActionStatus {
  if (preview.status !== "success") {
    return {
      message: preview.message,
      kind: preview.status === "unsupported_url" ? "error" : "neutral"
    };
  }

  const candidates = preview.candidates;
  const collectedHostCount = preview.collectedHosts?.length ?? 0;

  if (!candidates || collectedHostCount === 0) {
    return {
      message: "No public resource hosts were available for related-domain preview. No rules were saved.",
      kind: "neutral"
    };
  }

  const strongCandidates = candidates.strongCandidates;
  const mediumCandidates = candidates.mediumCandidates;
  const ignoredCount = candidates.ignoredCandidates.length;

  if (strongCandidates.length === 0 && mediumCandidates.length === 0) {
    return {
      message: `${collectedHostCount} public resource host${collectedHostCount === 1 ? "" : "s"} checked. No related-domain candidates were found and no rules were saved.`,
      kind: "neutral"
    };
  }

  const parts: string[] = [];

  if (strongCandidates.length > 0) {
    parts.push(`Likely related: ${formatCandidateDomains(strongCandidates)}`);
  }

  if (mediumCandidates.length > 0) {
    parts.push(`Review manually: ${formatCandidateDomains(mediumCandidates)}`);
  }

  if (ignoredCount > 0) {
    parts.push(`${ignoredCount} analytics or infrastructure host${ignoredCount === 1 ? "" : "s"} ignored`);
  }

  return {
    message: `${parts.join(". ")}. No rules were saved.`,
    kind: "success"
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

function resetRelatedDomainPreview(): void {
  const preview = getElement<HTMLElement>("#related-domain-preview");

  preview.hidden = true;
  preview.textContent = "";
}

async function getActiveTab(): Promise<ActiveTabSnapshot> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return {
    id: tab?.id,
    url: tab?.url
  };
}

async function getActiveTabUrl(): Promise<string | undefined> {
  return (await getActiveTab()).url;
}

function renderUnsupported(result: Extract<CurrentTabDomainResult, { ok: false }>): void {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();
  getElement<HTMLElement>("#current-domain").textContent = "Not available";
  setStatus(getElement<HTMLElement>("#route-status"), result.message, "error");
  setStatus(getElement<HTMLElement>("#action-status"), "Open a regular website tab to add a proxy route.", "neutral");
  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#remove-current-site"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#check-via-proxy"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#preview-related-domains"), false);
}

function renderSupported(domain: string, settings: SyncSettings): void {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();
  const status = getPopupRuleStatus(domain, settings);

  getElement<HTMLElement>("#current-domain").textContent = domain;
  setStatus(getElement<HTMLElement>("#route-status"), status.message, status.state === "blocked" ? "error" : "neutral");
  setStatus(getElement<HTMLElement>("#action-status"), "Use explicit controls to update synced site rules.", "neutral");

  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site"), status.state === "none");
  setButtonVisible(getElement<HTMLButtonElement>("#remove-current-site"), status.state === "exact");
  setButtonVisible(getElement<HTMLButtonElement>("#check-via-proxy"), status.state !== "blocked");
  setButtonVisible(getElement<HTMLButtonElement>("#preview-related-domains"), status.state !== "blocked");
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
  resetRelatedDomainPreview();
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
  resetRelatedDomainPreview();
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

async function requestRelatedDomainPreview(tabId: number, url: string): Promise<CurrentPageResourceHostsResponse> {
  const response = (await chrome.runtime.sendMessage({
    type: currentPageResourceHostsMessageType,
    tabId,
    url
  })) as unknown;

  if (!isCurrentPageResourceHostsResponse(response)) {
    return {
      status: "error",
      message: "Could not preview related domains."
    };
  }

  return response;
}

function renderRelatedDomainPreview(preview: CurrentPageResourceHostsResponse): void {
  const previewElement = getElement<HTMLElement>("#related-domain-preview");
  const candidates = preview.candidates;

  if (preview.status !== "success" || !candidates) {
    resetRelatedDomainPreview();
    return;
  }

  const lines: string[] = [];

  if (candidates.strongCandidates.length > 0) {
    lines.push(`Likely related: ${formatCandidateDomains(candidates.strongCandidates, 8)}`);
  }

  if (candidates.mediumCandidates.length > 0) {
    lines.push(`Review manually: ${formatCandidateDomains(candidates.mediumCandidates, 8)}`);
  }

  if (candidates.ignoredCandidates.length > 0) {
    lines.push(`Ignored: ${formatCandidateDomains(candidates.ignoredCandidates, 8)}`);
  }

  if (lines.length === 0) {
    resetRelatedDomainPreview();
    return;
  }

  previewElement.textContent = lines.join("\n");
  previewElement.hidden = false;
}

async function handleCheckViaProxy(): Promise<void> {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();

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
    const routeStatus = getPopupRuleStatus(result.domain, current);
    const diagnosticActionStatus = getDiagnosticActionStatus(diagnostic, result.domain, routeStatus);

    if (diagnosticActionStatus.saveReachableDomain) {
      checkedReachableDomain = diagnosticActionStatus.saveReachableDomain;
      setButtonVisible(getElement<HTMLButtonElement>("#save-diagnostic-rule"), true);
    }

    setStatus(actionStatus, diagnosticActionStatus.message, diagnosticActionStatus.kind);
  } finally {
    checkButton.disabled = false;
  }
}

async function handlePreviewRelatedDomains(): Promise<void> {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();

  const activeTab = await getActiveTab();
  const result = getCurrentTabDomain(activeTab.url);
  const actionStatus = getElement<HTMLElement>("#action-status");
  const previewButton = getElement<HTMLButtonElement>("#preview-related-domains");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  if (typeof activeTab.id !== "number" || !activeTab.url) {
    setStatus(actionStatus, "Open a supported site before previewing related domains.", "error");
    return;
  }

  previewButton.disabled = true;
  setStatus(actionStatus, "Previewing related domains from current-page resources...", "neutral");

  try {
    const preview = await requestRelatedDomainPreview(activeTab.id, activeTab.url);
    const previewStatus = getRelatedDomainPreviewActionStatus(preview);

    renderRelatedDomainPreview(preview);
    setStatus(actionStatus, previewStatus.message, previewStatus.kind);
  } finally {
    previewButton.disabled = false;
  }
}

async function handleSaveDiagnosticRule(): Promise<void> {
  const domain = checkedReachableDomain;
  const actionStatus = getElement<HTMLElement>("#action-status");
  resetRelatedDomainPreview();

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

  getElement<HTMLButtonElement>("#preview-related-domains").addEventListener("click", () => {
    void handlePreviewRelatedDomains().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : "Could not preview related domains.",
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
