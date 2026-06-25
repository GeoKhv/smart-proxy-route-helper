import { domainEqualsOrIsSubdomain } from "../rules/baseDomain";
import { normalizeDomain } from "../rules/normalizeDomain";
import { builtInDomainClassifications } from "./builtInDomainClassifications";
import type {
  ClassifyDomainCandidateInput,
  DomainCandidateClassificationResult,
  DomainCandidateUserOverride
} from "./domainClassificationTypes";
import { getRegistrableDomain } from "./registrableDomain";

function normalizeDomainOrNull(input: string | undefined): string | null {
  if (!input) {
    return null;
  }

  const normalized = normalizeDomain(input);

  return normalized.ok ? normalized.domain : null;
}

function matchesCandidateDomain(candidateDomain: string, candidateBaseDomain: string, classificationDomain: string): boolean {
  return (
    domainEqualsOrIsSubdomain(candidateDomain, classificationDomain) ||
    candidateBaseDomain === classificationDomain ||
    domainEqualsOrIsSubdomain(candidateBaseDomain, classificationDomain)
  );
}

function matchesSiteDomain(currentDomain: string, currentBaseDomain: string, siteDomain: string): boolean {
  return currentBaseDomain === siteDomain || domainEqualsOrIsSubdomain(currentDomain, siteDomain);
}

function userOverrideClassification(
  override: DomainCandidateUserOverride,
  currentDomain: string,
  currentBaseDomain: string,
  candidateDomain: string,
  candidateBaseDomain: string
): DomainCandidateClassificationResult | null {
  const overrideDomain = normalizeDomainOrNull(override.domain);

  if (!overrideDomain || !matchesCandidateDomain(candidateDomain, candidateBaseDomain, overrideDomain)) {
    return null;
  }

  if (override.action === "ignore-globally") {
    return {
      domain: overrideDomain,
      classification: "ignored",
      category: "unknown",
      scope: "global",
      confidence: "high",
      reason: override.reason ?? "User override marks this domain as ignored globally.",
      source: "user-override"
    };
  }

  if (override.action === "review-globally") {
    return {
      domain: overrideDomain,
      classification: "review",
      category: "unknown",
      scope: "global",
      confidence: "high",
      reason: override.reason ?? "User override keeps this domain in manual review.",
      source: "user-override"
    };
  }

  const overrideSiteDomain = normalizeDomainOrNull(override.siteDomain);

  if (!overrideSiteDomain || !matchesSiteDomain(currentDomain, currentBaseDomain, overrideSiteDomain)) {
    return null;
  }

  if (override.action === "suggest-for-site") {
    return {
      domain: overrideDomain,
      classification: "related",
      category: "site-assets",
      scope: "site",
      siteDomain: overrideSiteDomain,
      confidence: "high",
      reason: override.reason ?? "User override marks this domain as related for this site.",
      source: "user-override"
    };
  }

  return {
    domain: overrideDomain,
    classification: "ignored",
    category: "unknown",
    scope: "site",
    siteDomain: overrideSiteDomain,
    confidence: "high",
    reason: override.reason ?? "User override marks this domain as ignored for this site.",
    source: "user-override"
  };
}

function findUserOverrideClassification(
  input: Required<ClassifyDomainCandidateInput>,
  currentDomain: string,
  currentBaseDomain: string,
  candidateDomain: string,
  candidateBaseDomain: string
): DomainCandidateClassificationResult | null {
  for (const override of input.userOverrides) {
    if (override.action !== "suggest-for-site" && override.action !== "ignore-for-site") {
      continue;
    }

    const classification = userOverrideClassification(
      override,
      currentDomain,
      currentBaseDomain,
      candidateDomain,
      candidateBaseDomain
    );

    if (classification) {
      return classification;
    }
  }

  for (const override of input.userOverrides) {
    if (override.action !== "ignore-globally" && override.action !== "review-globally") {
      continue;
    }

    const classification = userOverrideClassification(
      override,
      currentDomain,
      currentBaseDomain,
      candidateDomain,
      candidateBaseDomain
    );

    if (classification) {
      return classification;
    }
  }

  return null;
}

function findBuiltInSiteScopedClassification(
  currentDomain: string,
  currentBaseDomain: string,
  candidateDomain: string,
  candidateBaseDomain: string
): DomainCandidateClassificationResult | null {
  for (const classification of builtInDomainClassifications) {
    if (
      classification.scope !== "site" ||
      !classification.siteDomain ||
      !matchesSiteDomain(currentDomain, currentBaseDomain, classification.siteDomain) ||
      !matchesCandidateDomain(candidateDomain, candidateBaseDomain, classification.domain)
    ) {
      continue;
    }

    return classification;
  }

  return null;
}

function findBuiltInGlobalClassification(
  candidateDomain: string,
  candidateBaseDomain: string
): DomainCandidateClassificationResult | null {
  for (const classification of builtInDomainClassifications) {
    if (
      classification.scope !== "global" ||
      !matchesCandidateDomain(candidateDomain, candidateBaseDomain, classification.domain)
    ) {
      continue;
    }

    return classification;
  }

  return null;
}

function looksSuspicious(candidateDomain: string): boolean {
  return candidateDomain
    .split(".")
    .some((label) => /^(ad|ads|adservice|analytics|beacon|collect|metrics|pixel|stat|stats|sync|telemetry|track|tracker)$/i.test(label));
}

export function classifyDomainCandidate(
  input: ClassifyDomainCandidateInput
): DomainCandidateClassificationResult | null {
  const currentDomain = normalizeDomainOrNull(input.currentDomain);
  const candidateDomain = normalizeDomainOrNull(input.candidateDomain);

  if (!currentDomain || !candidateDomain) {
    return null;
  }

  const currentBaseDomain = getRegistrableDomain(currentDomain) ?? currentDomain;
  const candidateBaseDomain = getRegistrableDomain(candidateDomain) ?? candidateDomain;
  const normalizedInput: Required<ClassifyDomainCandidateInput> = {
    currentDomain,
    candidateDomain,
    userOverrides: input.userOverrides ?? []
  };
  const overrideClassification = findUserOverrideClassification(
    normalizedInput,
    currentDomain,
    currentBaseDomain,
    candidateDomain,
    candidateBaseDomain
  );

  if (overrideClassification) {
    return overrideClassification;
  }

  const siteScopedClassification = findBuiltInSiteScopedClassification(
    currentDomain,
    currentBaseDomain,
    candidateDomain,
    candidateBaseDomain
  );

  if (siteScopedClassification) {
    return siteScopedClassification;
  }

  const globalClassification = findBuiltInGlobalClassification(candidateDomain, candidateBaseDomain);

  if (globalClassification) {
    return globalClassification;
  }

  if (candidateBaseDomain === currentBaseDomain) {
    return {
      domain: currentBaseDomain,
      classification: "related",
      category: "site-assets",
      scope: "site",
      siteDomain: currentBaseDomain,
      confidence: "high",
      reason: "Same-site resource host observed from the current page.",
      source: "built-in"
    };
  }

  if (looksSuspicious(candidateDomain)) {
    return {
      domain: candidateDomain,
      classification: "review",
      category: "suspicious",
      scope: "global",
      confidence: "low",
      reason: "Suspicious-looking third-party host; keep it in manual review instead of ignoring it.",
      source: "built-in"
    };
  }

  return {
    domain: candidateDomain,
    classification: "review",
    category: "unknown",
    scope: "global",
    confidence: "low",
    reason: "No curated classification matched; keep this domain in manual review.",
    source: "built-in"
  };
}
