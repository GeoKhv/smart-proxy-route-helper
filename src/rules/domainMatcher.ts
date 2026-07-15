import type { DomainRule, RuleAction } from "./ruleTypes";
import { sameRouteTarget } from "./routeTarget";
import { getMessage } from "../i18n/i18n";
import { canonicalizeHostname } from "./canonicalizeHostname";
import { normalizeDomain } from "./normalizeDomain";

function normalizeRuleForMatching(domain: string): string {
  const normalized = normalizeDomain(domain);

  return normalized.ok ? normalized.domain : domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.+$/, "");
}

function canonicalizeForMatching(domain: string): string {
  const canonical = canonicalizeHostname(domain);

  return canonical.ok ? canonical.domain : normalizeRuleForMatching(domain);
}

function createdAtTime(rule: Pick<DomainRule, "createdAt">): number {
  const time = Date.parse(rule.createdAt);

  return Number.isNaN(time) ? 0 : time;
}

function normalizedRuleDomain(rule: Pick<DomainRule, "domain">): string {
  return normalizeRuleForMatching(rule.domain);
}

function domainSpecificity(domain: string): number {
  return normalizeRuleForMatching(domain).split(".").filter(Boolean).length;
}

function isNewerOrLater<T extends Pick<DomainRule, "createdAt">>(
  candidate: T,
  candidateIndex: number,
  current: T,
  currentIndex: number
): boolean {
  const candidateTime = createdAtTime(candidate);
  const currentTime = createdAtTime(current);

  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  return candidateIndex > currentIndex;
}

export function domainMatchesRule(domain: string, rule: Pick<DomainRule, "domain" | "includeSubdomains">): boolean {
  const candidateDomain = canonicalizeForMatching(domain);
  const ruleDomain = normalizeRuleForMatching(rule.domain);

  if (candidateDomain.length === 0 || ruleDomain.length === 0) {
    return false;
  }

  if (candidateDomain === ruleDomain) {
    return true;
  }

  return rule.includeSubdomains && candidateDomain.endsWith(`.${ruleDomain}`);
}

export function findMatchingDomainRule<T extends Pick<DomainRule, "domain" | "includeSubdomains">>(
  domain: string,
  rules: readonly T[]
): T | undefined {
  return rules.find((rule) => domainMatchesRule(domain, rule));
}

export type EffectiveDomainRuleMatch<T extends Pick<DomainRule, "domain" | "includeSubdomains" | "createdAt">> =
  | {
      type: "exact";
      rule: T;
      ruleIndex: number;
    }
  | {
      type: "parent";
      rule: T;
      ruleIndex: number;
    };

export function findEffectiveDomainRule<
  T extends Pick<DomainRule, "domain" | "includeSubdomains" | "createdAt">
>(domain: string, rules: readonly T[]): EffectiveDomainRuleMatch<T> | undefined {
  const candidateDomain = canonicalizeForMatching(domain);

  if (candidateDomain.length === 0) {
    return undefined;
  }

  let exactMatch: EffectiveDomainRuleMatch<T> | undefined;
  let parentMatch: EffectiveDomainRuleMatch<T> | undefined;
  let parentSpecificity = -1;

  rules.forEach((rule, ruleIndex) => {
    const ruleDomain = normalizedRuleDomain(rule);

    if (ruleDomain.length === 0) {
      return;
    }

    if (candidateDomain === ruleDomain) {
      if (!exactMatch || isNewerOrLater(rule, ruleIndex, exactMatch.rule, exactMatch.ruleIndex)) {
        exactMatch = {
          type: "exact",
          rule,
          ruleIndex
        };
      }

      return;
    }

    if (!rule.includeSubdomains || !candidateDomain.endsWith(`.${ruleDomain}`)) {
      return;
    }

    const specificity = domainSpecificity(ruleDomain);

    if (
      !parentMatch ||
      specificity > parentSpecificity ||
      (specificity === parentSpecificity && isNewerOrLater(rule, ruleIndex, parentMatch.rule, parentMatch.ruleIndex))
    ) {
      parentMatch = {
        type: "parent",
        rule,
        ruleIndex
      };
      parentSpecificity = specificity;
    }
  });

  return exactMatch ?? parentMatch;
}

export type RedundantDomainRuleSuggestion = {
  redundantRule: DomainRule;
  coveringRule: DomainRule;
  redundantRuleIndex: number;
  coveringRuleIndex: number;
  reason: string;
  safeToRemove: boolean;
};

function ruleAction(rule: Pick<DomainRule, "action"> & Partial<Pick<DomainRule, "mode">>): RuleAction {
  return rule.action === "direct" ? "direct" : "proxy";
}

function ruleCoversRuleTarget(coveringRule: DomainRule, targetRule: DomainRule): boolean {
  if (ruleAction(coveringRule) !== ruleAction(targetRule)) {
    return false;
  }

  if (!domainMatchesRule(targetRule.domain, coveringRule)) {
    return false;
  }

  if (!targetRule.includeSubdomains) {
    return true;
  }

  return coveringRule.includeSubdomains === true;
}

function redundancyReason(redundantRule: DomainRule, coveringRule: DomainRule): string {
  const action =
    ruleAction(redundantRule) === "proxy"
      ? getMessage("ruleProxyRouteLower")
      : getMessage("ruleDirectRouteLower");
  const scope = redundantRule.includeSubdomains
    ? getMessage("ruleDomainAndSubdomainsLower")
    : getMessage("ruleExactDomainLower");

  if (sameRouteTarget(redundantRule, coveringRule)) {
    return getMessage("ruleSameActionExists", [action, scope]);
  }

  return getMessage("ruleCoveredBy", [coveringRule.domain, action, scope]);
}

export function findRedundantDomainRules(rules: readonly DomainRule[]): RedundantDomainRuleSuggestion[] {
  const suggestions: RedundantDomainRuleSuggestion[] = [];

  rules.forEach((rule, ruleIndex) => {
    let coveringRule: DomainRule | undefined;
    let coveringRuleIndex = -1;

    rules.forEach((candidateRule, candidateIndex) => {
      if (candidateIndex === ruleIndex || !ruleCoversRuleTarget(candidateRule, rule)) {
        return;
      }

      const candidateDomain = normalizedRuleDomain(candidateRule);
      const currentDomain = coveringRule ? normalizedRuleDomain(coveringRule) : "";
      const candidateSpecificity = domainSpecificity(candidateDomain);
      const currentSpecificity = domainSpecificity(currentDomain);

      if (
        !coveringRule ||
        candidateSpecificity > currentSpecificity ||
        (candidateSpecificity === currentSpecificity &&
          isNewerOrLater(candidateRule, candidateIndex, coveringRule, coveringRuleIndex))
      ) {
        coveringRule = candidateRule;
        coveringRuleIndex = candidateIndex;
      }
    });

    if (!coveringRule) {
      return;
    }

    suggestions.push({
      redundantRule: rule,
      coveringRule,
      redundantRuleIndex: ruleIndex,
      coveringRuleIndex,
      reason: redundancyReason(rule, coveringRule),
      safeToRemove: true
    });
  });

  return suggestions;
}
