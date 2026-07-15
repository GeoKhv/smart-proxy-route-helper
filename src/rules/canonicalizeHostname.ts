import { getRegistrableDomain } from "../domainClassification/registrableDomain";
import { normalizeDomain } from "./normalizeDomain";
import type { NormalizeDomainResult } from "./ruleTypes";

const standardWwwPrefix = "www.";

export function canonicalizeHostname(input: string): NormalizeDomainResult {
  const normalized = normalizeDomain(input);

  if (!normalized.ok || !normalized.domain.startsWith(standardWwwPrefix)) {
    return normalized;
  }

  const domainWithoutWww = normalized.domain.slice(standardWwwPrefix.length);

  if (getRegistrableDomain(normalized.domain) !== domainWithoutWww) {
    return normalized;
  }

  return {
    ok: true,
    domain: domainWithoutWww
  };
}
