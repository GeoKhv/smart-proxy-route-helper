import { buildRelatedDomainCandidates, type RelatedDomainCandidatesResult } from "./relatedDomainCandidates";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";

export const currentPageResourceHostsMessageType =
  "smart-proxy-route-helper:preview-current-page-related-domains" as const;

export const currentPageResourceHostLimit = 80;

export type CurrentPageResourceHostStatus = "success" | "unsupported_url" | "collection_unavailable" | "error";

export type CurrentPageResourceHostsRequest = {
  type: typeof currentPageResourceHostsMessageType;
  tabId: number;
  url?: string;
};

export type CurrentPageResourceHostsResponse = {
  status: CurrentPageResourceHostStatus;
  message: string;
  currentDomain?: string;
  collectedHosts?: string[];
  candidates?: RelatedDomainCandidatesResult;
};

type CurrentPageResourceHostCollectionResult = {
  hosts: string[];
  pageLooksLikeErrorOrProtection: boolean;
};

export type ScriptInjectionResult = {
  result?: unknown;
};

export type CurrentPageResourceHostCollector = (tabId: number) => Promise<readonly ScriptInjectionResult[]>;

type CurrentPageResourceHostTarget =
  | {
      ok: true;
      domain: string;
    }
  | {
      ok: false;
      response: CurrentPageResourceHostsResponse;
    };

export type RunCurrentPageResourceHostPreviewOptions = {
  executeScript: CurrentPageResourceHostCollector;
};

function response(
  status: CurrentPageResourceHostStatus,
  message: string,
  currentDomain?: string,
  extra?: Pick<CurrentPageResourceHostsResponse, "collectedHosts" | "candidates">
): CurrentPageResourceHostsResponse {
  return {
    status,
    message,
    ...(currentDomain ? { currentDomain } : {}),
    ...(extra?.collectedHosts ? { collectedHosts: extra.collectedHosts } : {}),
    ...(extra?.candidates ? { candidates: extra.candidates } : {})
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Could not collect resource hosts from this page.";
}

function isPageNotLoadedError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();

  return message.includes("showing error page") || message.includes("frame with id 0");
}

function errorOrProtectionPageMessage(): string {
  return "This page appears to be an error or protection page, so related-domain results may not represent the target site. Route or check this site through proxy, reload the page, then preview related domains.";
}

function collectionUnavailableMessage(error: unknown): string {
  if (isPageNotLoadedError(error)) {
    return errorOrProtectionPageMessage();
  }

  return `Could not collect resource hosts from this page: ${errorMessage(error)}`;
}

function unsupportedUrlMessage(url: string): string {
  try {
    const protocol = new URL(url).protocol.replace(/:$/, "");
    const protocolLabel = protocol ? `${protocol}://` : "This page";

    return `${protocolLabel} pages cannot be used for related-domain preview. Open an http or https site first.`;
  } catch {
    return "Open a valid http or https site before previewing related domains.";
  }
}

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": "Internal browser pages cannot be used for related-domain preview.",
    localhost: "Localhost cannot be used for related-domain preview.",
    "loopback-ip": "Loopback addresses cannot be used for related-domain preview.",
    "private-ip": "Private network addresses cannot be used for related-domain preview.",
    "internal-suffix": "Internal local domains cannot be used for related-domain preview.",
    "single-label-host": "Open a public domain with a dot before previewing related domains.",
    "invalid-host": "Open a valid http or https site before previewing related domains."
  };

  return messages[reason] ?? "This site cannot be used for related-domain preview.";
}

function isIpv4Address(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isSupportedStatus(status: unknown): status is CurrentPageResourceHostStatus {
  return (
    status === "success" ||
    status === "unsupported_url" ||
    status === "collection_unavailable" ||
    status === "error"
  );
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function isCurrentPageResourceHostCollectionResult(input: unknown): input is CurrentPageResourceHostCollectionResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "hosts" in input &&
    isStringArray(input.hosts) &&
    "pageLooksLikeErrorOrProtection" in input &&
    typeof input.pageLooksLikeErrorOrProtection === "boolean"
  );
}

function getCurrentPageResourceHostTarget(url: string | undefined): CurrentPageResourceHostTarget {
  if (!url) {
    return {
      ok: false,
      response: response("unsupported_url", "Open a supported site before previewing related domains.")
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      response: response("unsupported_url", "Open a valid http or https site before previewing related domains.")
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      response: response("unsupported_url", unsupportedUrlMessage(url))
    };
  }

  const normalized = normalizeDomain(url);

  if (!normalized.ok) {
    return {
      ok: false,
      response: response("unsupported_url", normalized.error.message)
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      response: response("unsupported_url", denylistMessage(denylist.reason), normalized.domain)
    };
  }

  return {
    ok: true,
    domain: normalized.domain
  };
}

function resultMessage(hostCount: number, candidateCount: number, ignoredCandidateCount: number): string {
  if (hostCount === 0) {
    return "No public resource hosts were available for related-domain preview. No rules were saved.";
  }

  if (candidateCount === 0) {
    if (ignoredCandidateCount > 0) {
      return `${hostCount} public resource host${hostCount === 1 ? "" : "s"} checked. Only ignored analytics, helper, or infrastructure hosts were found; no rules were saved.`;
    }

    return `${hostCount} public resource host${hostCount === 1 ? "" : "s"} checked. No related-domain candidates were found and no rules were saved.`;
  }

  return `${hostCount} public resource host${hostCount === 1 ? "" : "s"} checked for related-domain preview. No rules were saved.`;
}

function flattenInjectionResults(results: readonly ScriptInjectionResult[]): CurrentPageResourceHostCollectionResult {
  const hosts: string[] = [];
  let pageLooksLikeErrorOrProtection = false;

  for (const item of results) {
    if (isCurrentPageResourceHostCollectionResult(item.result)) {
      hosts.push(...item.result.hosts);
      pageLooksLikeErrorOrProtection ||= item.result.pageLooksLikeErrorOrProtection;
      continue;
    }

    if (!isStringArray(item.result)) {
      continue;
    }

    hosts.push(...item.result);
  }

  return {
    hosts,
    pageLooksLikeErrorOrProtection
  };
}

export function sanitizeResourceHostCandidate(input: string): string | null {
  const normalized = normalizeDomain(input);

  if (!normalized.ok) {
    return null;
  }

  if (isIpv4Address(normalized.domain)) {
    return null;
  }

  if (checkDenylistedHost(normalized.domain).denied) {
    return null;
  }

  return normalized.domain;
}

export function sanitizeResourceHostCandidates(
  inputs: readonly string[],
  maxHosts: number = currentPageResourceHostLimit
): string[] {
  const hosts = new Set<string>();

  for (const input of inputs) {
    if (hosts.size >= maxHosts) {
      break;
    }

    const host = sanitizeResourceHostCandidate(input);

    if (host) {
      hosts.add(host);
    }
  }

  return [...hosts].sort((left, right) => left.localeCompare(right));
}

export function buildCurrentPageResourceHostPreview(input: {
  url?: string;
  collectedHosts: readonly string[];
  pageLooksLikeErrorOrProtection?: boolean;
}): CurrentPageResourceHostsResponse {
  const target = getCurrentPageResourceHostTarget(input.url);

  if (!target.ok) {
    return target.response;
  }

  if (input.pageLooksLikeErrorOrProtection) {
    return response("collection_unavailable", errorOrProtectionPageMessage(), target.domain);
  }

  const collectedHosts = sanitizeResourceHostCandidates(input.collectedHosts);
  const candidates = buildRelatedDomainCandidates({
    currentDomain: target.domain,
    observedUrlsOrHosts: collectedHosts
  });
  const candidateCount = candidates.strongCandidates.length + candidates.mediumCandidates.length;
  const ignoredCandidateCount = candidates.ignoredCandidates.length;

  return response("success", resultMessage(collectedHosts.length, candidateCount, ignoredCandidateCount), target.domain, {
    collectedHosts,
    candidates
  });
}

export async function runCurrentPageResourceHostPreview(
  request: CurrentPageResourceHostsRequest,
  options: RunCurrentPageResourceHostPreviewOptions
): Promise<CurrentPageResourceHostsResponse> {
  const target = getCurrentPageResourceHostTarget(request.url);

  if (!target.ok) {
    return target.response;
  }

  if (!Number.isInteger(request.tabId) || request.tabId < 0) {
    return response("error", "Could not identify the active tab for related-domain preview.", target.domain);
  }

  try {
    const results = await options.executeScript(request.tabId);
    const collection = flattenInjectionResults(results);

    return buildCurrentPageResourceHostPreview({
      url: request.url,
      collectedHosts: collection.hosts,
      pageLooksLikeErrorOrProtection: collection.pageLooksLikeErrorOrProtection
    });
  } catch (error) {
    return response(
      "collection_unavailable",
      collectionUnavailableMessage(error),
      target.domain
    );
  }
}

export function isCurrentPageResourceHostsRequest(input: unknown): input is CurrentPageResourceHostsRequest {
  return (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    input.type === currentPageResourceHostsMessageType &&
    "tabId" in input &&
    typeof input.tabId === "number" &&
    (!("url" in input) || typeof input.url === "string")
  );
}

export function isCurrentPageResourceHostsResponse(input: unknown): input is CurrentPageResourceHostsResponse {
  if (typeof input !== "object" || input === null || !("status" in input) || !("message" in input)) {
    return false;
  }

  return (
    isSupportedStatus(input.status) &&
    typeof input.message === "string" &&
    (!("currentDomain" in input) || typeof input.currentDomain === "string") &&
    (!("collectedHosts" in input) || isStringArray(input.collectedHosts)) &&
    (!("candidates" in input) || (typeof input.candidates === "object" && input.candidates !== null))
  );
}

export function doesTextLookLikeErrorOrProtectionPage(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

  return normalized.includes("error 403 forbidden") || normalized.includes("varnish cache server");
}

export function collectCurrentPageResourceHostnamesFromDom(): CurrentPageResourceHostCollectionResult {
  const maxHosts = 80;
  const maxAttributeValueLength = 4096;
  const internalHostSuffixes = [".local", ".lan", ".localhost", ".internal", ".home", ".home.arpa"];
  const hosts = new Set<string>();

  const isBlockedHostname = (hostname: string): boolean => {
    if (hostname === "localhost" || !hostname.includes(".") || internalHostSuffixes.some((suffix) => hostname.endsWith(suffix))) {
      return true;
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) {
      return true;
    }

    return false;
  };

  const addUrlHostname = (value: string | null | undefined): void => {
    if (!value || hosts.size >= maxHosts) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > maxAttributeValueLength) {
      return;
    }

    try {
      const parsedUrl = new URL(boundedValue, document.baseURI);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return;
      }

      const hostname = parsedUrl.hostname.toLowerCase().replace(/\.+$/, "");

      if (hostname.length > 0 && !isBlockedHostname(hostname)) {
        hosts.add(hostname);
      }
    } catch {
      // Ignore individual resource values that cannot be parsed as URLs.
    }
  };

  const addSrcsetHostnames = (value: string | null | undefined): void => {
    if (!value || hosts.size >= maxHosts) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > maxAttributeValueLength) {
      return;
    }

    for (const candidate of boundedValue.split(",")) {
      if (hosts.size >= maxHosts) {
        return;
      }

      const urlCandidate = candidate.trim().split(/\s+/, 1)[0];

      addUrlHostname(urlCandidate);
    }
  };

  const addAttributeValues = (selector: string, attributeName: string): void => {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (hosts.size >= maxHosts) {
        return;
      }

      addUrlHostname(element.getAttribute(attributeName));
    }
  };

  const addSrcsetAttributeValues = (selector: string): void => {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (hosts.size >= maxHosts) {
        return;
      }

      addSrcsetHostnames(element.getAttribute("srcset"));
    }
  };

  try {
    for (const entry of performance.getEntriesByType("resource")) {
      if (hosts.size >= maxHosts) {
        break;
      }

      addUrlHostname(entry.name);
    }
  } catch {
    // Resource timing can be unavailable in some document contexts.
  }

  for (const image of Array.from(document.images)) {
    if (hosts.size >= maxHosts) {
      break;
    }

    addUrlHostname(image.currentSrc || image.src);
  }

  addAttributeValues("script[src]", "src");
  addAttributeValues('link[href][rel~="stylesheet"]', "href");
  addAttributeValues('link[href][rel~="preload"]', "href");
  addAttributeValues('link[href][rel~="modulepreload"]', "href");
  addAttributeValues('link[href][rel~="preconnect"]', "href");
  addAttributeValues('link[href][rel~="dns-prefetch"]', "href");
  addAttributeValues('link[href][rel~="prefetch"]', "href");
  addAttributeValues("iframe[src]", "src");
  addAttributeValues("audio[src]", "src");
  addAttributeValues("video[src]", "src");
  addAttributeValues("video[poster]", "poster");
  addAttributeValues("source[src]", "src");
  addSrcsetAttributeValues("[srcset]");
  addAttributeValues("[src]", "src");
  addAttributeValues("[href]", "href");

  const pageText = [document.title, document.body?.innerText ?? document.body?.textContent ?? ""].join("\n");

  return {
    hosts: [...hosts],
    pageLooksLikeErrorOrProtection: doesTextLookLikeErrorOrProtectionPage(pageText)
  };
}
