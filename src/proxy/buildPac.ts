import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainRule } from "../rules/ruleTypes";
import { buildPacProxyString, type LocalProxyConfigValidationError } from "./proxyConfig";

export type PacDomainRule = Pick<DomainRule, "domain" | "includeSubdomains"> & Partial<Pick<DomainRule, "mode">>;

export type SerializedPacRule = {
  domain: string;
  includeSubdomains: boolean;
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
    if (rule.mode !== undefined && rule.mode !== "proxy") {
      continue;
    }

    const normalizedRule = normalizeDomain(rule.domain);

    if (!normalizedRule.ok) {
      continue;
    }

    const key = `${normalizedRule.domain}:${String(rule.includeSubdomains)}`;

    if (seenDomains.has(key)) {
      continue;
    }

    seenDomains.add(key);
    serializedRules.push({
      domain: normalizedRule.domain,
      includeSubdomains: rule.includeSubdomains
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

function pacDomainMatchesRule(host, rule) {
  if (!host || !rule.domain) {
    return false;
  }

  if (host === rule.domain) {
    return true;
  }

  return rule.includeSubdomains === true && host.slice(-(rule.domain.length + 1)) === "." + rule.domain;
}

function FindProxyForURL(url, host) {
  var normalizedHost = normalizePacHost(host);

  for (var index = 0; index < domainRules.length; index += 1) {
    if (pacDomainMatchesRule(normalizedHost, domainRules[index])) {
      return proxyRoute;
    }
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
