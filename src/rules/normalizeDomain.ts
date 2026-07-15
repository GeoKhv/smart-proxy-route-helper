import type { DomainValidationErrorCode, NormalizeDomainResult } from "./ruleTypes";
import { getMessage } from "../i18n/i18n";

const schemePattern = /^([a-z][a-z0-9+.-]*):/i;
const supportedSchemes = new Set(["http", "https"]);

function validationError(code: DomainValidationErrorCode, message: string): NormalizeDomainResult {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function stripLeadingWildcard(input: string): string {
  return input.replace(/^\*\./, "").replace(/^([a-z][a-z0-9+.-]*:\/\/)\*\./i, "$1");
}

function hasUnsupportedScheme(input: string): boolean {
  const schemeMatch = schemePattern.exec(input);

  if (!schemeMatch) {
    return false;
  }

  const scheme = schemeMatch[1].toLowerCase();

  if (supportedSchemes.has(scheme)) {
    return false;
  }

  const valueAfterColon = input.slice(schemeMatch[0].length);

  return !scheme.includes(".") || !/^\d+(?:[/?#]|$)/.test(valueAfterColon);
}

function extractHostname(input: string): string | null {
  const withoutWildcard = stripLeadingWildcard(input);

  try {
    if (withoutWildcard.startsWith("//")) {
      return new URL(`https:${withoutWildcard}`).hostname;
    }

    if (supportedSchemes.has(schemePattern.exec(withoutWildcard)?.[1]?.toLowerCase() ?? "")) {
      return new URL(withoutWildcard).hostname;
    }

    return new URL(`https://${withoutWildcard}`).hostname;
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

function isValidDomainLabel(label: string): boolean {
  return (
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9-]+$/.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-")
  );
}

function isValidNormalizedHost(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) {
    return false;
  }

  if (hostname.includes("*") || /\s/.test(hostname)) {
    return false;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split(".").every((part) => Number(part) <= 255);
  }

  return hostname.split(".").every(isValidDomainLabel);
}

export function normalizeDomain(input: string): NormalizeDomainResult {
  const trimmedInput = input.trim();

  if (trimmedInput.length === 0) {
    return validationError("empty", getMessage("validationEnterDomain"));
  }

  const lowerInput = trimmedInput.toLowerCase();

  if (hasUnsupportedScheme(lowerInput)) {
    return validationError("unsupported-scheme", getMessage("validationOnlyHttpHttps"));
  }

  const hostname = extractHostname(lowerInput);

  if (!hostname) {
    return validationError("invalid-host", getMessage("validationInvalidHostname"));
  }

  const normalizedDomain = normalizeHostname(hostname);

  if (!isValidNormalizedHost(normalizedDomain)) {
    return validationError("invalid-host", getMessage("validationInvalidHostname"));
  }

  return {
    ok: true,
    domain: normalizedDomain
  };
}
