import type { DomainRule } from "./ruleTypes";

function normalizeForMatching(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.+$/, "");
}

export function domainMatchesRule(domain: string, rule: Pick<DomainRule, "domain" | "includeSubdomains">): boolean {
  const candidateDomain = normalizeForMatching(domain);
  const ruleDomain = normalizeForMatching(rule.domain);

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
