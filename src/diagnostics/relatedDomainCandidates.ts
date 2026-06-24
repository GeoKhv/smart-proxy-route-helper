import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";

export type RelatedDomainCandidateInput = {
  currentDomain: string;
  observedUrlsOrHosts: string[];
};

export type RelatedDomainCandidateReason =
  | "same-site-subdomain"
  | "explicit-related-domain"
  | "third-party-resource"
  | "known-tracking-or-analytics"
  | "shared-infrastructure";

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

const multiLabelPublicSuffixes = new Set([
  "ac.uk",
  "co.jp",
  "co.nz",
  "co.uk",
  "com.au",
  "com.br",
  "com.cn",
  "com.mx",
  "com.sg",
  "com.tr",
  "gov.uk",
  "net.au",
  "org.au",
  "org.uk"
]);

const explicitRelatedDomains = new Map<string, readonly string[]>([
  ["letterboxd.com", ["ltrbxd.com"]],
  ["ltrbxd.com", ["letterboxd.com"]]
]);

const trackingOrAnalyticsDomains = new Set([
  "doubleclick.net",
  "facebook.net",
  "google-analytics.com",
  "googletagmanager.com",
  "hotjar.com",
  "sentry.io"
]);

const sharedInfrastructureDomains = new Set(["akamaihd.net", "cloudfront.net", "googleapis.com", "gstatic.com"]);

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

function getBaseDomain(host: string): string {
  const labels = host.split(".");

  if (labels.length <= 2) {
    return host;
  }

  const lastTwoLabels = labels.slice(-2).join(".");

  if (multiLabelPublicSuffixes.has(lastTwoLabels) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return lastTwoLabels;
}

function isSubdomainOf(host: string, parentDomain: string): boolean {
  return host.endsWith(`.${parentDomain}`);
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

export function buildRelatedDomainCandidates(input: RelatedDomainCandidateInput): RelatedDomainCandidatesResult {
  const currentHost = normalizePublicHost(input.currentDomain);

  if (!currentHost) {
    return emptyResult(null);
  }

  const currentBaseDomain = getBaseDomain(currentHost);
  const relatedDomains = new Set(explicitRelatedDomains.get(currentBaseDomain) ?? []);
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

    const observedBaseDomain = getBaseDomain(observedHost);

    if (observedBaseDomain === currentBaseDomain) {
      const observedIsSubdomain = isSubdomainOf(observedHost, currentBaseDomain);
      const currentIsSubdomain = isSubdomainOf(currentHost, currentBaseDomain);

      if (
        (observedIsSubdomain && observedHost !== currentHost) ||
        (currentIsSubdomain && observedHost === currentBaseDomain)
      ) {
        addCandidate(
          candidatesByCategory,
          "strongCandidates",
          createCandidate(currentBaseDomain, "same-site-subdomain", observedHost, true, true)
        );
      }

      continue;
    }

    if (relatedDomains.has(observedBaseDomain)) {
      addCandidate(
        candidatesByCategory,
        "strongCandidates",
        createCandidate(observedBaseDomain, "explicit-related-domain", observedHost, true, true)
      );
      continue;
    }

    if (trackingOrAnalyticsDomains.has(observedBaseDomain)) {
      addCandidate(
        candidatesByCategory,
        "ignoredCandidates",
        createCandidate(observedBaseDomain, "known-tracking-or-analytics", observedHost, false, false)
      );
      continue;
    }

    if (sharedInfrastructureDomains.has(observedBaseDomain)) {
      addCandidate(
        candidatesByCategory,
        "ignoredCandidates",
        createCandidate(observedBaseDomain, "shared-infrastructure", observedHost, false, false)
      );
      continue;
    }

    addCandidate(
      candidatesByCategory,
      "mediumCandidates",
      createCandidate(observedHost, "third-party-resource", observedHost, false, false)
    );
  }

  return {
    currentDomain: currentHost,
    strongCandidates: finalizeCandidates(candidatesByCategory.strongCandidates),
    mediumCandidates: finalizeCandidates(candidatesByCategory.mediumCandidates),
    ignoredCandidates: finalizeCandidates(candidatesByCategory.ignoredCandidates)
  };
}
