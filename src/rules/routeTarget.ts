import { normalizeDomain } from "./normalizeDomain";
import type { DomainRule, RuleAction } from "./ruleTypes";

export type RouteTarget = Pick<DomainRule, "domain" | "includeSubdomains">;

export type RouteTargetConflict = {
  key: string;
  domain: string;
  includeSubdomains: boolean;
  rules: DomainRule[];
  proxyRules: DomainRule[];
  directRules: DomainRule[];
};

export type RouteTargetAdditionCheck =
  | {
      status: "available";
    }
  | {
      status: "duplicate";
      existingRule: DomainRule;
    }
  | {
      status: "conflict";
      existingRule: DomainRule;
      conflictingRules: DomainRule[];
    };

export type ResolveRouteTargetConflictResult =
  | {
      ok: true;
      rules: DomainRule[];
      keptRule: DomainRule;
      removedRules: DomainRule[];
      conflict: RouteTargetConflict;
    }
  | {
      ok: false;
      error: string;
    };

function normalizedTargetDomain(domain: string): string {
  const normalized = normalizeDomain(domain);

  return normalized.ok ? normalized.domain : domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.+$/, "");
}

export function getRouteTargetKey(target: RouteTarget): string {
  const scope = target.includeSubdomains ? "include-subdomains" : "exact";

  return `route-target:v1:${encodeURIComponent(normalizedTargetDomain(target.domain))}:${scope}`;
}

export function sameRouteTarget(first: RouteTarget, second: RouteTarget): boolean {
  return getRouteTargetKey(first) === getRouteTargetKey(second);
}

export function describeRouteTarget(target: RouteTarget): string {
  const domain = normalizedTargetDomain(target.domain);

  return target.includeSubdomains ? `${domain} and its subdomains` : `${domain} (exact hostname)`;
}

export function checkRouteTargetAddition(
  rules: readonly DomainRule[],
  proposedRule: Pick<DomainRule, "domain" | "includeSubdomains" | "action">
): RouteTargetAdditionCheck {
  const key = getRouteTargetKey(proposedRule);
  const matchingRules = rules.filter((rule) => getRouteTargetKey(rule) === key);
  const oppositeRule = matchingRules.find((rule) => rule.action !== proposedRule.action);

  if (oppositeRule) {
    return {
      status: "conflict",
      existingRule: oppositeRule,
      conflictingRules: matchingRules
    };
  }

  const duplicate = matchingRules.find((rule) => rule.action === proposedRule.action);

  if (duplicate) {
    return {
      status: "duplicate",
      existingRule: duplicate
    };
  }

  return {
    status: "available"
  };
}

export function findRouteTargetConflicts(rules: readonly DomainRule[]): RouteTargetConflict[] {
  const groups = new Map<string, DomainRule[]>();

  for (const rule of rules) {
    const key = getRouteTargetKey(rule);
    const group = groups.get(key);

    if (group) {
      group.push(rule);
    } else {
      groups.set(key, [rule]);
    }
  }

  const conflicts: RouteTargetConflict[] = [];

  for (const [key, group] of groups) {
    const proxyRules = group.filter((rule) => rule.action === "proxy");
    const directRules = group.filter((rule) => rule.action === "direct");

    if (proxyRules.length === 0 || directRules.length === 0) {
      continue;
    }

    conflicts.push({
      key,
      domain: normalizedTargetDomain(group[0].domain),
      includeSubdomains: group[0].includeSubdomains,
      rules: [...group],
      proxyRules,
      directRules
    });
  }

  return conflicts;
}

export function findRouteTargetConflictForRule(
  rules: readonly DomainRule[],
  rule: RouteTarget
): RouteTargetConflict | undefined {
  const key = getRouteTargetKey(rule);

  return findRouteTargetConflicts(rules).find((conflict) => conflict.key === key);
}

function selectedRuleForAction(conflict: RouteTargetConflict, action: RuleAction): DomainRule | undefined {
  const candidates = action === "proxy" ? conflict.proxyRules : conflict.directRules;
  let selected: DomainRule | undefined;
  let selectedIndex = -1;

  candidates.forEach((candidate, index) => {
    if (!selected) {
      selected = candidate;
      selectedIndex = index;
      return;
    }

    const candidateTime = Date.parse(candidate.createdAt);
    const selectedTime = Date.parse(selected.createdAt);
    const safeCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
    const safeSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;

    if (safeCandidateTime > safeSelectedTime || (safeCandidateTime === safeSelectedTime && index > selectedIndex)) {
      selected = candidate;
      selectedIndex = index;
    }
  });

  return selected;
}

export function resolveRouteTargetConflict(
  rules: readonly DomainRule[],
  routeTargetKey: string,
  keepAction: RuleAction
): ResolveRouteTargetConflictResult {
  const conflict = findRouteTargetConflicts(rules).find((candidate) => candidate.key === routeTargetKey);

  if (!conflict) {
    return {
      ok: false,
      error: "That route-target conflict is no longer available. Refresh and try again."
    };
  }

  const keptRule = selectedRuleForAction(conflict, keepAction);

  if (!keptRule) {
    return {
      ok: false,
      error: `No ${keepAction === "proxy" ? "Proxy" : "Direct"} rule is available for that route target.`
    };
  }

  const removedRules = conflict.rules.filter((rule) => rule !== keptRule);
  const nextRules = rules.filter(
    (rule) => getRouteTargetKey(rule) !== routeTargetKey || rule === keptRule
  );

  return {
    ok: true,
    rules: nextRules,
    keptRule,
    removedRules,
    conflict
  };
}
