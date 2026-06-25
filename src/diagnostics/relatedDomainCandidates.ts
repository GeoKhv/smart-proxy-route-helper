import { classifyDomainCandidate } from "../domainClassification/classifyDomainCandidate";
import type {
  DomainCandidateClassificationCategory,
  DomainCandidateClassificationResult,
  DomainCandidateUserOverride
} from "../domainClassification/domainClassificationTypes";
import { getBaseDomain } from "../rules/baseDomain";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";

export type RelatedDomainCandidateInput = {
  currentDomain: string;
  observedUrlsOrHosts: string[];
  userOverrides?: readonly DomainCandidateUserOverride[];
};

export type RelatedDomainCandidateReason =
  | "same-site-subdomain"
  | "explicit-related-domain"
  | "third-party-resource"
  | "known-tracking-or-analytics"
  | "shared-infrastructure"
  | "local-or-adblock-helper"
  | "system-or-schema-helper";

export type RelatedDomainRouteTargetReason =
  | "same-site-resources"
  | "known-related-domain"
  | "multiple-sibling-hosts"
  | "exact-observed-host"
  | "unsafe-shared-infrastructure";

export type RelatedDomainRouteTargetConfidence = "high" | "medium" | "low";

export type RelatedDomainCandidate = {
  domain: string;
  reason: RelatedDomainCandidateReason;
  sourceHosts: string[];
  sourceHostCount: number;
  suggestedRuleDomain?: string;
  suggestedIncludeSubdomains: boolean;
  routeTargetReason?: RelatedDomainRouteTargetReason;
  routeTargetConfidence?: RelatedDomainRouteTargetConfidence;
  defaultSelected: boolean;
};

export type RelatedDomainCandidatesResult = {
  currentDomain: string | null;
  strongCandidates: RelatedDomainCandidate[];
  mediumCandidates: RelatedDomainCandidate[];
  ignoredCandidates: RelatedDomainCandidate[];
};

type CandidateCategory = "strongCandidates" | "mediumCandidates" | "ignoredCandidates";

type MutableCandidate = Omit<RelatedDomainCandidate, "sourceHosts" | "sourceHostCount"> & {
  sourceHosts: Set<string>;
};

type ClassifiedObservation = {
  observedHost: string;
  observedBaseDomain: string;
  classification: DomainCandidateClassificationResult;
};

type RouteTargetPlan = {
  domain: string;
  suggestedIncludeSubdomains: boolean;
  routeTargetReason: RelatedDomainRouteTargetReason;
  routeTargetConfidence: RelatedDomainRouteTargetConfidence;
};

const unsafeBroadeningBaseDomains = new Set([
  "akamaihd.net",
  "appspot.com",
  "auth0.com",
  "cloudfront.net",
  "github.io",
  "googleapis.com",
  "googleusercontent.com",
  "gstatic.com"
]);

function emptyResult(currentDomain: string | null): RelatedDomainCandidatesResult {
  return {
    currentDomain,
    strongCandidates: [],
    mediumCandidates: [],
    ignoredCandidates: []
  };
}

function normalizePublicHost(input: string): string | null {
  const normalized = normalizeDomain(input);

  if (!normalized.ok) {
    return null;
  }

  if (checkDenylistedHost(normalized.domain).denied) {
    return null;
  }

  return normalized.domain;
}

function createCandidate(
  reason: RelatedDomainCandidateReason,
  routeTarget: RouteTargetPlan,
  sourceHost: string,
  defaultSelected: boolean
): MutableCandidate {
  return {
    domain: routeTarget.domain,
    reason,
    sourceHosts: new Set([sourceHost]),
    suggestedRuleDomain: routeTarget.domain,
    suggestedIncludeSubdomains: routeTarget.suggestedIncludeSubdomains,
    routeTargetReason: routeTarget.routeTargetReason,
    routeTargetConfidence: routeTarget.routeTargetConfidence,
    defaultSelected
  };
}

function addCandidate(
  candidatesByCategory: Record<CandidateCategory, Map<string, MutableCandidate>>,
  category: CandidateCategory,
  candidate: MutableCandidate
): void {
  const categoryCandidates = candidatesByCategory[category];
  const existingCandidate = categoryCandidates.get(candidate.domain);

  if (existingCandidate) {
    for (const sourceHost of candidate.sourceHosts) {
      existingCandidate.sourceHosts.add(sourceHost);
    }

    return;
  }

  categoryCandidates.set(candidate.domain, candidate);
}

function finalizeCandidates(candidates: Map<string, MutableCandidate>): RelatedDomainCandidate[] {
  return [...candidates.values()]
    .map((candidate) => {
      const sourceHosts = [...candidate.sourceHosts].sort();

      return {
        ...candidate,
        sourceHosts,
        sourceHostCount: sourceHosts.length
      };
    })
    .sort((left, right) => left.domain.localeCompare(right.domain));
}

function candidateCategoryFromClassification(classification: DomainCandidateClassificationResult): CandidateCategory {
  if (classification.classification === "related") {
    return "strongCandidates";
  }

  if (classification.classification === "ignored") {
    return "ignoredCandidates";
  }

  return "mediumCandidates";
}

function ignoredReasonFromCategory(category: DomainCandidateClassificationCategory): RelatedDomainCandidateReason {
  if (category === "analytics" || category === "adtech") {
    return "known-tracking-or-analytics";
  }

  if (category === "local-helper") {
    return "local-or-adblock-helper";
  }

  if (category === "schema-helper") {
    return "system-or-schema-helper";
  }

  if (category === "system-helper") {
    return "shared-infrastructure";
  }

  return "third-party-resource";
}

function routeTargetConfidenceFromClassification(
  classification: DomainCandidateClassificationResult
): RelatedDomainRouteTargetConfidence {
  return classification.confidence;
}

function reasonFromClassification(classification: DomainCandidateClassificationResult): RelatedDomainCandidateReason {
  if (classification.classification === "related") {
    return classification.domain === classification.siteDomain ? "same-site-subdomain" : "explicit-related-domain";
  }

  if (classification.classification === "ignored") {
    return ignoredReasonFromCategory(classification.category);
  }

  return "third-party-resource";
}

function isUnsafeBroadeningBaseDomain(domain: string): boolean {
  return unsafeBroadeningBaseDomains.has(domain);
}

function siblingWideningBaseDomain(observation: ClassifiedObservation, currentBaseDomain: string): string | null {
  if (observation.classification.classification !== "review") {
    return null;
  }

  if (observation.observedBaseDomain === currentBaseDomain || observation.observedBaseDomain === observation.observedHost) {
    return null;
  }

  if (isUnsafeBroadeningBaseDomain(observation.observedBaseDomain)) {
    return null;
  }

  return observation.observedBaseDomain;
}

function collectSiblingWideningGroups(
  observations: readonly ClassifiedObservation[],
  currentBaseDomain: string
): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();

  for (const observation of observations) {
    const baseDomain = siblingWideningBaseDomain(observation, currentBaseDomain);

    if (!baseDomain) {
      continue;
    }

    groups.set(baseDomain, (groups.get(baseDomain) ?? new Set()).add(observation.observedHost));
  }

  return groups;
}

function routeTargetPlanForObservation(
  observation: ClassifiedObservation,
  currentBaseDomain: string,
  siblingWideningGroups: ReadonlyMap<string, ReadonlySet<string>>
): RouteTargetPlan {
  const classification = observation.classification;

  if (classification.classification === "related") {
    const sameSite = classification.domain === currentBaseDomain;

    return {
      domain: classification.domain,
      suggestedIncludeSubdomains: true,
      routeTargetReason: sameSite ? "same-site-resources" : "known-related-domain",
      routeTargetConfidence: routeTargetConfidenceFromClassification(classification)
    };
  }

  if (classification.category === "system-helper") {
    return {
      domain: observation.observedHost,
      suggestedIncludeSubdomains: false,
      routeTargetReason: "unsafe-shared-infrastructure",
      routeTargetConfidence: "low"
    };
  }

  const siblingBaseDomain = siblingWideningBaseDomain(observation, currentBaseDomain);

  if (siblingBaseDomain && (siblingWideningGroups.get(siblingBaseDomain)?.size ?? 0) > 1) {
    return {
      domain: siblingBaseDomain,
      suggestedIncludeSubdomains: true,
      routeTargetReason: "multiple-sibling-hosts",
      routeTargetConfidence: "medium"
    };
  }

  return {
    domain:
      classification.classification === "ignored" || classification.source === "user-override"
        ? classification.domain
        : observation.observedHost,
    suggestedIncludeSubdomains: false,
    routeTargetReason: "exact-observed-host",
    routeTargetConfidence: classification.classification === "ignored" ? "low" : routeTargetConfidenceFromClassification(classification)
  };
}

export function buildRelatedDomainCandidates(input: RelatedDomainCandidateInput): RelatedDomainCandidatesResult {
  const currentHost = normalizePublicHost(input.currentDomain);

  if (!currentHost) {
    return emptyResult(null);
  }

  const currentBaseDomain = getBaseDomain(currentHost);
  const observations: ClassifiedObservation[] = [];

  for (const observedInput of input.observedUrlsOrHosts) {
    const observedHost = normalizePublicHost(observedInput);

    if (!observedHost || observedHost === currentHost) {
      continue;
    }

    const classification = classifyDomainCandidate({
      currentDomain: currentHost,
      candidateDomain: observedHost,
      userOverrides: input.userOverrides
    });

    if (!classification) {
      continue;
    }

    observations.push({
      observedHost,
      observedBaseDomain: getBaseDomain(observedHost),
      classification
    });
  }

  const siblingWideningGroups = collectSiblingWideningGroups(observations, currentBaseDomain);
  const candidatesByCategory: Record<CandidateCategory, Map<string, MutableCandidate>> = {
    strongCandidates: new Map(),
    mediumCandidates: new Map(),
    ignoredCandidates: new Map()
  };

  for (const observation of observations) {
    const classification = observation.classification;
    const routeTarget = routeTargetPlanForObservation(observation, currentBaseDomain, siblingWideningGroups);

    addCandidate(
      candidatesByCategory,
      candidateCategoryFromClassification(classification),
      createCandidate(
        reasonFromClassification(classification),
        routeTarget,
        observation.observedHost,
        classification.classification === "related"
      )
    );
  }

  return {
    currentDomain: currentHost,
    strongCandidates: finalizeCandidates(candidatesByCategory.strongCandidates),
    mediumCandidates: finalizeCandidates(candidatesByCategory.mediumCandidates),
    ignoredCandidates: finalizeCandidates(candidatesByCategory.ignoredCandidates)
  };
}
