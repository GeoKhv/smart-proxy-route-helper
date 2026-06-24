const internalSchemes = new Set(["about", "chrome", "chrome-extension", "edge", "edge-extension", "file"]);
const internalSuffixes = [".local", ".lan", ".localhost", ".internal", ".home", ".home.arpa"];

export type DenylistReason =
  | "internal-scheme"
  | "localhost"
  | "loopback-ip"
  | "private-ip"
  | "internal-suffix"
  | "single-label-host"
  | "invalid-host";

export type DenylistResult =
  | {
      denied: true;
      reason: DenylistReason;
    }
  | {
      denied: false;
    };

function extractHostForDenylist(input: string): { host: string | null; internalScheme: boolean } {
  const trimmedInput = input.trim().toLowerCase();
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmedInput);
  const scheme = schemeMatch?.[1];

  if (scheme && internalSchemes.has(scheme)) {
    return { host: null, internalScheme: true };
  }

  if (trimmedInput === "::1") {
    return { host: "::1", internalScheme: false };
  }

  const withoutWildcard = trimmedInput.replace(/^\*\./, "");

  try {
    if (withoutWildcard.startsWith("//")) {
      return { host: new URL(`https:${withoutWildcard}`).hostname, internalScheme: false };
    }

    if (scheme === "http" || scheme === "https") {
      return { host: new URL(withoutWildcard).hostname, internalScheme: false };
    }

    return { host: new URL(`https://${withoutWildcard}`).hostname, internalScheme: false };
  } catch {
    const host = withoutWildcard.split(/[/?#]/, 1)[0].replace(/\.+$/, "");
    return { host: host || null, internalScheme: false };
  }
}

function parseIpv4(host: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return null;
  }

  const octets = host.split(".").map(Number);

  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isLoopbackIpv4(octets: number[]): boolean {
  return octets[0] === 127;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [first, second] = octets;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 0
  );
}

function isPrivateOrLoopbackIpv6(host: string): DenylistReason | null {
  const normalizedHost = host.replace(/^\[/, "").replace(/\]$/, "");

  if (normalizedHost === "::1") {
    return "loopback-ip";
  }

  if (normalizedHost === "::" || normalizedHost.startsWith("fc") || normalizedHost.startsWith("fd") || normalizedHost.startsWith("fe80:")) {
    return "private-ip";
  }

  return null;
}

export function checkDenylistedHost(input: string): DenylistResult {
  const { host, internalScheme } = extractHostForDenylist(input);

  if (internalScheme) {
    return { denied: true, reason: "internal-scheme" };
  }

  if (!host) {
    return { denied: true, reason: "invalid-host" };
  }

  const normalizedHost = host.toLowerCase().replace(/\.+$/, "");

  if (normalizedHost === "localhost") {
    return { denied: true, reason: "localhost" };
  }

  const ipv4 = parseIpv4(normalizedHost);

  if (ipv4) {
    if (isLoopbackIpv4(ipv4)) {
      return { denied: true, reason: "loopback-ip" };
    }

    if (isPrivateIpv4(ipv4)) {
      return { denied: true, reason: "private-ip" };
    }
  }

  const ipv6Reason = isPrivateOrLoopbackIpv6(normalizedHost);

  if (ipv6Reason) {
    return { denied: true, reason: ipv6Reason };
  }

  if (internalSuffixes.some((suffix) => normalizedHost.endsWith(suffix))) {
    return { denied: true, reason: "internal-suffix" };
  }

  if (!normalizedHost.includes(".")) {
    return { denied: true, reason: "single-label-host" };
  }

  return { denied: false };
}

export function isDenylistedHost(input: string): boolean {
  return checkDenylistedHost(input).denied;
}
