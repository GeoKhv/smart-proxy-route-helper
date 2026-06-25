import { parse } from "tldts";

import { normalizeDomain } from "../rules/normalizeDomain";

const parseOptions = {
  extractHostname: false,
  mixedInputs: false
} as const;

const sharedInfrastructureRegistrableDomains = new Set([
  "akamaihd.net",
  "appspot.com",
  "auth0.com",
  "cloudfront.net",
  "github.io",
  "googleapis.com",
  "googleusercontent.com",
  "gstatic.com",
  "netlify.app",
  "pages.dev",
  "vercel.app"
]);

export type DomainParts = {
  hostname: string;
  registrableDomain: string | null;
  icannRegistrableDomain: string | null;
  privateRegistrableDomain: string | null;
  publicSuffix: string | null;
  icannPublicSuffix: string | null;
  privatePublicSuffix: string | null;
  subdomain: string | null;
  isPrivateSuffixBoundary: boolean;
};

export type RegistrableDomainBroadeningContext = {
  targetDomain?: string | null;
  explicitRelatedBaseDomain?: string | null;
};

function normalizeHostnameOrNull(input: string): string | null {
  const normalized = normalizeDomain(input);

  return normalized.ok ? normalized.domain : null;
}

function normalizeTargetDomain(input: string | null | undefined): string | null {
  return input ? normalizeHostnameOrNull(input) : null;
}

function domainEqualsOrIsSubdomain(hostname: string, parentDomain: string): boolean {
  return hostname === parentDomain || hostname.endsWith(`.${parentDomain}`);
}

export function getDomainParts(hostname: string): DomainParts | null {
  const normalizedHostname = normalizeHostnameOrNull(hostname);

  if (!normalizedHostname) {
    return null;
  }

  const icannParts = parse(normalizedHostname, {
    ...parseOptions,
    allowPrivateDomains: false
  });
  const privateParts = parse(normalizedHostname, {
    ...parseOptions,
    allowPrivateDomains: true
  });
  const privatePublicSuffix = privateParts.isPrivate ? privateParts.publicSuffix : null;
  const registrableDomain = privateParts.domain ?? icannParts.domain;

  return {
    hostname: normalizedHostname,
    registrableDomain,
    icannRegistrableDomain: icannParts.domain,
    privateRegistrableDomain: privateParts.domain,
    publicSuffix: privateParts.publicSuffix ?? icannParts.publicSuffix,
    icannPublicSuffix: icannParts.publicSuffix,
    privatePublicSuffix,
    subdomain: privateParts.subdomain ?? icannParts.subdomain,
    isPrivateSuffixBoundary: privatePublicSuffix !== null
  };
}

export function getRegistrableDomain(hostname: string): string | null {
  return getDomainParts(hostname)?.registrableDomain ?? null;
}

export function isKnownPublicOrPrivateSuffixBoundary(hostname: string): boolean {
  const parts = getDomainParts(hostname);

  if (!parts) {
    return false;
  }

  return parts.isPrivateSuffixBoundary || parts.registrableDomain === null;
}

export function isSharedInfrastructureRegistrableDomain(domain: string): boolean {
  const normalizedDomain = normalizeTargetDomain(domain);

  return normalizedDomain ? sharedInfrastructureRegistrableDomains.has(normalizedDomain) : false;
}

export function canBroadenToRegistrableDomain(
  hostname: string,
  context: RegistrableDomainBroadeningContext = {}
): boolean {
  const parts = getDomainParts(hostname);

  if (!parts) {
    return false;
  }

  const targetDomain = normalizeTargetDomain(context.targetDomain) ?? parts.registrableDomain;

  if (!targetDomain || parts.hostname === targetDomain) {
    return false;
  }

  if (!domainEqualsOrIsSubdomain(parts.hostname, targetDomain)) {
    return false;
  }

  const explicitRelatedBaseDomain = normalizeTargetDomain(context.explicitRelatedBaseDomain);

  if (explicitRelatedBaseDomain && explicitRelatedBaseDomain === targetDomain) {
    return true;
  }

  if (isSharedInfrastructureRegistrableDomain(targetDomain)) {
    return false;
  }

  if (parts.isPrivateSuffixBoundary && targetDomain !== parts.privateRegistrableDomain) {
    return false;
  }

  return targetDomain === parts.registrableDomain;
}
