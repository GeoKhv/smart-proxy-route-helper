import { classifyDomainCandidate } from "../domainClassification/classifyDomainCandidate";
import type {
  DomainCandidateClassificationCategory,
  DomainCandidateClassificationResult,
  DomainCandidateUserOverride
} from "../domainClassification/domainClassificationTypes";
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

export type RelatedDomainCandidate = {
  domain: string;
  reason: RelatedDomainCandidateReason;
  sourceHosts: string[];
  sourceHostCount: number;
  suggestedIncludeSubdomains: boolean;
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
  domain: string,
  reason: RelatedDomainCandidateReason,
  sourceHost: string,
  suggestedIncludeSubdomains: boolean,
  defaultSelected: boolean
): MutableCandidate {
  return {
    domain,
    reason,
    sourceHosts: new Set([sourceHost]),
    suggestedIncludeSubdomains,
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

function reasonFromClassification(classification: DomainCandidateClassificationResult): RelatedDomainCandidateReason {
  if (classification.classification === "related") {
    return classification.domain === classification.siteDomain ? "same-site-subdomain" : "explicit-related-domain";
  }

  if (classification.classification === "ignored") {
    return ignoredReasonFromCategory(classification.category);
  }

  return "third-party-resource";
}

export function buildRelatedDomainCandidates(input: RelatedDomainCandidateInput): RelatedDomainCandidatesResult {
  const currentHost = normalizePublicHost(input.currentDomain);

  if (!currentHost) {
    return emptyResult(null);
  }

  const candidatesByCategory: Record<CandidateCategory, Map<string, MutableCandidate>> = {
    strongCandidates: new Map(),
    mediumCandidates: new Map(),
    ignoredCandidates: new Map()
  };

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

    addCandidate(
      candidatesByCategory,
      candidateCategoryFromClassification(classification),
      createCandidate(
        classification.domain,
        reasonFromClassification(classification),
        observedHost,
        classification.classification === "related",
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
