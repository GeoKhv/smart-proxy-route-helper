import {
  canBroadenToRegistrableDomain,
  getRegistrableDomain
} from "../domainClassification/registrableDomain";
import { checkDenylistedHost } from "./denylist";
import { getMessage } from "../i18n/i18n";
import { domainMatchesRule } from "./domainMatcher";
import { normalizeDomain } from "./normalizeDomain";
import { sameRouteTarget } from "./routeTarget";
import type { DomainRule, RuleAction } from "./ruleTypes";

export type RuleScope = "exact" | "hostname-and-subdomains" | "registrable-domain-and-subdomains";

export type RuleScopeOption = {
  scope: RuleScope;
  label: string;
  targetDomain: string;
  includeSubdomains: boolean;
  coverage: string[];
};

export type RuleEditInput = {
  domain: string;
  action: RuleAction;
  scope: RuleScope;
};

export type RuleEditWarningKind =
  | "broader-scope"
  | "covered-by-parent"
  | "overrides-parent"
  | "child-exception-preserved"
  | "child-rule-redundant";

export type RuleEditWarning = {
  kind: RuleEditWarningKind;
  message: string;
  relatedRule?: DomainRule;
};

export type RuleEditPlan =
  | {
      ok: true;
      ruleId: string;
      currentRule: DomainRule;
      proposedRule: DomainRule;
      isBroadening: boolean;
      coverage: string[];
      warnings: RuleEditWarning[];
    }
  | {
      ok: false;
      error: string;
      reason: "invalid-domain" | "unsafe-scope" | "rule-not-found" | "ambiguous-rule" | "no-change" | "duplicate" | "conflict";
    };

export type AtomicRuleReplacementResult =
  | {
      ok: true;
      rules: DomainRule[];
      updatedRule: DomainRule;
      replacedIndex: number;
    }
  | {
      ok: false;
      error: string;
      reason: "invalid-domain" | "rule-not-found" | "ambiguous-rule" | "duplicate" | "conflict";
    };

function normalizedRuleDomain(rule: Pick<DomainRule, "domain">): string {
  const normalized = normalizeDomain(rule.domain);

  return normalized.ok ? normalized.domain : rule.domain.trim().toLowerCase().replace(/\.+$/, "");
}

function actionLabel(action: RuleAction): string {
  return action === "proxy" ? getMessage("commonProxy") : getMessage("commonDirect");
}

function ruleCoversTarget(coveringRule: DomainRule, targetRule: DomainRule): boolean {
  if (!domainMatchesRule(targetRule.domain, coveringRule)) {
    return false;
  }

  return !targetRule.includeSubdomains || coveringRule.includeSubdomains;
}

function isStoredDenylistedDomain(domain: string, denylist: readonly string[]): boolean {
  return denylist.some((entry) => domainMatchesRule(domain, { domain: entry, includeSubdomains: true }));
}

function isSafeRuleDomain(domain: string, denylist: readonly string[]): boolean {
  return !checkDenylistedHost(domain).denied && !isStoredDenylistedDomain(domain, denylist);
}

function legacyRuleId(rule: DomainRule): string {
  return [
    "legacy-rule",
    rule.source,
    encodeURIComponent(rule.createdAt),
    encodeURIComponent(normalizedRuleDomain(rule)),
    rule.includeSubdomains ? "subdomains" : "exact",
    rule.action
  ].join(":");
}

export function getRuleStableId(rule: DomainRule): string {
  const explicitId = rule.id?.trim();

  return explicitId ? explicitId : legacyRuleId(rule);
}

export function getRuleScopeOptions(input: string, denylist: readonly string[] = []): RuleScopeOption[] {
  const normalized = normalizeDomain(input);

  if (!normalized.ok || !isSafeRuleDomain(normalized.domain, denylist)) {
    return [];
  }

  const domain = normalized.domain;
  const options: RuleScopeOption[] = [
    {
      scope: "exact",
      label: getMessage("commonExactHostname"),
      targetDomain: domain,
      includeSubdomains: false,
      coverage: [domain]
    },
    {
      scope: "hostname-and-subdomains",
      label: getMessage("commonHostnameAndSubdomains"),
      targetDomain: domain,
      includeSubdomains: true,
      coverage: [domain, `*.${domain}`]
    }
  ];
  const registrableDomain = getRegistrableDomain(domain);

  if (
    registrableDomain &&
    canBroadenToRegistrableDomain(domain, { targetDomain: registrableDomain }) &&
    isSafeRuleDomain(registrableDomain, denylist)
  ) {
    options.push({
      scope: "registrable-domain-and-subdomains",
      label: getMessage("commonParentDomainAndSubdomains"),
      targetDomain: registrableDomain,
      includeSubdomains: true,
      coverage: [registrableDomain, `*.${registrableDomain}`]
    });
  }

  return options;
}

function findRuleIndexes(rules: readonly DomainRule[], ruleId: string): number[] {
  const indexes: number[] = [];

  rules.forEach((rule, index) => {
    if (getRuleStableId(rule) === ruleId) {
      indexes.push(index);
    }
  });

  return indexes;
}

function isBroaderThan(currentRule: DomainRule, proposedRule: DomainRule): boolean {
  if (!proposedRule.includeSubdomains) {
    return false;
  }

  if (!currentRule.includeSubdomains && normalizedRuleDomain(currentRule) === normalizedRuleDomain(proposedRule)) {
    return true;
  }

  return domainMatchesRule(currentRule.domain, proposedRule) && !sameRouteTarget(currentRule, proposedRule);
}

function coveragePreview(currentRule: DomainRule, proposedRule: DomainRule, isBroadening: boolean): string[] {
  if (!isBroadening) {
    return [];
  }

  const coverage = [proposedRule.domain];

  if (normalizedRuleDomain(currentRule) !== normalizedRuleDomain(proposedRule)) {
    coverage.push(currentRule.domain);
  }

  coverage.push(getMessage("ruleOtherSubdomains", [proposedRule.domain]));
  return coverage;
}

function buildConflictWarnings(
  rules: readonly DomainRule[],
  currentIndex: number,
  proposedRule: DomainRule,
  isBroadening: boolean
): RuleEditWarning[] {
  const warnings: RuleEditWarning[] = [];

  if (isBroadening) {
    warnings.push({
      kind: "broader-scope",
      message: getMessage("ruleScopeMoreHostsWarning")
    });
  }

  rules.forEach((rule, index) => {
    if (index === currentIndex || sameRouteTarget(rule, proposedRule)) {
      return;
    }

    if (ruleCoversTarget(rule, proposedRule)) {
      warnings.push(
        rule.action === proposedRule.action
          ? {
              kind: "covered-by-parent",
              message: getMessage("ruleExistingParentSameRoute", [rule.domain]),
              relatedRule: rule
            }
          : {
              kind: "overrides-parent",
              message: getMessage("ruleOverridesParentWarning", [
                actionLabel(proposedRule.action),
                actionLabel(rule.action),
                rule.domain
              ]),
              relatedRule: rule
            }
      );
    }

    if (!proposedRule.includeSubdomains || !ruleCoversTarget(proposedRule, rule)) {
      return;
    }

    warnings.push(
      rule.action === proposedRule.action
        ? {
            kind: "child-rule-redundant",
            message: getMessage("ruleChildRedundantWarning", [actionLabel(proposedRule.action), rule.domain]),
            relatedRule: rule
          }
        : {
            kind: "child-exception-preserved",
            message: getMessage("ruleChildExceptionWarning", [
              actionLabel(proposedRule.action),
              actionLabel(rule.action),
              rule.domain
            ]),
            relatedRule: rule
          }
    );
  });

  return warnings;
}

function targetConflict(
  rules: readonly DomainRule[],
  currentIndex: number,
  proposedRule: DomainRule
): { ok: false; error: string; reason: "duplicate" | "conflict" } | null {
  const matchingRule = rules.find((rule, index) => index !== currentIndex && sameRouteTarget(rule, proposedRule));

  if (!matchingRule) {
    return null;
  }

  if (matchingRule.action === proposedRule.action) {
    return {
      ok: false,
      reason: "duplicate",
      error: getMessage("ruleDuplicateEditExisting")
    };
  }

  return {
    ok: false,
    reason: "conflict",
    error: getMessage("ruleOppositeActionExists", [actionLabel(matchingRule.action)])
  };
}

export function planRuleEdit(
  rules: readonly DomainRule[],
  ruleId: string,
  input: RuleEditInput,
  denylist: readonly string[] = []
): RuleEditPlan {
  const indexes = findRuleIndexes(rules, ruleId);

  if (indexes.length === 0) {
    return {
      ok: false,
      reason: "rule-not-found",
      error: getMessage("ruleNoLongerAvailableRefresh")
    };
  }

  if (indexes.length > 1) {
    return {
      ok: false,
      reason: "ambiguous-rule",
      error: getMessage("ruleIdentityAmbiguous")
    };
  }

  const currentIndex = indexes[0];
  const currentRule = rules[currentIndex];
  const scopeOption = getRuleScopeOptions(input.domain, denylist).find((option) => option.scope === input.scope);

  if (!scopeOption) {
    const normalized = normalizeDomain(input.domain);

    return {
      ok: false,
      reason: normalized.ok ? "unsafe-scope" : "invalid-domain",
      error: normalized.ok
        ? getMessage("ruleBroaderScopeUnavailable")
        : normalized.error.message
    };
  }

  const proposedRule: DomainRule = {
    ...currentRule,
    id: currentRule.id ?? ruleId,
    domain: scopeOption.targetDomain,
    includeSubdomains: scopeOption.includeSubdomains,
    action: input.action
  };
  const hasSemanticChange =
    normalizedRuleDomain(currentRule) !== normalizedRuleDomain(proposedRule) ||
    currentRule.includeSubdomains !== proposedRule.includeSubdomains ||
    currentRule.action !== proposedRule.action;

  if (!hasSemanticChange) {
    return {
      ok: false,
      reason: "no-change",
      error: getMessage("ruleNoChanges")
    };
  }

  const conflict = targetConflict(rules, currentIndex, proposedRule);

  if (conflict) {
    return conflict;
  }

  const isBroadening = isBroaderThan(currentRule, proposedRule);

  return {
    ok: true,
    ruleId,
    currentRule,
    proposedRule,
    isBroadening,
    coverage: coveragePreview(currentRule, proposedRule, isBroadening),
    warnings: buildConflictWarnings(rules, currentIndex, proposedRule, isBroadening)
  };
}

export function replaceRuleAtomically(
  rules: readonly DomainRule[],
  ruleId: string,
  proposed: Pick<DomainRule, "domain" | "includeSubdomains" | "action">
): AtomicRuleReplacementResult {
  const indexes = findRuleIndexes(rules, ruleId);

  if (indexes.length === 0) {
    return {
      ok: false,
      reason: "rule-not-found",
      error: getMessage("ruleNoLongerAvailable")
    };
  }

  if (indexes.length > 1) {
    return {
      ok: false,
      reason: "ambiguous-rule",
      error: getMessage("ruleIdentityAmbiguous")
    };
  }

  const normalized = normalizeDomain(proposed.domain);

  if (!normalized.ok || checkDenylistedHost(normalized.ok ? normalized.domain : proposed.domain).denied) {
    return {
      ok: false,
      reason: "invalid-domain",
      error: normalized.ok ? getMessage("ruleHostnameCannotRoute") : normalized.error.message
    };
  }

  const replacedIndex = indexes[0];
  const currentRule = rules[replacedIndex];
  const updatedRule: DomainRule = {
    ...currentRule,
    id: currentRule.id ?? ruleId,
    domain: normalized.domain,
    includeSubdomains: proposed.includeSubdomains,
    action: proposed.action
  };
  const conflict = targetConflict(rules, replacedIndex, updatedRule);

  if (conflict) {
    return conflict;
  }

  const updatedRules = [...rules];
  updatedRules[replacedIndex] = updatedRule;

  return {
    ok: true,
    rules: updatedRules,
    updatedRule,
    replacedIndex
  };
}
