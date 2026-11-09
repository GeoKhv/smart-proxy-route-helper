import { ruleRouteId } from "../rules/routes";
import { normalizeDomain } from "../rules/normalizeDomain";
import { getRegistrableDomain } from "../domainClassification/registrableDomain";
import { getRouteTargetKey, findRouteTargetConflicts } from "../rules/routeTarget";
import type { DomainRule, RuleAction } from "../rules/ruleTypes";
import { buildPacProxyString, type LocalProxyConfigValidationError } from "./proxyConfig";

export type PacDomainRule = Pick<DomainRule, "domain" | "includeSubdomains"> &
  Partial<Pick<DomainRule, "action" | "mode" | "createdAt" | "routeId">>;

export type SerializedPacRule = {
  domain: string;
  includeSubdomains: boolean;
  action: RuleAction;
  createdAt: string;
  matchesStandardWww: boolean;
  routeId?: string;
  proxyString?: string;
  blockedByConflict?: boolean;
};

export type BuildPacScriptResult =
  | {
      ok: true;
      pacScript: string;
      rules: SerializedPacRule[];
      proxyString: string;
    }
  | {
      ok: false;
      error: LocalProxyConfigValidationError;
    };

export type BuildPacScriptInput = {
  rules: readonly PacDomainRule[];
  localProxyConfig: unknown;
  routeProxyStrings?: Record<string, string>;
};

function serializePacRules(rules: readonly PacDomainRule[]): SerializedPacRule[] {
  const serializedRules: SerializedPacRule[] = [];
  const seenDomains = new Set<string>();

  for (const rule of rules) {
    if (
      (rule.mode !== undefined && rule.mode !== "proxy") ||
      (rule.action !== undefined && rule.action !== "proxy" && rule.action !== "direct")
    ) {
      continue;
    }

    const normalizedRule = normalizeDomain(rule.domain);

    if (!normalizedRule.ok) {
      continue;
    }

    const action = rule.action === "direct" ? "direct" : "proxy";
    const key = `${getRouteTargetKey({
      domain: normalizedRule.domain,
      includeSubdomains: rule.includeSubdomains
    })}:${action}:${ruleRouteId(rule)}`;

    if (seenDomains.has(key)) {
      continue;
    }

    seenDomains.add(key);
    serializedRules.push({
      domain: normalizedRule.domain,
      includeSubdomains: rule.includeSubdomains,
      action,
      ...(rule.routeId ? { routeId: rule.routeId } : {}),
      createdAt: rule.createdAt ?? "",
      matchesStandardWww: getRegistrableDomain(normalizedRule.domain) === normalizedRule.domain
    });
  }

  return serializedRules;
}

function createPacScript(rules: readonly SerializedPacRule[], proxyString: string): string {
  const serializedRules = JSON.stringify(rules);
  const serializedProxyString = JSON.stringify(proxyString);

  return `var proxyRoute = ${serializedProxyString};
var domainRules = ${serializedRules};

function normalizePacHost(host) {
  return String(host || "").toLowerCase().replace(/\\.+$/, "");
}

function pacRuleExactMatch(host, rule) {
  return host === rule.domain || (rule.matchesStandardWww === true && host === "www." + rule.domain);
}

function pacDomainMatchesRule(host, rule) {
  if (!host || !rule.domain) {
    return false;
  }

  if (pacRuleExactMatch(host, rule)) {
    return true;
  }

  return rule.includeSubdomains === true && host.slice(-(rule.domain.length + 1)) === "." + rule.domain;
}

function pacCreatedAtTime(rule) {
  var time = Date.parse(String(rule.createdAt || ""));
  return isNaN(time) ? 0 : time;
}

function pacSpecificity(domain) {
  return String(domain || "").split(".").filter(Boolean).length;
}

function pacIsNewerOrLater(candidate, candidateIndex, current, currentIndex) {
  var candidateTime = pacCreatedAtTime(candidate);
  var currentTime = pacCreatedAtTime(current);

  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  return candidateIndex > currentIndex;
}

function findEffectivePacRule(host) {
  var exactRule = null;
  var exactIndex = -1;
  var parentRule = null;
  var parentIndex = -1;
  var parentSpecificity = -1;

  for (var index = 0; index < domainRules.length; index += 1) {
    var rule = domainRules[index];

    if (!pacDomainMatchesRule(host, rule)) {
      continue;
    }

    if (pacRuleExactMatch(host, rule)) {
      if (exactRule === null || pacIsNewerOrLater(rule, index, exactRule, exactIndex)) {
        exactRule = rule;
        exactIndex = index;
      }

      continue;
    }

    var specificity = pacSpecificity(rule.domain);

    if (
      parentRule === null ||
      specificity > parentSpecificity ||
      (specificity === parentSpecificity && pacIsNewerOrLater(rule, index, parentRule, parentIndex))
    ) {
      parentRule = rule;
      parentIndex = index;
      parentSpecificity = specificity;
    }
  }

  return exactRule || parentRule;
}

function FindProxyForURL(url, host) {
  var normalizedHost = normalizePacHost(host);
  for (var i = 0; i < domainRules.length; i += 1) {
    if (domainRules[i].blockedByConflict && pacDomainMatchesRule(normalizedHost, domainRules[i])) return "PROXY 127.0.0.1:9";
  }
  var rule = findEffectivePacRule(normalizedHost);

  if (rule && rule.action === "proxy") {
    return rule.proxyString || proxyRoute;
  }

  return "DIRECT";
}
`;
}

export function buildPacScript(input: BuildPacScriptInput): BuildPacScriptResult {
  const proxyStringResult = buildPacProxyString(input.routeProxyStrings ? { scheme: "http", host: "127.0.0.1", port: 9 } : input.localProxyConfig);

  if (!proxyStringResult.ok) {
    return {
      ok: false,
      error: proxyStringResult.error
    };
  }

  const conflicts = findRouteTargetConflicts(input.rules as readonly DomainRule[]).filter(conflict =>
    new Set(conflict.rules.map(ruleRouteId)).size > 1);
  const blockedTargets = new Set(conflicts.map(conflict => conflict.key));
  const rules = serializePacRules(input.rules).map(rule => blockedTargets.has(getRouteTargetKey(rule))
    ? { ...rule, blockedByConflict: true } : rule).map(rule => input.routeProxyStrings
    ? { ...rule, proxyString: rule.action === "direct" ? "DIRECT" : input.routeProxyStrings[ruleRouteId(rule)] ?? "PROXY 127.0.0.1:9" }
    : rule);

  return {
    ok: true,
    pacScript: createPacScript(rules, proxyStringResult.proxyString),
    rules,
    proxyString: proxyStringResult.proxyString
  };
}
