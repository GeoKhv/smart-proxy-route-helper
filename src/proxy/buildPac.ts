import { normalizeDomain } from "../rules/normalizeDomain";
import { getRegistrableDomain } from "../domainClassification/registrableDomain";
import { getRouteTargetKey } from "../rules/routeTarget";
import type { DomainRule, RuleAction } from "../rules/ruleTypes";
import { buildPacProxyString, type LocalProxyConfigValidationError } from "./proxyConfig";

export type PacDomainRule = Pick<DomainRule, "domain" | "includeSubdomains"> &
  Partial<Pick<DomainRule, "action" | "mode" | "createdAt">>;

export type SerializedPacRule = {
  domain: string;
  includeSubdomains: boolean;
  action: RuleAction;
  createdAt: string;
  matchesStandardWww: boolean;
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
    })}:${action}`;

    if (seenDomains.has(key)) {
      continue;
    }

    seenDomains.add(key);
    serializedRules.push({
      domain: normalizedRule.domain,
      includeSubdomains: rule.includeSubdomains,
      action,
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
  var rule = findEffectivePacRule(normalizedHost);

  if (rule && rule.action === "proxy") {
    return proxyRoute;
  }

  return "DIRECT";
}
`;
}

export function buildPacScript(input: BuildPacScriptInput): BuildPacScriptResult {
  const proxyStringResult = buildPacProxyString(input.localProxyConfig);

  if (!proxyStringResult.ok) {
    return {
      ok: false,
      error: proxyStringResult.error
    };
  }

  const rules = serializePacRules(input.rules);

  return {
    ok: true,
    pacScript: createPacScript(rules, proxyStringResult.proxyString),
    rules,
    proxyString: proxyStringResult.proxyString
  };
}
