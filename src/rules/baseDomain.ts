import { getRegistrableDomain } from "../domainClassification/registrableDomain";

function normalizeHostForRelationship(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, "");
}

export function getBaseDomain(host: string): string {
  const normalizedHost = normalizeHostForRelationship(host);

  return getRegistrableDomain(normalizedHost) ?? normalizedHost;
}

export function isSubdomainOf(host: string, parentDomain: string): boolean {
  const normalizedHost = normalizeHostForRelationship(host);
  const normalizedParentDomain = normalizeHostForRelationship(parentDomain);

  return normalizedHost.endsWith(`.${normalizedParentDomain}`);
}

export function domainEqualsOrIsSubdomain(host: string, parentDomain: string): boolean {
  const normalizedHost = normalizeHostForRelationship(host);
  const normalizedParentDomain = normalizeHostForRelationship(parentDomain);

  return normalizedHost === normalizedParentDomain || isSubdomainOf(normalizedHost, normalizedParentDomain);
}
