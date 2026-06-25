import { isDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainCandidateUserOverride, DomainCandidateUserOverrideAction } from "./domainClassificationTypes";

export type UserClassificationGlobalOverride = "ignored" | "review";
export type UserClassificationSiteOverride = "suggested" | "ignored";

export type UserClassificationOverrides = {
  global: Record<string, UserClassificationGlobalOverride>;
  site: Record<string, Record<string, UserClassificationSiteOverride>>;
};

export type UserClassificationOverrideTarget =
  | {
      scope: "global";
      domain: string;
    }
  | {
      scope: "site";
      siteDomain: string;
      domain: string;
    };

export type UserClassificationOverrideEntry = UserClassificationOverrideTarget & {
  action: UserClassificationGlobalOverride | UserClassificationSiteOverride;
};

export type UpsertUserClassificationOverrideResult =
  | {
      ok: true;
      classificationOverrides: UserClassificationOverrides;
      override: DomainCandidateUserOverride;
    }
  | {
      ok: false;
      error: string;
    };

const validGlobalOverrides = new Set<UserClassificationGlobalOverride>(["ignored", "review"]);
const validSiteOverrides = new Set<UserClassificationSiteOverride>(["suggested", "ignored"]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function normalizeSafeOverrideDomain(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = normalizeDomain(input);

  if (!normalized.ok || isDenylistedHost(normalized.domain)) {
    return null;
  }

  return normalized.domain;
}

function sortRecord<TValue extends string>(input: Record<string, TValue>): Record<string, TValue> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right))) as Record<
    string,
    TValue
  >;
}

export function createDefaultUserClassificationOverrides(): UserClassificationOverrides {
  return {
    global: {},
    site: {}
  };
}

export function sanitizeUserClassificationOverrides(input: unknown): UserClassificationOverrides {
  if (!isRecord(input)) {
    return createDefaultUserClassificationOverrides();
  }

  const global: Record<string, UserClassificationGlobalOverride> = {};
  const site: Record<string, Record<string, UserClassificationSiteOverride>> = {};

  if (isRecord(input.global)) {
    for (const [rawDomain, action] of Object.entries(input.global)) {
      const domain = normalizeSafeOverrideDomain(rawDomain);

      if (!domain || !validGlobalOverrides.has(action as UserClassificationGlobalOverride)) {
        continue;
      }

      global[domain] = action as UserClassificationGlobalOverride;
    }
  }

  if (isRecord(input.site)) {
    for (const [rawSiteDomain, rawCandidateOverrides] of Object.entries(input.site)) {
      const siteDomain = normalizeSafeOverrideDomain(rawSiteDomain);

      if (!siteDomain || !isRecord(rawCandidateOverrides)) {
        continue;
      }

      const candidateOverrides: Record<string, UserClassificationSiteOverride> = {};

      for (const [rawCandidateDomain, action] of Object.entries(rawCandidateOverrides)) {
        const candidateDomain = normalizeSafeOverrideDomain(rawCandidateDomain);

        if (!candidateDomain || !validSiteOverrides.has(action as UserClassificationSiteOverride)) {
          continue;
        }

        candidateOverrides[candidateDomain] = action as UserClassificationSiteOverride;
      }

      if (Object.keys(candidateOverrides).length > 0) {
        site[siteDomain] = sortRecord(candidateOverrides);
      }
    }
  }

  return {
    global: sortRecord(global),
    site: Object.fromEntries(
      Object.entries(site).sort(([left], [right]) => left.localeCompare(right))
    ) as UserClassificationOverrides["site"]
  };
}

export function domainCandidateUserOverridesFromStorage(
  overrides: UserClassificationOverrides
): DomainCandidateUserOverride[] {
  const sanitized = sanitizeUserClassificationOverrides(overrides);
  const userOverrides: DomainCandidateUserOverride[] = [];

  for (const [domain, action] of Object.entries(sanitized.global)) {
    userOverrides.push({
      domain,
      action: action === "ignored" ? "ignore-globally" : "review-globally"
    });
  }

  for (const [siteDomain, candidateOverrides] of Object.entries(sanitized.site)) {
    for (const [domain, action] of Object.entries(candidateOverrides)) {
      userOverrides.push({
        domain,
        siteDomain,
        action: action === "suggested" ? "suggest-for-site" : "ignore-for-site"
      });
    }
  }

  return userOverrides;
}

function cloneOverrides(overrides: UserClassificationOverrides): UserClassificationOverrides {
  return {
    global: { ...overrides.global },
    site: Object.fromEntries(
      Object.entries(overrides.site).map(([siteDomain, candidateOverrides]) => [
        siteDomain,
        { ...candidateOverrides }
      ])
    )
  };
}

function normalizedOverrideOrError(
  override: DomainCandidateUserOverride
): DomainCandidateUserOverride | { error: string } {
  const domain = normalizeSafeOverrideDomain(override.domain);

  if (!domain) {
    return {
      error: "Choose a valid public candidate domain before saving a classification override."
    };
  }

  if (override.action === "ignore-globally" || override.action === "review-globally") {
    return {
      domain,
      action: override.action
    };
  }

  const siteDomain = normalizeSafeOverrideDomain(override.siteDomain);

  if (!siteDomain) {
    return {
      error: "Choose a valid public site domain before saving a site classification override."
    };
  }

  return {
    domain,
    siteDomain,
    action: override.action
  };
}

export function upsertUserClassificationOverride(
  currentOverrides: UserClassificationOverrides,
  override: DomainCandidateUserOverride
): UpsertUserClassificationOverrideResult {
  const normalizedOverride = normalizedOverrideOrError(override);

  if ("error" in normalizedOverride) {
    return {
      ok: false,
      error: normalizedOverride.error
    };
  }

  const nextOverrides = cloneOverrides(sanitizeUserClassificationOverrides(currentOverrides));

  if (normalizedOverride.action === "ignore-globally") {
    nextOverrides.global[normalizedOverride.domain] = "ignored";
  } else if (normalizedOverride.action === "review-globally") {
    nextOverrides.global[normalizedOverride.domain] = "review";
  } else {
    const siteDomain = normalizedOverride.siteDomain;

    if (!siteDomain) {
      return {
        ok: false,
        error: "Choose a valid public site domain before saving a site classification override."
      };
    }

    const existingSiteOverrides = nextOverrides.site[siteDomain] ?? {};

    nextOverrides.site[siteDomain] = {
      ...existingSiteOverrides,
      [normalizedOverride.domain]: normalizedOverride.action === "suggest-for-site" ? "suggested" : "ignored"
    };
  }

  return {
    ok: true,
    classificationOverrides: sanitizeUserClassificationOverrides(nextOverrides),
    override: normalizedOverride
  };
}

export function removeUserClassificationOverride(
  currentOverrides: UserClassificationOverrides,
  target: UserClassificationOverrideTarget
): UserClassificationOverrides {
  const nextOverrides = cloneOverrides(sanitizeUserClassificationOverrides(currentOverrides));

  if (target.scope === "global") {
    const domain = normalizeSafeOverrideDomain(target.domain);

    if (domain) {
      delete nextOverrides.global[domain];
    }

    return sanitizeUserClassificationOverrides(nextOverrides);
  }

  const siteDomain = normalizeSafeOverrideDomain(target.siteDomain);
  const domain = normalizeSafeOverrideDomain(target.domain);

  if (siteDomain && domain && nextOverrides.site[siteDomain]) {
    delete nextOverrides.site[siteDomain][domain];

    if (Object.keys(nextOverrides.site[siteDomain]).length === 0) {
      delete nextOverrides.site[siteDomain];
    }
  }

  return sanitizeUserClassificationOverrides(nextOverrides);
}

export function listUserClassificationOverrideEntries(
  overrides: UserClassificationOverrides
): UserClassificationOverrideEntry[] {
  const sanitized = sanitizeUserClassificationOverrides(overrides);
  const entries: UserClassificationOverrideEntry[] = [];

  for (const [domain, action] of Object.entries(sanitized.global)) {
    entries.push({
      scope: "global",
      domain,
      action
    });
  }

  for (const [siteDomain, candidateOverrides] of Object.entries(sanitized.site)) {
    for (const [domain, action] of Object.entries(candidateOverrides)) {
      entries.push({
        scope: "site",
        siteDomain,
        domain,
        action
      });
    }
  }

  return entries;
}

export function isDomainCandidateUserOverrideAction(input: unknown): input is DomainCandidateUserOverrideAction {
  return (
    input === "ignore-globally" ||
    input === "review-globally" ||
    input === "suggest-for-site" ||
    input === "ignore-for-site"
  );
}
