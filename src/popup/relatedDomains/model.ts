import type { DomainCandidateUserOverrideAction } from "../../domainClassification/domainClassificationTypes";
import { upsertUserClassificationOverride } from "../../domainClassification/userClassificationOverrides";
import type {
  UpsertUserClassificationOverrideResult,
  UserClassificationOverrides
} from "../../domainClassification/userClassificationOverrides";
import type {
  CurrentPageResourceHostPreviewSummary,
  CurrentPageResourceHostResultState,
  CurrentPageResourceHostsResponse
} from "../../diagnostics/currentPageResourceHosts";
import type {
  RelatedDomainCandidate,
  RelatedDomainCandidateReason,
  RelatedDomainRouteTargetConfidence,
  RelatedDomainRouteTargetReason
} from "../../diagnostics/relatedDomainCandidates";
import { checkDenylistedHost } from "../../rules/denylist";
import { canonicalizeHostname } from "../../rules/canonicalizeHostname";
import { domainMatchesRule, findEffectiveDomainRule } from "../../rules/domainMatcher";
import { getRuleStableId, replaceRuleAtomically } from "../../rules/ruleEditing";
import type { DomainRule, RuleAction, RuleSource } from "../../rules/ruleTypes";
import type { SyncSettings } from "../../storage/storageTypes";

export type RelatedDomainPopupResultState =
  | CurrentPageResourceHostResultState
  | "hosts_collected_but_all_already_covered";

export type RelatedDomainCandidateCategory = "strong" | "medium" | "ignored";

export type RelatedDomainCandidateGroupKey = "strong" | "medium" | "alreadyCovered" | "conflict" | "ignored";

export type RelatedDomainCandidateModel = {
  category: RelatedDomainCandidateCategory;
  domain: string;
  suggestedRuleDomain: string;
  reasonCode: RelatedDomainCandidateReason;
  routeTargetReason?: RelatedDomainRouteTargetReason;
  routeTargetConfidence?: RelatedDomainRouteTargetConfidence;
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

export type RelatedDomainCandidateCollection = {
  resultState?: RelatedDomainPopupResultState;
  summary: RelatedDomainPopupSummary;
  allCandidates: RelatedDomainCandidateModel[];
  candidates: RelatedDomainCandidateModel[];
  hiddenSaveableCount: number;
  hiddenAlreadyCoveredCount: number;
  hiddenIgnoredCount: number;
};

export type PrepareSelectedRelatedDomainRulesResult =
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
      reason: "action-conflict";
      action: RuleAction;
      domain: string;
    }
  | {
      ok: false;
      reason: "rule-edit-failed";
      error: string;
    };

export type AddRelatedDomainClassificationOverrideResult = UpsertUserClassificationOverrideResult;

const relatedDomainSaveableCandidateLimit = 12;
const relatedDomainAlreadyCoveredCandidateLimit = 6;
const relatedDomainIgnoredCandidateLimit = 4;

function normalizeKnownDomain(input: string): string | null {
  const normalized = canonicalizeHostname(input);

  return normalized.ok ? normalized.domain : null;
}

export function isRelatedDomainPreviewCurrent(currentDomain: string, previewDomain: string | null): boolean {
  if (!previewDomain) {
    return false;
  }

  const normalizedCurrentDomain = normalizeKnownDomain(currentDomain);
  const normalizedPreviewDomain = normalizeKnownDomain(previewDomain);

  return normalizedCurrentDomain !== null && normalizedCurrentDomain === normalizedPreviewDomain;
}

function isStoredDenylistedDomain(domain: string, denylist: readonly string[]): boolean {
  return denylist.some((entry) => domainMatchesRule(domain, { domain: entry, includeSubdomains: true }));
}

export function normalizeSafeRelatedDomain(input: string, denylist: readonly string[] = []): string | null {
  const normalized = canonicalizeHostname(input);

  if (!normalized.ok) {
    return null;
  }

  if (checkDenylistedHost(normalized.domain).denied || isStoredDenylistedDomain(normalized.domain, denylist)) {
    return null;
  }

  return normalized.domain;
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

function checkRelatedDomainRouteTargetAddition(
  rules: readonly DomainRule[],
  proposedRule: Pick<DomainRule, "domain" | "includeSubdomains" | "action">
): "available" | "duplicate" | "conflict" {
  const proposedDomain = normalizeKnownDomain(proposedRule.domain);
  const matchingRules = rules.filter(
    (rule) =>
      normalizeKnownDomain(rule.domain) === proposedDomain &&
      rule.includeSubdomains === proposedRule.includeSubdomains
  );

  if (matchingRules.some((rule) => rule.action !== proposedRule.action)) {
    return "conflict";
  }

  return matchingRules.some((rule) => rule.action === proposedRule.action) ? "duplicate" : "available";
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

function candidateModelFromCandidate(
  candidate: RelatedDomainCandidate,
  category: RelatedDomainCandidateCategory,
  settings: Pick<SyncSettings, "rules" | "denylist">,
  action: RuleAction
): RelatedDomainCandidateModel | null {
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

  return {
    category,
    domain,
    suggestedRuleDomain: domain,
    reasonCode: candidate.reason,
    ...(candidate.routeTargetReason ? { routeTargetReason: candidate.routeTargetReason } : {}),
    ...(candidate.routeTargetConfidence ? { routeTargetConfidence: candidate.routeTargetConfidence } : {}),
    sourceHosts: [...candidate.sourceHosts],
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

export function getRelatedDomainPreviewSummary(
  preview: CurrentPageResourceHostsResponse
): CurrentPageResourceHostPreviewSummary {
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

function capRelatedDomainCandidates(candidates: readonly RelatedDomainCandidateModel[]): {
  candidates: RelatedDomainCandidateModel[];
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

export function buildRelatedDomainCandidateCollection(
  preview: CurrentPageResourceHostsResponse,
  settings: Pick<SyncSettings, "rules" | "denylist">,
  action: RuleAction = "proxy"
): RelatedDomainCandidateCollection {
  const baseSummary = getRelatedDomainPreviewSummary(preview);

  if (preview.status !== "success" || !preview.candidates) {
    return {
      resultState: preview.resultState,
      summary: {
        ...baseSummary,
        alreadyCoveredCandidates: 0,
        saveableCandidates: 0
      },
      allCandidates: [],
      candidates: [],
      hiddenSaveableCount: 0,
      hiddenAlreadyCoveredCount: 0,
      hiddenIgnoredCount: 0
    };
  }

  const candidates = [
    ...preview.candidates.strongCandidates.map((candidate) =>
      candidateModelFromCandidate(candidate, "strong", settings, action)
    ),
    ...preview.candidates.mediumCandidates.map((candidate) =>
      candidateModelFromCandidate(candidate, "medium", settings, action)
    ),
    ...preview.candidates.ignoredCandidates.map((candidate) =>
      candidateModelFromCandidate(candidate, "ignored", settings, action)
    )
  ].filter((candidate): candidate is RelatedDomainCandidateModel => candidate !== null);
  const reviewableCandidates = candidates.filter((candidate) => candidate.category !== "ignored");
  const saveableCandidates = reviewableCandidates.filter((candidate) => candidate.saveable);
  const alreadyCoveredCandidates = reviewableCandidates.filter((candidate) => candidate.alreadyCovered);
  const resultState: RelatedDomainPopupResultState =
    preview.resultState === "candidates_available" && saveableCandidates.length === 0 && alreadyCoveredCandidates.length > 0
      ? "hosts_collected_but_all_already_covered"
      : preview.resultState ??
        (saveableCandidates.length > 0 ? "candidates_available" : "hosts_collected_but_no_related_candidates");

  return {
    resultState,
    summary: {
      ...baseSummary,
      alreadyCoveredCandidates: alreadyCoveredCandidates.length,
      saveableCandidates: saveableCandidates.length
    },
    allCandidates: candidates,
    ...capRelatedDomainCandidates(candidates)
  };
}

export function groupRelatedDomainCandidateViews<Candidate extends RelatedDomainCandidateModel>(
  candidates: readonly Candidate[]
): Record<RelatedDomainCandidateGroupKey, Candidate[]> {
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

export function updateRelatedDomainCandidateViewsAfterAdd<Candidate extends RelatedDomainCandidateModel>(
  candidates: readonly Candidate[],
  currentRules: readonly DomainRule[],
  requestedDomains: ReadonlySet<string>,
  addedDomains: ReadonlySet<string>,
  clearRequestedSelection: boolean,
  expandedDomains: ReadonlySet<string> = new Set()
): Candidate[] {
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

export function prepareSelectedRelatedDomainRules(
  currentSettings: Pick<SyncSettings, "rules" | "denylist">,
  candidates: readonly RelatedDomainCandidateModel[],
  selectedDomains: ReadonlySet<string>,
  createdAt: string,
  source: RuleSource = "diagnostic"
): PrepareSelectedRelatedDomainRulesResult {
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
        reason: "action-conflict",
        action: exactRule.action,
        domain
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
        return { ok: false, reason: "rule-edit-failed", error: replacement.error };
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
    const targetCheck = checkRelatedDomainRouteTargetAddition(rules, rule);

    if (targetCheck === "conflict") {
      return {
        ok: false,
        reason: "action-conflict",
        action: rules.find(
          (existingRule) =>
            normalizeKnownDomain(existingRule.domain) === domain &&
            existingRule.includeSubdomains === rule.includeSubdomains &&
            existingRule.action !== action
        )?.action ?? (action === "proxy" ? "direct" : "proxy"),
        domain
      };
    }

    if (targetCheck === "duplicate") {
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
