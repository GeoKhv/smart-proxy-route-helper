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
  type CurrentPageResourceHostPreviewSummary,
  type CurrentPageResourceHostResultState,
  type CurrentPageResourceHostsResponse
} from "../diagnostics/currentPageResourceHosts";
import type { RelatedDomainCandidate, RelatedDomainCandidateReason } from "../diagnostics/relatedDomainCandidates";
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

export type RelatedDomainPopupResultState =
  | CurrentPageResourceHostResultState
  | "hosts_collected_but_all_already_covered";

export type RelatedDomainCandidateCategory = "strong" | "medium" | "ignored";

export type RelatedDomainCandidateGroupKey = "strong" | "medium" | "alreadyCovered" | "ignored";

export type RelatedDomainCandidateView = {
  category: RelatedDomainCandidateCategory;
  domain: string;
  reasonCode: RelatedDomainCandidateReason;
  reason: string;
  sourceHostCount: number;
  includeSubdomains: boolean;
  defaultSelected: boolean;
  selected: boolean;
  saveable: boolean;
  alreadyCovered: boolean;
  coveredBy?: string;
};

export type RelatedDomainPopupSummary = CurrentPageResourceHostPreviewSummary & {
  alreadyCoveredCandidates: number;
  saveableCandidates: number;
};

export type RelatedDomainPopupView = {
  message: string;
  kind: MessageKind;
  resultState?: RelatedDomainPopupResultState;
  summary?: RelatedDomainPopupSummary;
  diagnosticSummary?: string;
  candidates: RelatedDomainCandidateView[];
  hiddenSaveableCount: number;
  hiddenAlreadyCoveredCount: number;
  hiddenIgnoredCount: number;
};

export type AddSelectedRelatedDomainRulesResult =
  | {
      ok: true;
      status: "added";
      rules: DomainRule[];
      addedRules: DomainRule[];
      skippedDomains: string[];
    }
  | {
      ok: true;
      status: "none-selected" | "no-new-rules";
      rules: DomainRule[];
      addedRules: [];
      skippedDomains: string[];
    }
  | {
      ok: false;
      error: string;
    };

let checkedReachableDomain: string | null = null;
let relatedDomainCandidateViews: RelatedDomainCandidateView[] = [];
let relatedDomainPreviewDomain: string | null = null;

const relatedDomainSaveableCandidateLimit = 12;
const relatedDomainAlreadyCoveredCandidateLimit = 6;
const relatedDomainIgnoredCandidateLimit = 4;

const relatedDomainReasonLabels: Record<RelatedDomainCandidateReason, string> = {
  "same-site-subdomain": "same site resources",
  "explicit-related-domain": "known related domain",
  "third-party-resource": "resource on current page",
  "known-tracking-or-analytics": "analytics or tracking host",
  "shared-infrastructure": "shared infrastructure",
  "local-or-adblock-helper": "local or adblock helper",
  "system-or-schema-helper": "system or schema helper"
};

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

function normalizeSafeRelatedDomain(input: string, denylist: readonly string[] = []): string | null {
  const normalized = normalizeDomain(input);

  if (!normalized.ok) {
    return null;
  }

  if (checkDenylistedHost(normalized.domain).denied || isStoredDenylistedDomain(normalized.domain, denylist)) {
    return null;
  }

  return normalized.domain;
}

function findCoveringRule(domain: string, rules: readonly DomainRule[]): DomainRule | undefined {
  return exactRuleForDomain(domain, rules) ?? parentRuleForDomain(domain, rules);
}

function candidateViewFromCandidate(
  candidate: RelatedDomainCandidate,
  category: RelatedDomainCandidateCategory,
  settings: Pick<SyncSettings, "rules" | "denylist">
): RelatedDomainCandidateView | null {
  const domain = normalizeSafeRelatedDomain(candidate.domain, settings.denylist);

  if (!domain) {
    return null;
  }

  const coveringRule = findCoveringRule(domain, settings.rules);
  const alreadyCovered = coveringRule !== undefined;
  const saveable = category !== "ignored" && !alreadyCovered;
  const defaultSelected = category === "strong" && candidate.defaultSelected && saveable;

  return {
    category,
    domain,
    reasonCode: candidate.reason,
    reason: relatedDomainReasonLabels[candidate.reason],
    sourceHostCount: candidate.sourceHostCount,
    includeSubdomains: candidate.suggestedIncludeSubdomains,
    defaultSelected,
    selected: defaultSelected,
    saveable,
    alreadyCovered,
    ...(coveringRule ? { coveredBy: coveringRule.domain } : {})
  };
}

function cappedRelatedDomainCandidateViews(
  candidates: readonly RelatedDomainCandidateView[]
): {
  candidates: RelatedDomainCandidateView[];
  hiddenSaveableCount: number;
  hiddenAlreadyCoveredCount: number;
  hiddenIgnoredCount: number;
} {
  const saveableCandidates = candidates.filter((candidate) => candidate.saveable);
  const alreadyCoveredCandidates = candidates.filter(
    (candidate) => candidate.category !== "ignored" && candidate.alreadyCovered
  );
  const ignoredCandidates = candidates.filter((candidate) => candidate.category === "ignored");
  const visibleSaveableCandidates = saveableCandidates.slice(0, relatedDomainSaveableCandidateLimit);
  const visibleAlreadyCoveredCandidates = alreadyCoveredCandidates.slice(0, relatedDomainAlreadyCoveredCandidateLimit);
  const visibleIgnoredCandidates = ignoredCandidates.slice(0, relatedDomainIgnoredCandidateLimit);

  return {
    candidates: [...visibleSaveableCandidates, ...visibleAlreadyCoveredCandidates, ...visibleIgnoredCandidates],
    hiddenSaveableCount: Math.max(0, saveableCandidates.length - visibleSaveableCandidates.length),
    hiddenAlreadyCoveredCount: Math.max(
      0,
      alreadyCoveredCandidates.length - visibleAlreadyCoveredCandidates.length
    ),
    hiddenIgnoredCount: Math.max(0, ignoredCandidates.length - visibleIgnoredCandidates.length)
  };
}

export function groupRelatedDomainCandidateViews(
  candidates: readonly RelatedDomainCandidateView[]
): Record<RelatedDomainCandidateGroupKey, RelatedDomainCandidateView[]> {
  return {
    strong: candidates.filter((candidate) => candidate.category === "strong" && candidate.saveable),
    medium: candidates.filter((candidate) => candidate.category === "medium" && candidate.saveable),
    alreadyCovered: candidates.filter((candidate) => candidate.category !== "ignored" && candidate.alreadyCovered),
    ignored: candidates.filter((candidate) => candidate.category === "ignored")
  };
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

function formatCandidateViewDomains(candidates: readonly RelatedDomainCandidateView[], limit = 4): string {
  const domains = candidates.slice(0, limit).map((candidate) => candidate.domain);
  const extraCount = candidates.length - domains.length;

  return extraCount > 0 ? `${domains.join(", ")} and ${extraCount} more` : domains.join(", ");
}

function emptyPreviewSummary(): CurrentPageResourceHostPreviewSummary {
  return {
    rawEntriesInspected: 0,
    performanceEntriesInspected: 0,
    domAttributesInspected: 0,
    urlLikeValuesFound: 0,
    hostsExtracted: 0,
    hostsAfterSanitization: 0,
    hostsIgnoredOrInternal: 0,
    reviewableCandidates: 0,
    ignoredCandidates: 0,
    sampleHosts: []
  };
}

function previewSummary(preview: CurrentPageResourceHostsResponse): CurrentPageResourceHostPreviewSummary {
  if (preview.summary) {
    return preview.summary;
  }

  const hostsAfterSanitization = preview.collectedHosts?.length ?? 0;
  const reviewableCandidates =
    (preview.candidates?.strongCandidates.length ?? 0) + (preview.candidates?.mediumCandidates.length ?? 0);

  return {
    ...emptyPreviewSummary(),
    rawEntriesInspected: hostsAfterSanitization,
    hostsExtracted: hostsAfterSanitization,
    hostsAfterSanitization,
    reviewableCandidates,
    ignoredCandidates: preview.candidates?.ignoredCandidates.length ?? 0
  };
}

function formatPreviewDiagnosticSummary(summary: RelatedDomainPopupSummary): string {
  const parts = [
    `${summary.rawEntriesInspected} inspected`,
    `${summary.performanceEntriesInspected ?? 0} performance`,
    `${summary.domAttributesInspected ?? 0} DOM attributes`,
    `${summary.urlLikeValuesFound ?? summary.hostsExtracted} URL-like values`,
    `${summary.hostsAfterSanitization} sanitized hosts`,
    `${summary.hostsIgnoredOrInternal} ignored or internal`,
    `${summary.alreadyCoveredCandidates} already covered`,
    `${summary.saveableCandidates} saveable`
  ];
  const hostSample =
    summary.sampleHosts && summary.sampleHosts.length > 0 ? ` Hosts: ${summary.sampleHosts.slice(0, 5).join(", ")}.` : "";

  return `Preview details: ${parts.join("; ")}.${hostSample}`;
}

function previewDiagnosticSummary(summary: RelatedDomainPopupSummary): string | undefined {
  return summary.saveableCandidates === 0 ? formatPreviewDiagnosticSummary(summary) : undefined;
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
  const summary = previewSummary(preview);

  if (
    preview.resultState === "no_resource_entries_collected" ||
    (summary.rawEntriesInspected === 0 && summary.hostsAfterSanitization === 0)
  ) {
    return {
      message: "No page resource hosts were found. Try reloading the page, then preview again.",
      kind: "neutral"
    };
  }

  if (!candidates) {
    return {
      message: preview.message,
      kind: "neutral"
    };
  }

  const strongCandidates = candidates.strongCandidates;
  const mediumCandidates = candidates.mediumCandidates;
  const ignoredCount = candidates.ignoredCandidates.length;

  if (strongCandidates.length === 0 && mediumCandidates.length === 0) {
    if (preview.resultState === "hosts_collected_but_all_internal_or_ignored" || ignoredCount > 0) {
      return {
        message: "Resource hosts were found, but they look like analytics/adtech/local or schema helper domains. No rules were saved.",
        kind: "neutral"
      };
    }

    return {
      message: "Resource hosts were found, but no new related-domain candidates were identified. No rules were saved.",
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
    parts.push(`${ignoredCount} analytics, helper, or infrastructure host${ignoredCount === 1 ? "" : "s"} ignored`);
  }

  return {
    message: `Related-domain preview found candidates. No rules were saved yet. ${parts.join(". ")}.`,
    kind: "neutral"
  };
}

export function getRelatedDomainSaveActionStatus(
  addResult: AddSelectedRelatedDomainRulesResult
): RelatedDomainPreviewActionStatus {
  if (!addResult.ok) {
    return {
      message: addResult.error,
      kind: "error"
    };
  }

  if (addResult.status === "none-selected") {
    return {
      message: "Select at least one related domain before adding rules.",
      kind: "neutral"
    };
  }

  if (addResult.status === "no-new-rules") {
    return {
      message: "No new related-domain rules were added; selected domains are already covered.",
      kind: "neutral"
    };
  }

  const addedDomains = addResult.addedRules.map((rule) => rule.domain).join(", ");

  return {
    message: `Added synced proxy route${addResult.addedRules.length === 1 ? "" : "s"} for ${addedDomains}.`,
    kind: "success"
  };
}

export function buildRelatedDomainPopupView(
  preview: CurrentPageResourceHostsResponse,
  settings: Pick<SyncSettings, "rules" | "denylist">
): RelatedDomainPopupView {
  const status = getRelatedDomainPreviewActionStatus(preview);
  const baseSummary = previewSummary(preview);

  if (preview.status !== "success" || !preview.candidates) {
    const summary = {
      ...baseSummary,
      alreadyCoveredCandidates: 0,
      saveableCandidates: 0
    };

    return {
      ...status,
      resultState: preview.resultState,
      summary,
      diagnosticSummary: preview.status === "success" ? previewDiagnosticSummary(summary) : undefined,
      candidates: [],
      hiddenSaveableCount: 0,
      hiddenAlreadyCoveredCount: 0,
      hiddenIgnoredCount: 0
    };
  }

  const candidates = [
    ...preview.candidates.strongCandidates.map((candidate) =>
      candidateViewFromCandidate(candidate, "strong" as const, settings)
    ),
    ...preview.candidates.mediumCandidates.map((candidate) =>
      candidateViewFromCandidate(candidate, "medium" as const, settings)
    ),
    ...preview.candidates.ignoredCandidates.map((candidate) =>
      candidateViewFromCandidate(candidate, "ignored" as const, settings)
    )
  ].filter((candidate): candidate is RelatedDomainCandidateView => candidate !== null);
  const reviewableCandidates = candidates.filter((candidate) => candidate.category !== "ignored");
  const saveableCandidates = reviewableCandidates.filter((candidate) => candidate.saveable);
  const alreadyCoveredCandidates = reviewableCandidates.filter((candidate) => candidate.alreadyCovered);
  const summary = {
    ...baseSummary,
    alreadyCoveredCandidates: alreadyCoveredCandidates.length,
    saveableCandidates: saveableCandidates.length
  };
  const resultState: RelatedDomainPopupResultState =
    preview.resultState === "candidates_available" && saveableCandidates.length === 0 && alreadyCoveredCandidates.length > 0
      ? "hosts_collected_but_all_already_covered"
      : preview.resultState ?? (saveableCandidates.length > 0 ? "candidates_available" : "hosts_collected_but_no_related_candidates");
  const strongSaveableCandidates = saveableCandidates.filter((candidate) => candidate.category === "strong");
  const mediumSaveableCandidates = saveableCandidates.filter((candidate) => candidate.category === "medium");
  const messageParts: string[] = [];
  let message = status.message;

  if (resultState === "hosts_collected_but_all_already_covered") {
    message = "Resource hosts were found, but they are already covered by existing rules. No rules were saved.";
  } else if (saveableCandidates.length > 0) {
    if (strongSaveableCandidates.length > 0) {
      messageParts.push(`Likely related: ${formatCandidateViewDomains(strongSaveableCandidates)}`);
    }

    if (mediumSaveableCandidates.length > 0) {
      messageParts.push(`Review manually: ${formatCandidateViewDomains(mediumSaveableCandidates)}`);
    }

    if (alreadyCoveredCandidates.length > 0) {
      messageParts.push(`${alreadyCoveredCandidates.length} already-covered candidate${alreadyCoveredCandidates.length === 1 ? "" : "s"}`);
    }

    if (summary.ignoredCandidates > 0) {
      messageParts.push(`${summary.ignoredCandidates} analytics, helper, or infrastructure host${summary.ignoredCandidates === 1 ? "" : "s"} ignored`);
    }

    message = `Related-domain preview found candidates. No rules were saved yet. ${messageParts.join(". ")}.`;
  }

  const capped = cappedRelatedDomainCandidateViews(candidates);
  const hiddenParts: string[] = [];

  if (capped.hiddenSaveableCount > 0) {
    hiddenParts.push(`${capped.hiddenSaveableCount} more saveable candidate${capped.hiddenSaveableCount === 1 ? "" : "s"} hidden`);
  }

  if (capped.hiddenAlreadyCoveredCount > 0) {
    hiddenParts.push(
      `${capped.hiddenAlreadyCoveredCount} already-covered candidate${capped.hiddenAlreadyCoveredCount === 1 ? "" : "s"} hidden`
    );
  }

  if (capped.hiddenIgnoredCount > 0) {
    hiddenParts.push(`${capped.hiddenIgnoredCount} ignored candidate${capped.hiddenIgnoredCount === 1 ? "" : "s"} hidden`);
  }

  return {
    message: hiddenParts.length > 0 ? `${message} ${hiddenParts.join(". ")}.` : message,
    kind: status.kind,
    resultState,
    summary,
    diagnosticSummary: previewDiagnosticSummary(summary),
    ...capped
  };
}

export function addSelectedRelatedDomainRules(
  currentSettings: Pick<SyncSettings, "rules" | "denylist">,
  candidates: readonly RelatedDomainCandidateView[],
  selectedDomains: ReadonlySet<string>,
  createdAt: string = new Date().toISOString(),
  source: RuleSource = "diagnostic"
): AddSelectedRelatedDomainRulesResult {
  if (selectedDomains.size === 0) {
    return {
      ok: true,
      status: "none-selected",
      rules: [...currentSettings.rules],
      addedRules: [],
      skippedDomains: []
    };
  }

  const rules = [...currentSettings.rules];
  const addedRules: DomainRule[] = [];
  const skippedDomains: string[] = [];
  const seenSelectedDomains = new Set<string>();

  for (const candidate of candidates) {
    if (!selectedDomains.has(candidate.domain) || seenSelectedDomains.has(candidate.domain)) {
      continue;
    }

    seenSelectedDomains.add(candidate.domain);

    const domain = normalizeSafeRelatedDomain(candidate.domain, currentSettings.denylist);

    if (!domain || candidate.category === "ignored" || !candidate.saveable) {
      skippedDomains.push(candidate.domain);
      continue;
    }

    if (findCoveringRule(domain, rules)) {
      skippedDomains.push(domain);
      continue;
    }

    const rule: DomainRule = {
      domain,
      includeSubdomains: candidate.includeSubdomains,
      mode: "proxy",
      source,
      createdAt
    };

    rules.push(rule);
    addedRules.push(rule);
  }

  if (addedRules.length === 0) {
    return {
      ok: true,
      status: "no-new-rules",
      rules,
      addedRules: [],
      skippedDomains
    };
  }

  return {
    ok: true,
    status: "added",
    rules,
    addedRules,
    skippedDomains
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

  relatedDomainCandidateViews = [];
  relatedDomainPreviewDomain = null;
  setButtonVisible(getElement<HTMLButtonElement>("#add-selected-related-domains"), false);
  preview.hidden = true;
  preview.textContent = "";
}

function candidateGroupTitle(group: RelatedDomainCandidateGroupKey): string {
  const titles: Record<RelatedDomainCandidateGroupKey, string> = {
    strong: "Strong candidates",
    medium: "Review manually",
    alreadyCovered: "Already covered",
    ignored: "Ignored"
  };

  return titles[group];
}

function candidateCoverageLabel(candidate: RelatedDomainCandidateView): string {
  if (!candidate.alreadyCovered) {
    return "not covered yet";
  }

  return candidate.coveredBy ? `already covered by ${candidate.coveredBy}` : "already covered";
}

function candidateIncludeSubdomainsLabel(candidate: RelatedDomainCandidateView): string {
  return candidate.includeSubdomains ? "include subdomains" : "exact domain";
}

function updateCandidateRowSelection(row: HTMLElement, checkbox: HTMLInputElement): void {
  row.dataset.selected = checkbox.checked && !checkbox.disabled ? "true" : "false";
}

function updateRelatedDomainSaveButtonState(): void {
  const saveButton = getElement<HTMLButtonElement>("#add-selected-related-domains");

  if (saveButton.hidden) {
    return;
  }

  const selectedCheckbox = getElement<HTMLElement>("#related-domain-preview").querySelector<HTMLInputElement>(
    'input[data-related-domain]:checked:not(:disabled)'
  );

  saveButton.disabled = selectedCheckbox === null;
}

function createRelatedDomainCandidateRow(candidate: RelatedDomainCandidateView): HTMLElement {
  const row = document.createElement(candidate.saveable ? "label" : "div");

  row.className = "candidate-row";
  row.dataset.category = candidate.category;
  row.dataset.covered = candidate.alreadyCovered ? "true" : "false";
  row.dataset.saveable = candidate.saveable ? "true" : "false";
  row.dataset.selected = candidate.selected && candidate.saveable ? "true" : "false";

  if (candidate.saveable) {
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.checked = candidate.selected;
    checkbox.disabled = !candidate.saveable;
    checkbox.dataset.relatedDomain = candidate.domain;
    checkbox.addEventListener("change", () => {
      updateCandidateRowSelection(row, checkbox);
      updateRelatedDomainSaveButtonState();
    });
    row.append(checkbox);
  }

  const content = document.createElement("span");
  const domain = document.createElement("span");
  const meta = document.createElement("span");

  content.className = "candidate-content";
  domain.className = "candidate-domain";
  meta.className = "candidate-meta";

  domain.textContent = candidate.domain;
  meta.textContent = [
    candidate.reason,
    candidateIncludeSubdomainsLabel(candidate),
    `${candidate.sourceHostCount} source host${candidate.sourceHostCount === 1 ? "" : "s"}`,
    candidateCoverageLabel(candidate)
  ].join(" · ");

  content.append(domain, meta);
  row.append(content);

  return row;
}

function renderRelatedDomainCandidateGroup(
  container: HTMLElement,
  title: string,
  candidates: readonly RelatedDomainCandidateView[]
): void {
  if (candidates.length === 0) {
    return;
  }

  const group = document.createElement("div");
  const heading = document.createElement("div");

  group.className = "candidate-group";
  heading.className = "candidate-group-title";
  heading.textContent = title;
  group.append(heading, ...candidates.map(createRelatedDomainCandidateRow));
  container.append(group);
}

function createRelatedDomainDiagnosticSummary(summary: string): HTMLElement {
  const note = document.createElement("p");

  note.className = "candidate-note";
  note.textContent = summary;

  return note;
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

function renderRelatedDomainPreview(view: RelatedDomainPopupView, currentDomain?: string): void {
  const previewElement = getElement<HTMLElement>("#related-domain-preview");
  const saveButton = getElement<HTMLButtonElement>("#add-selected-related-domains");

  relatedDomainCandidateViews = view.candidates;
  relatedDomainPreviewDomain = currentDomain ?? null;
  previewElement.replaceChildren();

  if (view.candidates.length === 0) {
    relatedDomainPreviewDomain = null;
    setButtonVisible(saveButton, false);

    if (view.diagnosticSummary) {
      previewElement.append(createRelatedDomainDiagnosticSummary(view.diagnosticSummary));
      previewElement.hidden = false;
      return;
    }

    previewElement.hidden = true;
    return;
  }

  const candidateGroups = groupRelatedDomainCandidateViews(view.candidates);

  renderRelatedDomainCandidateGroup(
    previewElement,
    candidateGroupTitle("strong"),
    candidateGroups.strong
  );
  renderRelatedDomainCandidateGroup(
    previewElement,
    candidateGroupTitle("medium"),
    candidateGroups.medium
  );
  renderRelatedDomainCandidateGroup(
    previewElement,
    candidateGroupTitle("alreadyCovered"),
    candidateGroups.alreadyCovered
  );
  renderRelatedDomainCandidateGroup(
    previewElement,
    candidateGroupTitle("ignored"),
    candidateGroups.ignored
  );

  if (view.hiddenSaveableCount > 0 || view.hiddenAlreadyCoveredCount > 0 || view.hiddenIgnoredCount > 0) {
    const note = document.createElement("p");

    note.className = "candidate-note";
    note.textContent = [
      view.hiddenSaveableCount > 0
        ? `${view.hiddenSaveableCount} more saveable candidate${view.hiddenSaveableCount === 1 ? "" : "s"} hidden`
        : "",
      view.hiddenAlreadyCoveredCount > 0
        ? `${view.hiddenAlreadyCoveredCount} already-covered candidate${view.hiddenAlreadyCoveredCount === 1 ? "" : "s"} hidden`
        : "",
      view.hiddenIgnoredCount > 0
        ? `${view.hiddenIgnoredCount} ignored candidate${view.hiddenIgnoredCount === 1 ? "" : "s"} hidden`
        : ""
    ]
      .filter(Boolean)
      .join(". ");
    previewElement.append(note);
  }

  if (view.diagnosticSummary) {
    previewElement.append(createRelatedDomainDiagnosticSummary(view.diagnosticSummary));
  }

  previewElement.hidden = false;
  setButtonVisible(saveButton, view.candidates.some((candidate) => candidate.saveable));
  updateRelatedDomainSaveButtonState();
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
    const current = await getSyncSettings();
    const previewView = buildRelatedDomainPopupView(preview, current);

    renderRelatedDomainPreview(previewView, preview.currentDomain);
    setStatus(actionStatus, previewView.message, previewView.kind);
  } finally {
    previewButton.disabled = false;
  }
}

async function handleAddSelectedRelatedDomains(): Promise<void> {
  resetDiagnosticOffer();
  const actionStatus = getElement<HTMLElement>("#action-status");
  const currentResult = getCurrentTabDomain(await getActiveTabUrl());

  if (!currentResult.ok) {
    renderUnsupported(currentResult);
    return;
  }

  if (!relatedDomainPreviewDomain || currentResult.domain !== relatedDomainPreviewDomain) {
    setStatus(actionStatus, "Preview related domains again for the current site before adding candidates.", "error");
    return;
  }

  const selectedDomains = new Set(
    Array.from(
      getElement<HTMLElement>("#related-domain-preview").querySelectorAll<HTMLInputElement>(
        'input[data-related-domain]:checked:not(:disabled)'
      )
    ).map((checkbox) => checkbox.dataset.relatedDomain ?? "")
  );
  selectedDomains.delete("");

  if (selectedDomains.size === 0) {
    setStatus(actionStatus, "Select at least one related domain before adding rules.", "neutral");
    return;
  }

  const current = await getSyncSettings();
  const addResult = addSelectedRelatedDomainRules(
    current,
    relatedDomainCandidateViews,
    selectedDomains,
    new Date().toISOString(),
    "diagnostic"
  );

  const saveStatus = getRelatedDomainSaveActionStatus(addResult);

  if (!addResult.ok) {
    setStatus(actionStatus, saveStatus.message, saveStatus.kind);
    return;
  }

  if (addResult.status === "none-selected") {
    setStatus(actionStatus, saveStatus.message, saveStatus.kind);
    return;
  }

  if (addResult.status === "no-new-rules") {
    renderSupported(currentResult.domain, current);
    setStatus(actionStatus, saveStatus.message, saveStatus.kind);
    return;
  }

  const updated = await updateSyncSettings({
    rules: addResult.rules
  });

  renderSupported(currentResult.domain, updated);
  setStatus(actionStatus, saveStatus.message, saveStatus.kind);
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

  getElement<HTMLButtonElement>("#add-selected-related-domains").addEventListener("click", () => {
    void handleAddSelectedRelatedDomains().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : "Could not add selected related domains.",
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
