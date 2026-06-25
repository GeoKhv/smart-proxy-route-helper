export type DomainCandidateClassificationKind = "related" | "ignored" | "review";

export type DomainCandidateClassificationCategory =
  | "site-assets"
  | "analytics"
  | "adtech"
  | "system-helper"
  | "schema-helper"
  | "local-helper"
  | "suspicious"
  | "unknown";

export type DomainCandidateClassificationScope = "global" | "site";

export type DomainCandidateClassificationConfidence = "high" | "medium" | "low";

export type DomainCandidateClassificationSource = "built-in" | "user-override" | "community-proposal";

export type DomainCandidateClassificationResult = {
  domain: string;
  classification: DomainCandidateClassificationKind;
  category: DomainCandidateClassificationCategory;
  scope: DomainCandidateClassificationScope;
  siteDomain?: string;
  confidence: DomainCandidateClassificationConfidence;
  reason: string;
  source: DomainCandidateClassificationSource;
};

export type DomainCandidateUserOverrideAction =
  | "ignore-globally"
  | "review-globally"
  | "suggest-for-site"
  | "ignore-for-site";

export type DomainCandidateUserOverride = {
  domain: string;
  action: DomainCandidateUserOverrideAction;
  siteDomain?: string;
  reason?: string;
};

export type ClassifyDomainCandidateInput = {
  currentDomain: string;
  candidateDomain: string;
  userOverrides?: readonly DomainCandidateUserOverride[];
};
