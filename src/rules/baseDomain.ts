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

function normalizeHostForRelationship(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, "");
}

export function getBaseDomain(host: string): string {
  const normalizedHost = normalizeHostForRelationship(host);
  const labels = normalizedHost.split(".");

  if (labels.length <= 2) {
    return normalizedHost;
  }

  const lastTwoLabels = labels.slice(-2).join(".");

  if (multiLabelPublicSuffixes.has(lastTwoLabels) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return lastTwoLabels;
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
