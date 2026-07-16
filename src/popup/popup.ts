import { checkDenylistedHost } from "../rules/denylist";
import { canonicalizeHostname } from "../rules/canonicalizeHostname";
import {
  getMessage,
  localizedMessage,
  localizeDocument,
  resolveLocalizedMessage,
  setLanguagePreference,
  selectPluralForm,
  type MessageKey
} from "../i18n/i18n";
import { domainMatchesRule, findEffectiveDomainRule } from "../rules/domainMatcher";
import {
  checkRouteTargetAddition,
  findRouteTargetConflictForRule
} from "../rules/routeTarget";
import type { DomainRule, RuleAction, RuleSource } from "../rules/ruleTypes";
import {
  getRuleScopeOptions,
  getRuleStableId,
  planRuleEdit,
  replaceRuleAtomically,
  type RuleEditPlan,
  type RuleScope
} from "../rules/ruleEditing";
import { validateLocalProxyConfig } from "../proxy/proxyConfig";
import type { DomainCandidateUserOverrideAction } from "../domainClassification/domainClassificationTypes";
import {
  isDomainCandidateUserOverrideAction,
  upsertUserClassificationOverride
} from "../domainClassification/userClassificationOverrides";
import type {
  UpsertUserClassificationOverrideResult,
  UserClassificationOverrides
} from "../domainClassification/userClassificationOverrides";
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
import {
  isRelatedDomainRecordingResponse,
  relatedDomainRecordingMessageType,
  type RelatedDomainRecordingResponse,
  type RelatedDomainRecordingSessionState
} from "../diagnostics/relatedDomainRecording";
import type {
  RelatedDomainCandidate,
  RelatedDomainCandidateReason,
  RelatedDomainRouteTargetConfidence,
  RelatedDomainRouteTargetReason
} from "../diagnostics/relatedDomainCandidates";
import { getLocalSettings } from "../storage/localStore";
import {
  addSyncRules,
  applySyncRuleChanges,
  getSyncSettings,
  updateSyncRule,
  updateSyncSettings
} from "../storage/syncStore";
import type { DeviceProxySettings, SyncSettings } from "../storage/storageTypes";

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
      action: RuleAction;
      message: string;
    }
  | {
      state: "inherited";
      parentRule: DomainRule;
      action: RuleAction;
      message: string;
    }
  | {
      state: "conflict";
      effectiveRule: DomainRule;
      matchType: "exact" | "parent";
      action: RuleAction;
      message: string;
    }
  | {
      state: "none";
      message: string;
    };

export type PopupRouteState =
  | "proxy_exact"
  | "proxy_parent"
  | "direct_exact"
  | "direct_parent"
  | "default_direct"
  | "conflict"
  | "blocked";

export type PopupRouteStatusView = {
  routeState: PopupRouteState;
  appearance: "proxy" | "direct" | "not-configured" | "warning" | "blocked";
  label: string;
  explanation: string;
  ariaLabel: string;
};

export type AddCurrentSiteRuleResult =
  | {
      ok: true;
      status: "added" | "duplicate" | "inherited";
      rules: DomainRule[];
      domain: string;
      action: RuleAction;
      includeSubdomains: boolean;
      parentRule?: DomainRule;
    }
  | {
      ok: false;
      error: string;
      reason?: "conflict";
      existingRule?: DomainRule;
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

export type RelatedDomainCandidateGroupKey = "strong" | "medium" | "alreadyCovered" | "conflict" | "ignored";

export type RelatedDomainCandidateView = {
  category: RelatedDomainCandidateCategory;
  domain: string;
  suggestedRuleDomain: string;
  reasonCode: RelatedDomainCandidateReason;
  reason: string;
  routeTargetReason?: RelatedDomainRouteTargetReason;
  routeTargetConfidence?: RelatedDomainRouteTargetConfidence;
  routeTargetReasonLabel: string;
  sourceHosts: string[];
  sourceHostCount: number;
  includeSubdomains: boolean;
  defaultSelected: boolean;
  selected: boolean;
  saveable: boolean;
  alreadyCovered: boolean;
  action?: RuleAction;
  scopeUpgrade?: boolean;
  actionConflict?: boolean;
  expanded?: boolean;
  added?: boolean;
  coveredBy?: string;
  overrideActions: DomainCandidateUserOverrideAction[];
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

export type RelatedDomainRecordingControlView = {
  startVisible: boolean;
  stopVisible: boolean;
  cancelVisible: boolean;
  message?: string;
  kind: MessageKind;
};

export type AddSelectedRelatedDomainRulesResult =
  | {
      ok: true;
      status: "added";
      rules: DomainRule[];
      addedRules: DomainRule[];
      expandedRules?: DomainRule[];
      skippedDomains: string[];
    }
  | {
      ok: true;
      status: "none-selected" | "no-new-rules";
      rules: DomainRule[];
      addedRules: [];
      expandedRules?: [];
      skippedDomains: string[];
    }
  | {
      ok: false;
      error: string;
    };

export type AddRelatedDomainClassificationOverrideResult = UpsertUserClassificationOverrideResult;

let checkedReachableDomain: string | null = null;
let relatedDomainCandidateViews: RelatedDomainCandidateView[] = [];
let relatedDomainPopupView: RelatedDomainPopupView | null = null;
let relatedDomainPreviewDomain: string | null = null;
let currentSyncSettingsSnapshot: SyncSettings | null = null;
let currentDeviceProxySettings: DeviceProxySettings = {
  enabled: false,
  config: null
};
let pendingPopupScopePlan: Extract<RuleEditPlan, { ok: true }> | null = null;
let popupScopeRuleId: string | null = null;

const relatedDomainSaveableCandidateLimit = 12;
const relatedDomainAlreadyCoveredCandidateLimit = 6;
const relatedDomainIgnoredCandidateLimit = 4;

const relatedDomainReasonMessageKeys: Record<RelatedDomainCandidateReason, MessageKey> = {
  "same-site-subdomain": "popupRelatedReasonSameSite",
  "explicit-related-domain": "popupRelatedReasonKnown",
  "third-party-resource": "popupRelatedReasonResource",
  "known-tracking-or-analytics": "popupRelatedReasonAnalytics",
  "shared-infrastructure": "popupRelatedReasonShared",
  "local-or-adblock-helper": "popupRelatedReasonLocalHelper",
  "system-or-schema-helper": "popupRelatedReasonSystemHelper"
};

const relatedDomainRouteTargetReasonMessageKeys: Record<RelatedDomainRouteTargetReason, MessageKey> = {
  "same-site-resources": "popupRelatedReasonSameSite",
  "known-related-domain": "popupRelatedReasonKnown",
  "multiple-sibling-hosts": "popupRelatedReasonSiblings",
  "generated-subdomain": "popupRelatedReasonGenerated",
  "exact-observed-host": "popupRelatedReasonResource",
  "unsafe-shared-infrastructure": "popupRelatedReasonShared"
};

type ActiveTabSnapshot = {
  id?: number;
  url?: string;
};

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": getMessage("validationInternalPageCannotRoute"),
    localhost: getMessage("validationLocalhostCannotRoute"),
    "loopback-ip": getMessage("validationLoopbackCannotRoute"),
    "private-ip": getMessage("validationPrivateCannotRoute"),
    "internal-suffix": getMessage("validationInternalDomainCannotRoute"),
    "single-label-host": getMessage("validationOpenPublicDomain"),
    "invalid-host": getMessage("validationOpenValidSite")
  };

  return messages[reason] ?? getMessage("validationSiteCannotRoute");
}

function unsupportedUrlMessage(url: string): string {
  let protocol = "";

  try {
    protocol = new URL(url).protocol.replace(/:$/, "");
  } catch {
    return getMessage("validationOpenValidSite");
  }

  const protocolLabel = protocol ? `${protocol}://` : getMessage("commonThisPage");

  return getMessage("validationProtocolCannotRoute", [protocolLabel]);
}

function normalizeKnownDomain(input: string): string | null {
  const normalized = canonicalizeHostname(input);

  return normalized.ok ? normalized.domain : null;
}

export function isRelatedDomainPreviewCurrent(
  currentDomain: string,
  previewDomain: string | null
): boolean {
  if (!previewDomain) {
    return false;
  }

  const normalizedCurrentDomain = normalizeKnownDomain(currentDomain);
  const normalizedPreviewDomain = normalizeKnownDomain(previewDomain);

  return normalizedCurrentDomain !== null && normalizedCurrentDomain === normalizedPreviewDomain;
}

function parentRuleForDomain(domain: string, rules: readonly DomainRule[]): DomainRule | undefined {
  const parentMatch = findEffectiveDomainRule(
    domain,
    rules.filter((rule) => {
      const ruleDomain = normalizeKnownDomain(rule.domain);

      return ruleDomain !== null && ruleDomain !== domain && domainMatchesRule(domain, rule);
    })
  );

  return parentMatch?.rule;
}

function isStoredDenylistedDomain(domain: string, denylist: readonly string[]): boolean {
  return denylist.some((entry) => domainMatchesRule(domain, { domain: entry, includeSubdomains: true }));
}

function normalizeSafeRelatedDomain(input: string, denylist: readonly string[] = []): string | null {
  const normalized = canonicalizeHostname(input);

  if (!normalized.ok) {
    return null;
  }

  if (checkDenylistedHost(normalized.domain).denied || isStoredDenylistedDomain(normalized.domain, denylist)) {
    return null;
  }

  return normalized.domain;
}

function findCoveringRule(domain: string, rules: readonly DomainRule[]): DomainRule | undefined {
  return findEffectiveDomainRule(domain, rules)?.rule;
}

function routeTargetCoveredByRule(
  domain: string,
  includeSubdomains: boolean,
  action: RuleAction,
  rule: DomainRule
): boolean {
  if (rule.action !== action) {
    return false;
  }

  if (!includeSubdomains) {
    return domainMatchesRule(domain, rule);
  }

  return rule.includeSubdomains && domainMatchesRule(domain, rule);
}

function findCoveringRouteTargetRule(
  domain: string,
  includeSubdomains: boolean,
  action: RuleAction,
  rules: readonly DomainRule[]
): DomainRule | undefined {
  return rules.find((rule) => routeTargetCoveredByRule(domain, includeSubdomains, action, rule));
}

function ruleActionLabel(action: RuleAction): string {
  return action === "direct" ? getMessage("ruleActionDirectLower") : getMessage("ruleActionProxyLower");
}

function ruleActionDisplayLabel(action: RuleAction): string {
  return action === "direct" ? getMessage("commonDirect") : getMessage("commonProxy");
}

function suggestedCurrentSiteRuleTarget(domain: string): { domain: string; includeSubdomains: boolean } {
  return {
    domain,
    includeSubdomains: false
  };
}

function relatedDomainOverrideActions(
  category: RelatedDomainCandidateCategory,
  alreadyCovered: boolean
): DomainCandidateUserOverrideAction[] {
  if (alreadyCovered) {
    return [];
  }

  if (category === "ignored") {
    return ["review-globally", "suggest-for-site"];
  }

  if (category === "medium") {
    return ["ignore-globally", "ignore-for-site", "suggest-for-site"];
  }

  return ["ignore-globally", "ignore-for-site"];
}

function candidateViewFromCandidate(
  candidate: RelatedDomainCandidate,
  category: RelatedDomainCandidateCategory,
  settings: Pick<SyncSettings, "rules" | "denylist">,
  action: RuleAction = "proxy"
): RelatedDomainCandidateView | null {
  const suggestedRuleDomain = candidate.suggestedRuleDomain ?? candidate.domain;
  const domain = normalizeSafeRelatedDomain(suggestedRuleDomain, settings.denylist);

  if (!domain) {
    return null;
  }

  const coveringRule = findCoveringRouteTargetRule(domain, candidate.suggestedIncludeSubdomains, action, settings.rules);
  const exactRule = settings.rules.find(
    (rule) => !rule.includeSubdomains && normalizeKnownDomain(rule.domain) === domain
  );
  const scopeUpgrade =
    candidate.suggestedIncludeSubdomains &&
    exactRule !== undefined &&
    exactRule.action === action &&
    coveringRule === undefined;
  const actionConflict =
    candidate.suggestedIncludeSubdomains &&
    exactRule !== undefined &&
    exactRule.action !== action &&
    coveringRule === undefined;
  const alreadyCovered = coveringRule !== undefined;
  const saveable = category !== "ignored" && !alreadyCovered && !actionConflict;
  const defaultSelected = category === "strong" && candidate.defaultSelected && saveable;
  const routeTargetReasonLabel = candidate.routeTargetReason
    ? getMessage(relatedDomainRouteTargetReasonMessageKeys[candidate.routeTargetReason])
    : getMessage(relatedDomainReasonMessageKeys[candidate.reason]);

  return {
    category,
    domain,
    suggestedRuleDomain: domain,
    reasonCode: candidate.reason,
    reason: getMessage(relatedDomainReasonMessageKeys[candidate.reason]),
    ...(candidate.routeTargetReason ? { routeTargetReason: candidate.routeTargetReason } : {}),
    ...(candidate.routeTargetConfidence ? { routeTargetConfidence: candidate.routeTargetConfidence } : {}),
    routeTargetReasonLabel,
    sourceHosts: candidate.sourceHosts,
    sourceHostCount: candidate.sourceHostCount,
    includeSubdomains: candidate.suggestedIncludeSubdomains,
    defaultSelected,
    selected: defaultSelected,
    saveable,
    alreadyCovered,
    ...(action !== "proxy" ? { action } : {}),
    ...(scopeUpgrade ? { scopeUpgrade: true } : {}),
    ...(actionConflict ? { actionConflict: true } : {}),
    overrideActions: relatedDomainOverrideActions(category, alreadyCovered),
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
    (candidate) => candidate.category !== "ignored" && (candidate.alreadyCovered || candidate.actionConflict)
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
    strong: candidates.filter(
      (candidate) => candidate.category === "strong" && (candidate.saveable || candidate.added || candidate.expanded)
    ),
    medium: candidates.filter(
      (candidate) => candidate.category === "medium" && (candidate.saveable || candidate.added || candidate.expanded)
    ),
    alreadyCovered: candidates.filter(
      (candidate) => candidate.category !== "ignored" && candidate.alreadyCovered && !candidate.added
    ),
    conflict: candidates.filter((candidate) => candidate.category !== "ignored" && candidate.actionConflict),
    ignored: candidates.filter((candidate) => candidate.category === "ignored")
  };
}

export function relatedDomainAddActionLabel(
  candidate: Pick<RelatedDomainCandidateView, "domain" | "includeSubdomains"> & {
    scopeUpgrade?: boolean;
  }
): string {
  if (candidate.scopeUpgrade) {
    return getMessage("popupRelatedExpand");
  }

  return candidate.includeSubdomains
    ? getMessage("popupRelatedAddParent", [candidate.domain])
    : getMessage("popupRelatedAddExact", [candidate.domain]);
}

export function relatedDomainBatchAddActionLabel(selectedCount: number): string {
  const form = selectPluralForm(selectedCount);
  const key: MessageKey =
    form === "one"
      ? "popupRelatedBatchAddOne"
      : form === "few"
        ? "popupRelatedBatchAddFew"
        : form === "many"
          ? "popupRelatedBatchAddMany"
          : "popupRelatedBatchAddOther";

  return getMessage(key, [selectedCount]);
}

export function updateRelatedDomainCandidateViewsAfterAdd(
  candidates: readonly RelatedDomainCandidateView[],
  currentRules: readonly DomainRule[],
  requestedDomains: ReadonlySet<string>,
  addedDomains: ReadonlySet<string>,
  clearRequestedSelection: boolean,
  expandedDomains: ReadonlySet<string> = new Set()
): RelatedDomainCandidateView[] {
  return candidates.map((candidate) => {
    const action = candidate.action ?? "proxy";
    const coveringRule = findCoveringRouteTargetRule(
      candidate.domain,
      candidate.includeSubdomains,
      action,
      currentRules
    );

    if (coveringRule) {
      const expanded = expandedDomains.has(candidate.domain);

      return {
        ...candidate,
        selected: false,
        saveable: false,
        alreadyCovered: !expanded,
        scopeUpgrade: false,
        expanded,
        added: candidate.added === true || addedDomains.has(candidate.domain),
        coveredBy: coveringRule.domain,
        overrideActions: relatedDomainOverrideActions(candidate.category, true)
      };
    }

    if (clearRequestedSelection && requestedDomains.has(candidate.domain)) {
      return {
        ...candidate,
        selected: false
      };
    }

    return candidate;
  });
}

export function getCurrentTabDomain(url: string | undefined): CurrentTabDomainResult {
  if (!url) {
    return {
      ok: false,
      message: getMessage("popupOpenSupportedSite")
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      message: getMessage("validationOpenValidSite")
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      message: unsupportedUrlMessage(url)
    };
  }

  const normalized = canonicalizeHostname(url);

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
      message: getMessage("popupSyncedDenylistBlocked", [domain])
    };
  }

  const effectiveRule = findEffectiveDomainRule(domain, settings.rules);

  if (effectiveRule) {
    const conflict = findRouteTargetConflictForRule(settings.rules, effectiveRule.rule);

    if (conflict) {
      const action = effectiveRule.rule.action;

      return {
        state: "conflict",
        effectiveRule: effectiveRule.rule,
        matchType: effectiveRule.type,
        action,
        message: getMessage("popupConflictEffective", [ruleActionDisplayLabel(action)])
      };
    }
  }

  if (effectiveRule?.type === "exact") {
    const action = effectiveRule.rule.action;

    return {
      state: "exact",
      exactRule: effectiveRule.rule,
      action,
      message:
        action === "proxy"
          ? getMessage("popupExactProxy", [domain])
          : getMessage("popupExactDirect", [domain])
    };
  }

  if (effectiveRule?.type === "parent") {
    const action = effectiveRule.rule.action;

    return {
      state: "inherited",
      parentRule: effectiveRule.rule,
      action,
      message:
        action === "proxy"
          ? getMessage("popupParentProxy", [domain, effectiveRule.rule.domain])
          : getMessage("popupParentDirect", [domain, effectiveRule.rule.domain])
    };
  }

  return {
    state: "none",
    message: getMessage("popupDefaultDirect", [domain])
  };
}

function localProxyIsAvailable(deviceProxy: DeviceProxySettings): boolean {
  return deviceProxy.enabled && deviceProxy.config !== null && validateLocalProxyConfig(deviceProxy.config).ok;
}

export function getPopupRouteStatusView(
  domain: string,
  settings: Pick<SyncSettings, "rules" | "denylist">,
  deviceProxy: DeviceProxySettings
): PopupRouteStatusView {
  const status = getPopupRuleStatus(domain, settings);

  if (status.state === "blocked") {
    const label = getMessage("popupStatusUnavailable");

    return {
      routeState: "blocked",
      appearance: "blocked",
      label,
      explanation: status.message,
      ariaLabel: getMessage("popupAriaRouteStatus", [label, status.message])
    };
  }

  if (status.state === "none") {
    const label = getMessage("popupStatusNotConfigured");
    const explanation = getMessage("popupNoMatchingRule");

    return {
      routeState: "default_direct",
      appearance: "not-configured",
      label,
      explanation,
      ariaLabel: getMessage("popupAriaRouteStatus", [label, explanation])
    };
  }

  if (status.state === "conflict") {
    const label = getMessage("popupStatusConflictingRules");
    const routeSource =
      status.matchType === "exact"
        ? getMessage("popupConflictExactSource", [status.effectiveRule.domain])
        : getMessage("popupConflictParentSource", [status.effectiveRule.domain]);
    const explanation = getMessage("popupConflictExplanation", [ruleActionDisplayLabel(status.action), routeSource]);

    return {
      routeState: "conflict",
      appearance: "warning",
      label,
      explanation,
      ariaLabel: getMessage("popupWarningAria", [label, explanation])
    };
  }

  const isExact = status.state === "exact";
  const rule = isExact ? status.exactRule : status.parentRule;
  const routeState: PopupRouteState =
    status.action === "proxy"
      ? isExact
        ? "proxy_exact"
        : "proxy_parent"
      : isExact
        ? "direct_exact"
        : "direct_parent";
  const explanation =
    status.action === "proxy"
      ? isExact
        ? getMessage("popupExactProxyExplanation", [domain])
        : getMessage("popupParentProxyExplanation", [rule.domain])
      : isExact
        ? getMessage("popupExactDirectExplanation", [domain])
        : getMessage("popupParentDirectExplanation", [rule.domain]);

  if (status.action === "proxy" && !localProxyIsAvailable(deviceProxy)) {
    const label = getMessage("popupStatusProxyUnavailable");
    const warningExplanation = getMessage("popupProxyDisabledExplanation", [explanation]);

    return {
      routeState,
      appearance: "warning",
      label,
      explanation: warningExplanation,
      ariaLabel: getMessage("popupWarningAria", [label, warningExplanation])
    };
  }

  const label = status.action === "proxy" ? getMessage("popupStatusThroughProxy") : getMessage("popupStatusDirect");

  return {
    routeState,
    appearance: status.action,
    label,
    explanation,
    ariaLabel: getMessage("popupAriaRouteStatus", [label, explanation])
  };
}

export function addCurrentSiteRule(
  currentRules: readonly DomainRule[],
  input: string,
  createdAt: string = new Date().toISOString(),
  source: RuleSource = "manual",
  action: RuleAction = "proxy"
): AddCurrentSiteRuleResult {
  const normalized = canonicalizeHostname(input);

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

  const target = suggestedCurrentSiteRuleTarget(normalized.domain);

  const proposedRule: DomainRule = {
    domain: target.domain,
    includeSubdomains: target.includeSubdomains,
    action,
    mode: "proxy",
    source,
    createdAt
  };
  const targetCheck = checkRouteTargetAddition(currentRules, proposedRule);

  if (targetCheck.status === "conflict") {
    return {
      ok: false,
      reason: "conflict",
      existingRule: targetCheck.existingRule,
      error: getMessage("ruleActionExistsForScope", [ruleActionDisplayLabel(targetCheck.existingRule.action)])
    };
  }

  if (targetCheck.status === "duplicate") {
    return {
      ok: true,
      status: "duplicate",
      rules: [...currentRules],
      domain: target.domain,
      action,
      includeSubdomains: target.includeSubdomains
    };
  }

  const parentRule = findCoveringRouteTargetRule(target.domain, target.includeSubdomains, action, currentRules);

  if (parentRule) {
    return {
      ok: true,
      status: "inherited",
      rules: [...currentRules],
      domain: target.domain,
      action,
      includeSubdomains: target.includeSubdomains,
      parentRule
    };
  }

  return {
    ok: true,
    status: "added",
    rules: [
      ...currentRules,
      proposedRule
    ],
    domain: target.domain,
    action,
    includeSubdomains: target.includeSubdomains
  };
}

export function removeCurrentSiteRule(currentRules: readonly DomainRule[], input: string): RemoveCurrentSiteRuleResult {
  const normalized = canonicalizeHostname(input);
  const domain = normalized.ok ? normalized.domain : input.trim().toLowerCase();
  const exactRule = findEffectiveDomainRule(domain, currentRules);

  if (exactRule?.type === "exact") {
    return {
      status: "removed",
      rules: currentRules.filter((_, ruleIndex) => ruleIndex !== exactRule.ruleIndex),
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
  if (routeStatus.state === "conflict") {
    return {
      message: getMessage("popupDiagnosticResolveConflict"),
      kind: "error"
    };
  }

  if (diagnostic.status === "proxy_reachable") {
    if (
      routeStatus.state === "none" ||
      ((routeStatus.state === "exact" || routeStatus.state === "inherited") && routeStatus.action === "direct")
    ) {
      return {
        message: getMessage("popupDiagnosticReachableCanAdd"),
        kind: "success",
        saveReachableDomain: diagnostic.domain ?? domain
      };
    }

    return {
      message: getMessage("popupDiagnosticReachableCovered"),
      kind: "success"
    };
  }

  if (diagnostic.status === "proxy_unreachable") {
    if ((routeStatus.state === "exact" || routeStatus.state === "inherited") && routeStatus.action === "proxy") {
      return {
        message: getMessage("popupDiagnosticUnreachableCovered"),
        kind: "error"
      };
    }

    return {
      message: getMessage("popupDiagnosticUnreachable"),
      kind: "error"
    };
  }

  return {
    message: diagnostic.message,
    kind: diagnostic.status === "missing_proxy_config" ? "neutral" : "error"
  };
}

function formatCandidateDomains(candidates: readonly RelatedDomainCandidate[], limit = 4): string {
  const domains = candidates.slice(0, limit).map((candidate) => candidate.suggestedRuleDomain ?? candidate.domain);
  const extraCount = candidates.length - domains.length;

  return extraCount > 0 ? getMessage("commonAndMore", [domains.join(", "), extraCount]) : domains.join(", ");
}

function formatCandidateViewDomains(candidates: readonly RelatedDomainCandidateView[], limit = 4): string {
  const domains = candidates.slice(0, limit).map((candidate) => candidate.domain);
  const extraCount = candidates.length - domains.length;

  return extraCount > 0 ? getMessage("commonAndMore", [domains.join(", "), extraCount]) : domains.join(", ");
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
  let message = getMessage("popupPreviewDetails", [
    summary.rawEntriesInspected,
    summary.requestInitiationsInspected ?? 0,
    summary.performanceEntriesInspected ?? 0,
    summary.domAttributesInspected ?? 0,
    summary.urlLikeValuesFound ?? summary.hostsExtracted,
    summary.hostsAfterSanitization,
    summary.hostsIgnoredOrInternal,
    summary.alreadyCoveredCandidates,
    summary.saveableCandidates
  ]);
  if ((summary.droppedPerformanceEntries ?? 0) > 0) {
    message += getMessage("popupPreviewDropped", [summary.droppedPerformanceEntries ?? 0]);
  }
  if (summary.sampleHosts && summary.sampleHosts.length > 0) {
    message += getMessage("popupPreviewHosts", [summary.sampleHosts.slice(0, 5).join(", ")]);
  }

  return message;
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
      message:
        preview.captureMode === "recording"
          ? getMessage("popupRelatedNoRequestHosts")
          : getMessage("popupRelatedNoResourceHosts"),
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
        message: getMessage("popupRelatedOnlyIgnored"),
        kind: "neutral"
      };
    }

    return {
      message: getMessage("popupRelatedNoCandidates"),
      kind: "neutral"
    };
  }

  const parts: string[] = [];

  if (strongCandidates.length > 0) {
    parts.push(getMessage("popupRelatedLikely", [formatCandidateDomains(strongCandidates)]));
  }

  if (mediumCandidates.length > 0) {
    parts.push(getMessage("popupRelatedReview", [formatCandidateDomains(mediumCandidates)]));
  }

  if (ignoredCount > 0) {
    parts.push(getMessage(ignoredCount === 1 ? "popupRelatedIgnoredCountOne" : "popupRelatedIgnoredCount", [ignoredCount]));
  }

  return {
    message: getMessage("popupRelatedPreviewIntro", [parts.join(". ")]),
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
      message: getMessage("popupRelatedSelectOne"),
      kind: "neutral"
    };
  }

  if (addResult.status === "no-new-rules") {
    return {
      message: getMessage("popupRelatedNoNewRules"),
      kind: "neutral"
    };
  }

  const addedDomains = addResult.addedRules.map((rule) => rule.domain).join(", ");
  const expandedDomains = (addResult.expandedRules ?? []).map((rule) => rule.domain).join(", ");

  if (addResult.addedRules.length > 0 && (addResult.expandedRules?.length ?? 0) > 0) {
    return {
      message: getMessage("popupRelatedAddedAndExpanded", [addResult.addedRules.length, addResult.expandedRules?.length ?? 0]),
      kind: "success"
    };
  }

  if ((addResult.expandedRules?.length ?? 0) > 0) {
    return {
      message:
        addResult.expandedRules?.length === 1
          ? getMessage("popupRelatedExpandedRoute", [
              ruleActionLabel(addResult.expandedRules[0].action),
              expandedDomains
            ])
          : getMessage("popupRelatedExpandedRoutes", [expandedDomains]),
      kind: "success"
    };
  }

  return {
    message: getMessage(addResult.addedRules.length === 1 ? "popupRelatedAddedRoute" : "popupRelatedAddedRoutes", [addedDomains]),
    kind: "success"
  };
}

export function buildRelatedDomainPopupView(
  preview: CurrentPageResourceHostsResponse,
  settings: Pick<SyncSettings, "rules" | "denylist">,
  action: RuleAction = "proxy"
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
      candidateViewFromCandidate(candidate, "strong" as const, settings, action)
    ),
    ...preview.candidates.mediumCandidates.map((candidate) =>
      candidateViewFromCandidate(candidate, "medium" as const, settings, action)
    ),
    ...preview.candidates.ignoredCandidates.map((candidate) =>
      candidateViewFromCandidate(candidate, "ignored" as const, settings, action)
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
    message = getMessage("popupRelatedAllCovered");
  } else if (saveableCandidates.length > 0) {
    if (strongSaveableCandidates.length > 0) {
      messageParts.push(getMessage("popupRelatedLikely", [formatCandidateViewDomains(strongSaveableCandidates)]));
    }

    if (mediumSaveableCandidates.length > 0) {
      messageParts.push(getMessage("popupRelatedReview", [formatCandidateViewDomains(mediumSaveableCandidates)]));
    }

    if (alreadyCoveredCandidates.length > 0) {
      messageParts.push(
        getMessage(alreadyCoveredCandidates.length === 1 ? "popupRelatedCoveredCountOne" : "popupRelatedCoveredCount", [
          alreadyCoveredCandidates.length
        ])
      );
    }

    if (summary.ignoredCandidates > 0) {
      messageParts.push(
        getMessage(summary.ignoredCandidates === 1 ? "popupRelatedIgnoredCountOne" : "popupRelatedIgnoredCount", [
          summary.ignoredCandidates
        ])
      );
    }

    message = getMessage("popupRelatedPreviewIntro", [messageParts.join(". ")]);
  }

  const capped = cappedRelatedDomainCandidateViews(candidates);
  const hiddenParts: string[] = [];

  if (capped.hiddenSaveableCount > 0) {
    hiddenParts.push(
      getMessage(capped.hiddenSaveableCount === 1 ? "popupRelatedHiddenSaveableOne" : "popupRelatedHiddenSaveable", [
        capped.hiddenSaveableCount
      ])
    );
  }

  if (capped.hiddenAlreadyCoveredCount > 0) {
    hiddenParts.push(
      getMessage(
        capped.hiddenAlreadyCoveredCount === 1 ? "popupRelatedHiddenCoveredOne" : "popupRelatedHiddenCovered",
        [capped.hiddenAlreadyCoveredCount]
      )
    );
  }

  if (capped.hiddenIgnoredCount > 0) {
    hiddenParts.push(
      getMessage(capped.hiddenIgnoredCount === 1 ? "popupRelatedHiddenIgnoredOne" : "popupRelatedHiddenIgnored", [
        capped.hiddenIgnoredCount
      ])
    );
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
  const expandedRules: DomainRule[] = [];
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

    const action = candidate.action ?? "proxy";
    const coveringRule = findCoveringRouteTargetRule(domain, candidate.includeSubdomains, action, rules);

    if (coveringRule) {
      skippedDomains.push(domain);
      continue;
    }

    const exactRule = rules.find(
      (rule) => !rule.includeSubdomains && normalizeKnownDomain(rule.domain) === domain
    );

    if (candidate.includeSubdomains && exactRule && exactRule.action !== action) {
      return {
        ok: false,
        error: getMessage("ruleActionExistsForDomainScope", [
          ruleActionDisplayLabel(exactRule.action),
          domain
        ])
      };
    }

    if (
      exactRule &&
      (candidate.scopeUpgrade === true ||
        (candidate.includeSubdomains && exactRule.action === action && exactRule.includeSubdomains === false))
    ) {
      const replacement = replaceRuleAtomically(rules, getRuleStableId(exactRule), {
        domain,
        includeSubdomains: true,
        action
      });

      if (!replacement.ok) {
        return { ok: false, error: replacement.error };
      }

      rules.splice(0, rules.length, ...replacement.rules);
      expandedRules.push(replacement.updatedRule);
      continue;
    }

    const rule: DomainRule = {
      domain,
      includeSubdomains: candidate.includeSubdomains,
      action,
      mode: "proxy",
      source,
      createdAt
    };
    const targetCheck = checkRouteTargetAddition(rules, rule);

    if (targetCheck.status === "conflict") {
      return {
        ok: false,
        error: getMessage("ruleActionExistsForDomainScope", [
          ruleActionDisplayLabel(targetCheck.existingRule.action),
          domain
        ])
      };
    }

    if (targetCheck.status === "duplicate") {
      skippedDomains.push(domain);
      continue;
    }

    rules.push(rule);
    addedRules.push(rule);
  }

  if (addedRules.length === 0 && expandedRules.length === 0) {
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
    ...(expandedRules.length > 0 ? { expandedRules } : {}),
    skippedDomains
  };
}

export function addRelatedDomainClassificationOverride(
  currentOverrides: UserClassificationOverrides,
  currentDomain: string,
  candidateDomain: string,
  action: DomainCandidateUserOverrideAction
): AddRelatedDomainClassificationOverrideResult {
  return upsertUserClassificationOverride(currentOverrides, {
    domain: candidateDomain,
    siteDomain: currentDomain,
    action
  });
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

function renderRouteStatus(view: PopupRouteStatusView): void {
  const container = getElement<HTMLElement>("#route-status");
  const summary = document.createElement("div");
  const indicator = document.createElement("span");
  const label = document.createElement("strong");
  const explanation = document.createElement("div");

  summary.className = "route-status-summary";
  indicator.className = "route-status-indicator";
  indicator.setAttribute("aria-hidden", "true");
  label.className = "route-status-label";
  label.textContent = view.label;
  explanation.className = "route-status-explanation";
  explanation.textContent = view.explanation;
  summary.append(indicator, label);
  container.replaceChildren(summary, explanation);
  container.dataset.kind = view.appearance === "warning" || view.appearance === "blocked" ? "error" : "neutral";
  container.dataset.appearance = view.appearance;
  container.dataset.routeState = view.routeState;
  container.setAttribute("role", "status");
  container.setAttribute("aria-label", view.ariaLabel);
}

function scopeLabel(rule: Pick<DomainRule, "includeSubdomains">): string {
  return rule.includeSubdomains ? getMessage("commonDomainAndSubdomains") : getMessage("commonExactHostname");
}

function appendScopePreviewLine(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement("p");
  const heading = document.createElement("strong");

  heading.textContent = `${label}: `;
  row.append(heading, value);
  container.append(row);
}

function renderPopupScopePlan(plan: RuleEditPlan): void {
  const preview = getElement<HTMLElement>("#scope-change-preview");
  const confirmButton = getElement<HTMLButtonElement>("#confirm-scope-change");

  preview.replaceChildren();
  pendingPopupScopePlan = null;
  confirmButton.disabled = true;

  if (!plan.ok) {
    setStatus(preview, plan.error, plan.reason === "no-change" ? "neutral" : "error");
    return;
  }

  pendingPopupScopePlan = plan;
  preview.dataset.kind = "neutral";
  appendScopePreviewLine(
    preview,
    getMessage("commonCurrentRule"),
    `${plan.currentRule.domain} · ${scopeLabel(plan.currentRule)} · ${ruleActionDisplayLabel(plan.currentRule.action)}`
  );
  appendScopePreviewLine(
    preview,
    getMessage("commonProposedRule"),
    `${plan.proposedRule.domain} · ${scopeLabel(plan.proposedRule)} · ${ruleActionDisplayLabel(plan.proposedRule.action)}`
  );

  if (plan.coverage.length > 0) {
    const coverageHeading = document.createElement("strong");
    const coverageList = document.createElement("ul");

    coverageHeading.textContent = getMessage("commonCoverage");
    coverageList.className = "scope-preview-list";
    plan.coverage.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      coverageList.append(item);
    });
    preview.append(coverageHeading, coverageList);
  }

  plan.warnings.forEach((warning) => {
    const note = document.createElement("p");
    note.className = "scope-warning";
    note.textContent = warning.message;
    preview.append(note);
  });
  confirmButton.disabled = false;
}

function refreshPopupScopePlan(): void {
  if (!popupScopeRuleId || !currentSyncSettingsSnapshot) {
    return;
  }

  const currentRule = currentSyncSettingsSnapshot.rules.find(
    (rule) => getRuleStableId(rule) === popupScopeRuleId
  );

  if (!currentRule) {
    renderPopupScopePlan({
      ok: false,
      reason: "rule-not-found",
      error: getMessage("popupExactRuleGone")
    });
    return;
  }

  const scope = getElement<HTMLSelectElement>("#scope-change-select").value as RuleScope;
  renderPopupScopePlan(
    planRuleEdit(
      currentSyncSettingsSnapshot.rules,
      popupScopeRuleId,
      {
        domain: currentRule.domain,
        action: currentRule.action,
        scope
      },
      currentSyncSettingsSnapshot.denylist
    )
  );
}

function resetPopupScopeEditor(): void {
  const editor = getElement<HTMLElement>("#scope-change-editor");
  const select = getElement<HTMLSelectElement>("#scope-change-select");

  pendingPopupScopePlan = null;
  popupScopeRuleId = null;
  editor.hidden = true;
  select.replaceChildren();
  getElement<HTMLElement>("#scope-change-preview").replaceChildren();
  getElement<HTMLButtonElement>("#confirm-scope-change").disabled = true;
}

function openPopupScopeEditor(): void {
  if (!currentSyncSettingsSnapshot) {
    return;
  }

  const domain = getElement<HTMLElement>("#current-domain").textContent ?? "";
  const status = getPopupRuleStatus(domain, currentSyncSettingsSnapshot);

  if (status.state !== "exact") {
    setStatus(getElement<HTMLElement>("#action-status"), getMessage("popupOnlyExactExpandable"), "error");
    return;
  }

  const editor = getElement<HTMLElement>("#scope-change-editor");
  const select = getElement<HTMLSelectElement>("#scope-change-select");
  const options = getRuleScopeOptions(status.exactRule.domain, currentSyncSettingsSnapshot.denylist);
  const currentScope: RuleScope = status.exactRule.includeSubdomains ? "hostname-and-subdomains" : "exact";

  popupScopeRuleId = getRuleStableId(status.exactRule);
  select.replaceChildren(
    ...options.map((scopeOption) => {
      const option = document.createElement("option");
      option.value = scopeOption.scope;
      option.textContent = `${scopeOption.label} — ${scopeOption.coverage.join(", ")}`;
      option.selected = scopeOption.scope === currentScope;
      return option;
    })
  );
  getElement<HTMLElement>("#scope-change-action").textContent = getMessage("popupScopeActionPreserved", [
    ruleActionDisplayLabel(status.action)
  ]);
  editor.hidden = false;
  refreshPopupScopePlan();
}

function setButtonVisible(button: HTMLButtonElement, visible: boolean): void {
  button.hidden = !visible;
}

function setRelatedDomainRecordingButtonVisibility(controlView: RelatedDomainRecordingControlView): void {
  setButtonVisible(getElement<HTMLButtonElement>("#start-related-domain-recording"), controlView.startVisible);
  setButtonVisible(getElement<HTMLButtonElement>("#stop-related-domain-recording"), controlView.stopVisible);
  setButtonVisible(getElement<HTMLButtonElement>("#cancel-related-domain-recording"), controlView.cancelVisible);
}

function resetDiagnosticOffer(): void {
  checkedReachableDomain = null;
  setButtonVisible(getElement<HTMLButtonElement>("#save-diagnostic-rule"), false);
}

function resetRelatedDomainPreview(): void {
  const preview = getElement<HTMLElement>("#related-domain-preview");

  relatedDomainCandidateViews = [];
  relatedDomainPopupView = null;
  relatedDomainPreviewDomain = null;
  preview.hidden = true;
  preview.textContent = "";
}

export function buildRelatedDomainRecordingControlView(
  state: RelatedDomainRecordingSessionState,
  activeTabId?: number
): RelatedDomainRecordingControlView {
  if (state.status === "idle") {
    return {
      startVisible: true,
      stopVisible: false,
      cancelVisible: false,
      kind: "neutral"
    };
  }

  const sameTab = activeTabId === state.tabId;

  if (sameTab) {
    return {
      startVisible: false,
      stopVisible: true,
      cancelVisible: true,
      message:
        state.status === "expired"
          ? getMessage("recordingExpiredAction", [state.currentDomain])
          : getMessage("recordingActive", [state.currentDomain]),
      kind: "neutral"
    };
  }

  return {
    startVisible: false,
    stopVisible: false,
    cancelVisible: true,
    message: getMessage("recordingBelongsOtherTab", [state.currentDomain]),
    kind: "neutral"
  };
}

function candidateGroupTitle(group: RelatedDomainCandidateGroupKey): string {
  const titles: Record<RelatedDomainCandidateGroupKey, string> = {
    strong: getMessage("popupRelatedGroupStrong"),
    medium: getMessage("popupRelatedGroupMedium"),
    alreadyCovered: getMessage("popupRelatedGroupCovered"),
    conflict: getMessage("popupRelatedGroupConflict"),
    ignored: getMessage("popupRelatedGroupIgnored")
  };

  return titles[group];
}

function candidateCoverageLabel(candidate: RelatedDomainCandidateView): string {
  if (candidate.expanded) {
    return getMessage("popupRelatedExpanded");
  }

  if (candidate.scopeUpgrade) {
    return getMessage("popupRelatedExactRuleExists", [candidate.domain]);
  }

  if (candidate.actionConflict) {
    return getMessage("popupRelatedActionConflict", [candidate.domain]);
  }

  if (!candidate.alreadyCovered) {
    return getMessage("popupRelatedNotCovered");
  }

  return candidate.coveredBy
    ? getMessage("popupRelatedCoveredBy", [candidate.coveredBy])
    : getMessage("popupRelatedAlreadyCovered");
}

function candidateIncludeSubdomainsLabel(candidate: RelatedDomainCandidateView): string {
  return candidate.includeSubdomains
    ? getMessage("popupRelatedHostnameAndSubdomains")
    : getMessage("popupRelatedExactHostname");
}

function formatObservedHosts(hosts: readonly string[], limit = 3): string {
  const visibleHosts = hosts.slice(0, limit);
  const extraCount = hosts.length - visibleHosts.length;

  return extraCount > 0 ? getMessage("commonAndMore", [visibleHosts.join(", "), extraCount]) : visibleHosts.join(", ");
}

function relatedDomainOverrideActionLabel(action: DomainCandidateUserOverrideAction): string {
  const labels: Record<DomainCandidateUserOverrideAction, string> = {
    "ignore-globally": getMessage("popupRelatedIgnoreGlobally"),
    "review-globally": getMessage("popupRelatedReviewGlobally"),
    "suggest-for-site": getMessage("popupRelatedSuggestForSite"),
    "ignore-for-site": getMessage("popupRelatedIgnoreForSite")
  };

  return labels[action];
}

function relatedDomainOverrideSavedMessage(action: DomainCandidateUserOverrideAction, domain: string): string {
  const messages: Record<DomainCandidateUserOverrideAction, string> = {
    "ignore-globally": getMessage("popupRelatedOverrideIgnoredSaved", [domain]),
    "review-globally": getMessage("popupRelatedOverrideReviewSaved", [domain]),
    "suggest-for-site": getMessage("popupRelatedOverrideSuggestedSaved", [domain]),
    "ignore-for-site": getMessage("popupRelatedOverrideSiteIgnoredSaved", [domain])
  };

  return messages[action];
}

function updateCandidateRowSelection(row: HTMLElement, checkbox: HTMLInputElement): void {
  row.dataset.selected = checkbox.checked && !checkbox.disabled ? "true" : "false";
  updateRelatedDomainBatchAction();
}

function selectedRelatedDomainSet(root: ParentNode = getElement<HTMLElement>("#related-domain-preview")): Set<string> {
  const selectedDomains = new Set(
    Array.from(root.querySelectorAll<HTMLInputElement>('input[data-related-domain]:checked:not(:disabled)')).map(
      (checkbox) => checkbox.dataset.relatedDomain ?? ""
    )
  );

  selectedDomains.delete("");
  return selectedDomains;
}

function syncRelatedDomainCandidateSelections(): void {
  const selectedDomains = selectedRelatedDomainSet();

  relatedDomainCandidateViews = relatedDomainCandidateViews.map((candidate) => ({
    ...candidate,
    selected: candidate.saveable && selectedDomains.has(candidate.domain)
  }));

  if (relatedDomainPopupView) {
    relatedDomainPopupView = {
      ...relatedDomainPopupView,
      candidates: relatedDomainCandidateViews
    };
  }
}

function updateRelatedDomainBatchAction(): void {
  const preview = getElement<HTMLElement>("#related-domain-preview");
  const panel = preview.querySelector<HTMLElement>("[data-related-domain-batch-panel]");
  const addButton = preview.querySelector<HTMLButtonElement>("#related-domain-batch-add");

  if (!panel || !addButton) {
    return;
  }

  const selectedCount = selectedRelatedDomainSet(preview).size;

  panel.hidden = selectedCount === 0;
  addButton.disabled = selectedCount === 0;
  addButton.textContent = relatedDomainBatchAddActionLabel(selectedCount);
}

function createRelatedDomainCandidateRow(candidate: RelatedDomainCandidateView, rowIndex: number): HTMLElement {
  const row = document.createElement("div");

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
    checkbox.setAttribute("aria-label", getMessage("popupRelatedSelectAria", [relatedDomainAddActionLabel(candidate)]));
    checkbox.addEventListener("change", () => {
      updateCandidateRowSelection(row, checkbox);
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
    candidate.routeTargetReasonLabel,
    candidateIncludeSubdomainsLabel(candidate),
    getMessage("popupRelatedObservedHosts", [formatObservedHosts(candidate.sourceHosts)]),
    candidateCoverageLabel(candidate)
  ].join(" · ");

  content.append(domain, meta);
  row.append(content);

  if (candidate.saveable || candidate.added || candidate.expanded) {
    const addButton = document.createElement("button");

    addButton.type = "button";
    addButton.className = "candidate-add-action";
    addButton.textContent = candidate.added
      ? getMessage("commonAdded")
      : candidate.expanded
        ? getMessage("popupRelatedExpanded")
        : relatedDomainAddActionLabel(candidate);
    addButton.disabled = candidate.added === true || candidate.expanded === true;
    addButton.dataset.relatedDomainAdd = candidate.domain;
    addButton.dataset.state = candidate.added || candidate.expanded ? "added" : "available";
    addButton.setAttribute(
      "aria-label",
      candidate.added || candidate.expanded
        ? candidate.expanded
          ? getMessage("popupRelatedExpandedAria", [candidate.domain])
          : getMessage("popupRelatedAddedAria", [candidate.domain])
        : relatedDomainAddActionLabel(candidate)
    );
    row.append(addButton);
  }

  if (candidate.overrideActions.length > 0) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const actions = document.createElement("span");
    const actionsId = `candidate-actions-${candidate.category}-${rowIndex}-${candidate.domain.replace(/[^a-z0-9-]/gi, "-")}`;

    details.className = "candidate-more-actions";
    summary.textContent = getMessage("popupRelatedMoreActions");
    summary.setAttribute("aria-expanded", "false");
    summary.setAttribute("aria-controls", actionsId);
    actions.className = "candidate-actions";
    actions.id = actionsId;

    for (const action of candidate.overrideActions) {
      const actionButton = document.createElement("button");

      actionButton.type = "button";
      actionButton.className = "candidate-action";
      actionButton.textContent = relatedDomainOverrideActionLabel(action);
      actionButton.dataset.overrideAction = action;
      actionButton.dataset.overrideDomain = candidate.domain;
      actions.append(actionButton);
    }

    details.addEventListener("toggle", () => {
      summary.setAttribute("aria-expanded", details.open ? "true" : "false");
    });
    details.append(summary, actions);
    row.append(details);
  }

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

function createRelatedDomainHeader(): HTMLElement {
  const header = document.createElement("div");
  const title = document.createElement("strong");
  const backButton = document.createElement("button");

  header.className = "related-domain-header";
  title.textContent = getMessage("popupRelatedTitle");
  backButton.type = "button";
  backButton.className = "related-domain-back";
  backButton.textContent = getMessage("popupRelatedBack");
  backButton.dataset.relatedDomainBack = "true";
  header.append(title, backButton);

  return header;
}

function createRelatedDomainBatchPanel(): HTMLElement {
  const panel = document.createElement("div");
  const addButton = document.createElement("button");

  panel.className = "candidate-batch-panel";
  panel.dataset.relatedDomainBatchPanel = "true";
  panel.hidden = true;
  addButton.type = "button";
  addButton.id = "related-domain-batch-add";
  addButton.dataset.relatedDomainBatchAdd = "true";
  panel.append(addButton);

  return panel;
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
  resetPopupScopeEditor();
  currentSyncSettingsSnapshot = null;
  setRelatedDomainRecordingButtonVisibility({
    startVisible: false,
    stopVisible: false,
    cancelVisible: false,
    kind: "neutral"
  });
  getElement<HTMLElement>("#current-domain").textContent = getMessage("commonNotAvailable");
  const routeStatus = getElement<HTMLElement>("#route-status");
  setStatus(routeStatus, result.message, "error");
  routeStatus.dataset.appearance = "blocked";
  routeStatus.dataset.routeState = "blocked";
  routeStatus.setAttribute("role", "status");
  routeStatus.setAttribute("aria-label", result.message);
  setStatus(getElement<HTMLElement>("#action-status"), getMessage("popupOpenRegularWebsite"), "neutral");
  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site-direct"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#remove-current-site"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#change-current-site-scope"), false);
  getElement<HTMLElement>("#quick-action-scope-copy").hidden = true;
  setButtonVisible(getElement<HTMLButtonElement>("#check-via-proxy"), false);
  setButtonVisible(getElement<HTMLButtonElement>("#preview-related-domains"), false);
}

function renderSupported(
  domain: string,
  settings: SyncSettings,
  options: { preserveRelatedDomainPreview?: boolean } = {}
): void {
  resetDiagnosticOffer();

  if (!options.preserveRelatedDomainPreview) {
    resetRelatedDomainPreview();
  }

  resetPopupScopeEditor();
  currentSyncSettingsSnapshot = settings;
  const status = getPopupRuleStatus(domain, settings);
  const routeStatus = getPopupRouteStatusView(domain, settings, currentDeviceProxySettings);
  const showProxyAction =
    status.state === "none" || (status.state === "inherited" && status.action === "direct");
  const showDirectAction =
    status.state === "none" || (status.state === "inherited" && status.action === "proxy");

  getElement<HTMLElement>("#current-domain").textContent = domain;
  renderRouteStatus(routeStatus);
  setStatus(getElement<HTMLElement>("#action-status"), getMessage("popupUseExplicitControls"), "neutral");

  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site"), showProxyAction);
  setButtonVisible(getElement<HTMLButtonElement>("#add-current-site-direct"), showDirectAction);
  setButtonVisible(getElement<HTMLButtonElement>("#remove-current-site"), status.state === "exact");
  setButtonVisible(getElement<HTMLButtonElement>("#change-current-site-scope"), status.state === "exact");
  getElement<HTMLElement>("#quick-action-scope-copy").hidden = !showProxyAction && !showDirectAction;
  setButtonVisible(
    getElement<HTMLButtonElement>("#check-via-proxy"),
    status.state !== "blocked" && status.state !== "conflict"
  );
  setButtonVisible(
    getElement<HTMLButtonElement>("#preview-related-domains"),
    status.state !== "blocked" && status.state !== "conflict"
  );
}

async function refreshPopup(): Promise<CurrentTabDomainResult> {
  const activeTab = await getActiveTab();
  const result = getCurrentTabDomain(activeTab.url);

  if (!result.ok) {
    renderUnsupported(result);
    return result;
  }

  const [settings, localSettings] = await Promise.all([getSyncSettings(), getLocalSettings()]);
  currentDeviceProxySettings = localSettings.deviceProxy;
  renderSupported(result.domain, settings);
  await refreshRelatedDomainRecordingControls(activeTab);
  return result;
}

async function handleAddCurrentSite(action: RuleAction): Promise<void> {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();
  const result = getCurrentTabDomain(await getActiveTabUrl());
  const actionStatus = getElement<HTMLElement>("#action-status");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  const current = await getSyncSettings();
  const addResult = addCurrentSiteRule(current.rules, result.domain, new Date().toISOString(), "manual", action);

  if (!addResult.ok) {
    setStatus(actionStatus, addResult.error, "error");
    return;
  }

  if (addResult.status === "duplicate") {
    renderSupported(result.domain, current);
    setStatus(actionStatus, getMessage("popupRuleAlreadyExists", [addResult.domain, ruleActionLabel(action)]), "neutral");
    return;
  }

  if (addResult.status === "inherited") {
    renderSupported(result.domain, current);
    setStatus(
      actionStatus,
      getMessage("popupRuleInherited", [addResult.domain, ruleActionLabel(action), addResult.parentRule?.domain ?? ""]),
      "neutral"
    );
    return;
  }

  const proposedRule = addResult.rules[current.rules.length];
  const finalAdd = await addSyncRules([proposedRule]);

  if (!finalAdd.ok) {
    renderSupported(result.domain, finalAdd.settings);
    setStatus(actionStatus, finalAdd.error, "error");
    return;
  }

  const updated = finalAdd.settings;

  if (finalAdd.addedRules.length === 0) {
    renderSupported(result.domain, updated);
    setStatus(actionStatus, getMessage("popupRuleAlreadyExists", [addResult.domain, ruleActionLabel(action)]), "neutral");
    return;
  }

  renderSupported(result.domain, updated);
  setStatus(actionStatus, getMessage("popupRuleAdded", [ruleActionLabel(action), addResult.domain]), "success");
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
      getMessage("popupParentRuleEdit", [removeResult.domain, removeResult.parentRule?.domain ?? ""]),
      "neutral"
    );
    return;
  }

  if (removeResult.status === "not-found") {
    renderSupported(result.domain, current);
    setStatus(actionStatus, getMessage("popupNoExactRule", [removeResult.domain]), "neutral");
    return;
  }

  const updated = await updateSyncSettings({
    rules: removeResult.rules
  });

  renderSupported(result.domain, updated);
  setStatus(actionStatus, getMessage("popupExactRuleRemoved", [removeResult.domain]), "success");
}

async function handleConfirmScopeChange(): Promise<void> {
  const plan = pendingPopupScopePlan;
  const actionStatus = getElement<HTMLElement>("#action-status");

  if (!plan) {
    setStatus(actionStatus, getMessage("popupChooseBroaderScope"), "error");
    return;
  }

  const currentDomain = getCurrentTabDomain(await getActiveTabUrl());

  if (!currentDomain.ok) {
    renderUnsupported(currentDomain);
    return;
  }

  const updateResult = await updateSyncRule(plan.ruleId, plan.proposedRule);

  if (!updateResult.ok) {
    currentSyncSettingsSnapshot = updateResult.settings;
    setStatus(actionStatus, updateResult.error, "error");
    return;
  }

  renderSupported(currentDomain.domain, updateResult.settings);
  setStatus(
    actionStatus,
    getMessage("popupScopeChanged", [plan.proposedRule.domain]),
    "success"
  );
}

async function requestCurrentSiteDiagnostic(url: string): Promise<CurrentSiteDiagnosticResponse> {
  const response = (await chrome.runtime.sendMessage({
    type: currentSiteDiagnosticMessageType,
    url
  })) as unknown;

  if (!isCurrentSiteDiagnosticResponse(response)) {
    return {
      status: "error",
      message: getMessage("popupCouldNotCheckProxy")
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
      message: getMessage("popupCouldNotPreviewRelated")
    };
  }

  return response;
}

async function requestRelatedDomainRecording(input: {
  action: "get-state" | "start" | "stop" | "cancel";
  tabId?: number;
  url?: string;
}): Promise<RelatedDomainRecordingResponse> {
  const response = (await chrome.runtime.sendMessage({
    type: relatedDomainRecordingMessageType,
    ...input
  })) as unknown;

  if (!isRelatedDomainRecordingResponse(response)) {
    return {
      status: "error",
      message: localizedMessage("popupCouldNotHandleRecording"),
      state: { status: "idle" }
    };
  }

  return response;
}

export function relatedDomainRecordingResponseMessage(
  response: Pick<RelatedDomainRecordingResponse, "message">
): string {
  return resolveLocalizedMessage(response.message);
}

async function refreshRelatedDomainRecordingControls(activeTab: ActiveTabSnapshot): Promise<void> {
  const response = await requestRelatedDomainRecording({ action: "get-state" });
  const controlView = buildRelatedDomainRecordingControlView(response.state, activeTab.id);

  setRelatedDomainRecordingButtonVisibility(controlView);

  if (controlView.message) {
    setStatus(getElement<HTMLElement>("#action-status"), controlView.message, controlView.kind);
  }
}

function renderRelatedDomainPreview(view: RelatedDomainPopupView, currentDomain?: string): void {
  const previewElement = getElement<HTMLElement>("#related-domain-preview");

  relatedDomainCandidateViews = view.candidates;
  relatedDomainPopupView = view;
  relatedDomainPreviewDomain = currentDomain ?? null;
  previewElement.replaceChildren();

  if (view.candidates.length === 0) {
    if (view.diagnosticSummary) {
      previewElement.append(createRelatedDomainHeader(), createRelatedDomainDiagnosticSummary(view.diagnosticSummary));
      previewElement.hidden = false;
      return;
    }

    relatedDomainPopupView = null;
    relatedDomainPreviewDomain = null;
    previewElement.hidden = true;
    return;
  }

  const candidateGroups = groupRelatedDomainCandidateViews(view.candidates);
  const candidateList = document.createElement("div");

  candidateList.className = "candidate-list";

  renderRelatedDomainCandidateGroup(
    candidateList,
    candidateGroupTitle("strong"),
    candidateGroups.strong
  );
  renderRelatedDomainCandidateGroup(
    candidateList,
    candidateGroupTitle("medium"),
    candidateGroups.medium
  );
  renderRelatedDomainCandidateGroup(
    candidateList,
    candidateGroupTitle("alreadyCovered"),
    candidateGroups.alreadyCovered
  );
  renderRelatedDomainCandidateGroup(
    candidateList,
    candidateGroupTitle("conflict"),
    candidateGroups.conflict
  );
  renderRelatedDomainCandidateGroup(
    candidateList,
    candidateGroupTitle("ignored"),
    candidateGroups.ignored
  );

  if (view.hiddenSaveableCount > 0 || view.hiddenAlreadyCoveredCount > 0 || view.hiddenIgnoredCount > 0) {
    const note = document.createElement("p");

    note.className = "candidate-note";
    note.textContent = [
      view.hiddenSaveableCount > 0
        ? getMessage(view.hiddenSaveableCount === 1 ? "popupRelatedHiddenSaveableOne" : "popupRelatedHiddenSaveable", [
            view.hiddenSaveableCount
          ])
        : "",
      view.hiddenAlreadyCoveredCount > 0
        ? getMessage(
            view.hiddenAlreadyCoveredCount === 1 ? "popupRelatedHiddenCoveredOne" : "popupRelatedHiddenCovered",
            [view.hiddenAlreadyCoveredCount]
          )
        : "",
      view.hiddenIgnoredCount > 0
        ? getMessage(view.hiddenIgnoredCount === 1 ? "popupRelatedHiddenIgnoredOne" : "popupRelatedHiddenIgnored", [
            view.hiddenIgnoredCount
          ])
        : ""
    ]
      .filter(Boolean)
      .join(". ");
    candidateList.append(note);
  }

  if (view.diagnosticSummary) {
    candidateList.append(createRelatedDomainDiagnosticSummary(view.diagnosticSummary));
  }

  previewElement.append(createRelatedDomainHeader(), candidateList, createRelatedDomainBatchPanel());
  previewElement.hidden = false;
  updateRelatedDomainBatchAction();
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
    setStatus(actionStatus, getMessage("popupOpenSiteBeforeCheck"), "error");
    return;
  }

  checkButton.disabled = true;
  setStatus(actionStatus, getMessage("popupCheckingProxy"), "neutral");

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

async function loadRelatedDomainPreview(options: {
  loadingMessage?: string;
  successMessage?: string;
  successKind?: MessageKind;
} = {}): Promise<void> {
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
    setStatus(actionStatus, getMessage("popupOpenSiteBeforePreview"), "error");
    return;
  }

  previewButton.disabled = true;
  setStatus(
    actionStatus,
    options.loadingMessage ?? getMessage("popupPreviewingRelated"),
    "neutral"
  );

  try {
    const preview = await requestRelatedDomainPreview(activeTab.id, activeTab.url);
    const current = await getSyncSettings();
    const previewView = buildRelatedDomainPopupView(preview, current);

    renderRelatedDomainPreview(previewView, preview.currentDomain);
    setStatus(actionStatus, options.successMessage ?? previewView.message, options.successKind ?? previewView.kind);
  } finally {
    previewButton.disabled = false;
  }
}

async function handlePreviewRelatedDomains(): Promise<void> {
  await loadRelatedDomainPreview();
}

async function handleStartRelatedDomainRecording(): Promise<void> {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();

  const activeTab = await getActiveTab();
  const result = getCurrentTabDomain(activeTab.url);
  const actionStatus = getElement<HTMLElement>("#action-status");
  const startButton = getElement<HTMLButtonElement>("#start-related-domain-recording");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  if (typeof activeTab.id !== "number" || !activeTab.url) {
    setStatus(actionStatus, getMessage("popupOpenSiteBeforeRecording"), "error");
    return;
  }

  startButton.disabled = true;
  setStatus(actionStatus, getMessage("popupRecordingStarting"), "neutral");

  try {
    const recording = await requestRelatedDomainRecording({
      action: "start",
      tabId: activeTab.id,
      url: activeTab.url
    });
    const controlView = buildRelatedDomainRecordingControlView(recording.state, activeTab.id);

    setRelatedDomainRecordingButtonVisibility(controlView);
    setStatus(
      actionStatus,
      relatedDomainRecordingResponseMessage(recording),
      recording.status === "unsupported_url" ? "error" : "neutral"
    );
  } finally {
    startButton.disabled = false;
  }
}

async function handleStopRelatedDomainRecording(): Promise<void> {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();

  const activeTab = await getActiveTab();
  const result = getCurrentTabDomain(activeTab.url);
  const actionStatus = getElement<HTMLElement>("#action-status");
  const stopButton = getElement<HTMLButtonElement>("#stop-related-domain-recording");

  if (!result.ok) {
    renderUnsupported(result);
    return;
  }

  if (typeof activeTab.id !== "number" || !activeTab.url) {
    setStatus(actionStatus, getMessage("popupOpenRecordedSite"), "error");
    return;
  }

  stopButton.disabled = true;
  setStatus(actionStatus, getMessage("popupRecordingStopping"), "neutral");

  try {
    const recording = await requestRelatedDomainRecording({
      action: "stop",
      tabId: activeTab.id,
      url: activeTab.url
    });
    const controlView = buildRelatedDomainRecordingControlView(recording.state, activeTab.id);

    setRelatedDomainRecordingButtonVisibility(controlView);

    if (recording.preview) {
      const current = await getSyncSettings();
      const previewView = buildRelatedDomainPopupView(recording.preview, current);

      renderRelatedDomainPreview(previewView, recording.preview.currentDomain);
      setStatus(actionStatus, getMessage("popupRecordedSession", [previewView.message]), previewView.kind);
      return;
    }

    setStatus(
      actionStatus,
      relatedDomainRecordingResponseMessage(recording),
      recording.status === "not_found" || recording.status === "collection_unavailable" ? "error" : "neutral"
    );
  } finally {
    stopButton.disabled = false;
  }
}

async function handleCancelRelatedDomainRecording(): Promise<void> {
  resetDiagnosticOffer();
  resetRelatedDomainPreview();

  const activeTab = await getActiveTab();
  const actionStatus = getElement<HTMLElement>("#action-status");
  const cancelButton = getElement<HTMLButtonElement>("#cancel-related-domain-recording");

  cancelButton.disabled = true;
  setStatus(actionStatus, getMessage("popupRecordingCancelling"), "neutral");

  try {
    const recording = await requestRelatedDomainRecording({
      action: "cancel",
      tabId: activeTab.id,
      url: activeTab.url
    });
    const controlView = buildRelatedDomainRecordingControlView(recording.state, activeTab.id);

    setRelatedDomainRecordingButtonVisibility(controlView);
    setStatus(
      actionStatus,
      relatedDomainRecordingResponseMessage(recording),
      recording.status === "success" ? "neutral" : "error"
    );
  } finally {
    cancelButton.disabled = false;
  }
}

async function handleRelatedDomainClassificationOverride(button: HTMLButtonElement): Promise<void> {
  resetDiagnosticOffer();
  const actionStatus = getElement<HTMLElement>("#action-status");
  const action = button.dataset.overrideAction;
  const candidateDomain = button.dataset.overrideDomain ?? "";
  const currentResult = getCurrentTabDomain(await getActiveTabUrl());

  if (!currentResult.ok) {
    renderUnsupported(currentResult);
    return;
  }

  if (!isRelatedDomainPreviewCurrent(currentResult.domain, relatedDomainPreviewDomain)) {
    setStatus(actionStatus, getMessage("popupRelatedPreviewAgainOverride"), "error");
    return;
  }

  if (!isDomainCandidateUserOverrideAction(action)) {
    setStatus(actionStatus, getMessage("popupRelatedChooseOverride"), "error");
    return;
  }

  button.disabled = true;
  setStatus(actionStatus, getMessage("popupRelatedSavingOverride"), "neutral");

  try {
    const current = await getSyncSettings();
    const addResult = addRelatedDomainClassificationOverride(
      current.classificationOverrides,
      currentResult.domain,
      candidateDomain,
      action
    );

    if (!addResult.ok) {
      setStatus(actionStatus, addResult.error, "error");
      return;
    }

    await updateSyncSettings({
      classificationOverrides: addResult.classificationOverrides
    });

    await loadRelatedDomainPreview({
      loadingMessage: getMessage("popupRelatedRefreshing"),
      successMessage: relatedDomainOverrideSavedMessage(action, addResult.override.domain),
      successKind: "success"
    });
  } finally {
    button.disabled = false;
  }
}

function renderRelatedDomainAddResult(
  currentDomain: string,
  settings: SyncSettings,
  requestedDomains: ReadonlySet<string>,
  addedDomains: ReadonlySet<string>,
  clearRequestedSelection: boolean,
  expandedDomains: ReadonlySet<string> = new Set()
): void {
  relatedDomainCandidateViews = updateRelatedDomainCandidateViewsAfterAdd(
    relatedDomainCandidateViews,
    settings.rules,
    requestedDomains,
    addedDomains,
    clearRequestedSelection,
    expandedDomains
  );

  renderSupported(currentDomain, settings, { preserveRelatedDomainPreview: true });

  if (relatedDomainPopupView) {
    renderRelatedDomainPreview(
      {
        ...relatedDomainPopupView,
        candidates: relatedDomainCandidateViews
      },
      currentDomain
    );
  }
}

async function handleAddRelatedDomains(
  selectedDomains: ReadonlySet<string>,
  mode: "individual" | "batch"
): Promise<void> {
  resetDiagnosticOffer();
  const actionStatus = getElement<HTMLElement>("#action-status");
  const currentResult = getCurrentTabDomain(await getActiveTabUrl());

  if (!currentResult.ok) {
    renderUnsupported(currentResult);
    return;
  }

  if (!isRelatedDomainPreviewCurrent(currentResult.domain, relatedDomainPreviewDomain)) {
    setStatus(actionStatus, getMessage("popupRelatedPreviewAgainAdd"), "error");
    return;
  }

  if (selectedDomains.size === 0) {
    setStatus(actionStatus, getMessage("popupRelatedSelectOne"), "neutral");
    return;
  }

  syncRelatedDomainCandidateSelections();
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
    renderRelatedDomainAddResult(
      currentResult.domain,
      current,
      selectedDomains,
      new Set(),
      mode === "batch"
    );
    setStatus(actionStatus, saveStatus.message, saveStatus.kind);
    return;
  }

  const expandedRules = addResult.expandedRules ?? [];
  const finalAdd =
    expandedRules.length > 0
      ? await applySyncRuleChanges(
          expandedRules.map((rule) => ({
            ruleId: getRuleStableId(rule),
            proposed: {
              domain: rule.domain,
              includeSubdomains: true,
              action: rule.action
            }
          })),
          addResult.addedRules
        )
      : await addSyncRules(addResult.addedRules).then((result) =>
          result.ok ? { ...result, expandedRules: [] } : result
        );

  if (!finalAdd.ok) {
    renderSupported(currentResult.domain, finalAdd.settings, { preserveRelatedDomainPreview: true });
    setStatus(actionStatus, finalAdd.error, "error");
    return;
  }

  const updated = finalAdd.settings;
  const addedDomains = new Set(finalAdd.addedRules.map((rule) => rule.domain));
  const expandedDomains = new Set(finalAdd.expandedRules.map((rule) => rule.domain));
  const finalSaveStatus = getRelatedDomainSaveActionStatus(
    finalAdd.addedRules.length > 0 || finalAdd.expandedRules.length > 0
      ? {
          ok: true,
          status: "added",
          rules: updated.rules,
          addedRules: finalAdd.addedRules,
          expandedRules: finalAdd.expandedRules,
          skippedDomains: [
            ...addResult.skippedDomains,
            ...finalAdd.duplicateRules.map((rule) => rule.domain)
          ]
        }
      : {
          ok: true,
          status: "no-new-rules",
          rules: updated.rules,
          addedRules: [],
          expandedRules: [],
          skippedDomains: [
            ...addResult.skippedDomains,
            ...finalAdd.duplicateRules.map((rule) => rule.domain)
          ]
        }
  );

  renderRelatedDomainAddResult(
    currentResult.domain,
    updated,
    selectedDomains,
    addedDomains,
    mode === "batch",
    expandedDomains
  );
  setStatus(actionStatus, finalSaveStatus.message, finalSaveStatus.kind);
}

async function handleSaveDiagnosticRule(): Promise<void> {
  const domain = checkedReachableDomain;
  const actionStatus = getElement<HTMLElement>("#action-status");
  resetRelatedDomainPreview();

  if (!domain) {
    setStatus(actionStatus, getMessage("popupRunSuccessfulCheck"), "neutral");
    return;
  }

  const currentResult = getCurrentTabDomain(await getActiveTabUrl());

  if (!currentResult.ok || currentResult.domain !== domain) {
    resetDiagnosticOffer();
    setStatus(actionStatus, getMessage("popupRunCheckAgain"), "error");
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
    setStatus(actionStatus, getMessage("popupRuleAlreadyExists", [addResult.domain, getMessage("ruleActionProxyLower")]), "neutral");
    return;
  }

  if (addResult.status === "inherited") {
    renderSupported(domain, current);
    setStatus(
      actionStatus,
      getMessage("popupRuleInherited", [
        addResult.domain,
        getMessage("ruleActionProxyLower"),
        addResult.parentRule?.domain ?? ""
      ]),
      "neutral"
    );
    return;
  }

  const proposedRule = addResult.rules[current.rules.length];
  const finalAdd = await addSyncRules([proposedRule]);

  if (!finalAdd.ok) {
    renderSupported(domain, finalAdd.settings);
    setStatus(actionStatus, finalAdd.error, "error");
    return;
  }

  const updated = finalAdd.settings;

  if (finalAdd.addedRules.length === 0) {
    renderSupported(domain, updated);
    setStatus(actionStatus, getMessage("popupRuleAlreadyExists", [addResult.domain, getMessage("ruleActionProxyLower")]), "neutral");
    return;
  }

  renderSupported(domain, updated);
  setStatus(actionStatus, getMessage("popupRuleAdded", [getMessage("ruleActionProxyLower"), addResult.domain]), "success");
}

async function initPopupPage(): Promise<void> {
  const localSettings = await getLocalSettings();
  setLanguagePreference(localSettings.language ?? "auto");
  localizeDocument();
  getElement<HTMLButtonElement>("#change-current-site-scope").addEventListener("click", () => {
    openPopupScopeEditor();
  });

  getElement<HTMLSelectElement>("#scope-change-select").addEventListener("change", () => {
    refreshPopupScopePlan();
  });

  getElement<HTMLButtonElement>("#confirm-scope-change").addEventListener("click", () => {
    void handleConfirmScopeChange().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotUpdateScope"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#cancel-scope-change").addEventListener("click", () => {
    resetPopupScopeEditor();
    setStatus(getElement<HTMLElement>("#action-status"), getMessage("popupScopeChangeCancelled"), "neutral");
  });

  getElement<HTMLButtonElement>("#add-current-site").addEventListener("click", () => {
    void handleAddCurrentSite("proxy").catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotAddSite"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#add-current-site-direct").addEventListener("click", () => {
    void handleAddCurrentSite("direct").catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotAddDirect"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#remove-current-site").addEventListener("click", () => {
    void handleRemoveCurrentSite().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotRemoveSite"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#check-via-proxy").addEventListener("click", () => {
    void handleCheckViaProxy().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotCheckProxy"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#preview-related-domains").addEventListener("click", () => {
    void handlePreviewRelatedDomains().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotPreviewRelated"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#start-related-domain-recording").addEventListener("click", () => {
    void handleStartRelatedDomainRecording().catch(() => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        getMessage("popupCouldNotStartRecording"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#stop-related-domain-recording").addEventListener("click", () => {
    void handleStopRelatedDomainRecording().catch(() => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        getMessage("popupCouldNotStopRecording"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#cancel-related-domain-recording").addEventListener("click", () => {
    void handleCancelRelatedDomainRecording().catch(() => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        getMessage("popupCouldNotCancelRecording"),
        "error"
      );
    });
  });

  getElement<HTMLElement>("#related-domain-preview").addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");

    if (!button) {
      return;
    }

    if (button.dataset.relatedDomainBack) {
      resetRelatedDomainPreview();
      setStatus(getElement<HTMLElement>("#action-status"), getMessage("popupShowingSiteStatus"), "neutral");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const candidateDomain = button.dataset.relatedDomainAdd;

    if (candidateDomain) {
      button.disabled = true;
      void handleAddRelatedDomains(new Set([candidateDomain]), "individual")
        .catch((error: unknown) => {
          setStatus(
            getElement<HTMLElement>("#action-status"),
            error instanceof Error ? error.message : getMessage("popupCouldNotAddRelated"),
            "error"
          );
        })
        .finally(() => {
          if (button.isConnected && button.dataset.state !== "added") {
            button.disabled = false;
          }
        });
      return;
    }

    if (button.dataset.relatedDomainBatchAdd) {
      const selectedDomains = selectedRelatedDomainSet();

      button.disabled = true;
      void handleAddRelatedDomains(selectedDomains, "batch")
        .catch((error: unknown) => {
          setStatus(
            getElement<HTMLElement>("#action-status"),
            error instanceof Error ? error.message : getMessage("popupCouldNotAddSelected"),
            "error"
          );
        })
        .finally(() => {
          if (button.isConnected) {
            updateRelatedDomainBatchAction();
          }
        });
      return;
    }

    if (!button.dataset.overrideAction) {
      return;
    }

    void handleRelatedDomainClassificationOverride(button).catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotSaveOverride"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#save-diagnostic-rule").addEventListener("click", () => {
    void handleSaveDiagnosticRule().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#action-status"),
        error instanceof Error ? error.message : getMessage("popupCouldNotAddChecked"),
        "error"
      );
    });
  });

  getElement<HTMLButtonElement>("#open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  await refreshPopup().catch((error: unknown) => {
    setStatus(
      getElement<HTMLElement>("#route-status"),
      error instanceof Error ? error.message : getMessage("popupCouldNotLoad"),
      "error"
    );
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    void initPopupPage();
  });
}
