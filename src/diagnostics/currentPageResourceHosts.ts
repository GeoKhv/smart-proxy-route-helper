import { buildRelatedDomainCandidates, type RelatedDomainCandidatesResult } from "./relatedDomainCandidates";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainCandidateUserOverride } from "../domainClassification/domainClassificationTypes";

export const currentPageResourceHostsMessageType =
  "smart-proxy-route-helper:preview-current-page-related-domains" as const;

export const currentPageResourceHostLimit = 80;

export type CurrentPageResourceHostStatus = "success" | "unsupported_url" | "collection_unavailable" | "error";

export type CurrentPageResourceHostResultState =
  | "page_not_loaded"
  | "error_or_protection_page"
  | "no_resource_entries_collected"
  | "hosts_collected_but_all_internal_or_ignored"
  | "hosts_collected_but_no_related_candidates"
  | "candidates_available";

export type CurrentPageResourceHostPreviewSummary = {
  rawEntriesInspected: number;
  requestInitiationsInspected?: number;
  performanceEntriesInspected?: number;
  domAttributesInspected?: number;
  urlLikeValuesFound?: number;
  droppedPerformanceEntries?: number;
  bridgeEventsRejected?: number;
  hostsExtracted: number;
  hostsAfterSanitization: number;
  hostsIgnoredOrInternal: number;
  reviewableCandidates: number;
  ignoredCandidates: number;
  sampleHosts?: string[];
};

export type CurrentPageResourceHostsRequest = {
  type: typeof currentPageResourceHostsMessageType;
  tabId: number;
  url?: string;
};

export type CurrentPageResourceHostsResponse = {
  status: CurrentPageResourceHostStatus;
  message: string;
  currentDomain?: string;
  resultState?: CurrentPageResourceHostResultState;
  summary?: CurrentPageResourceHostPreviewSummary;
  collectedHosts?: string[];
  candidates?: RelatedDomainCandidatesResult;
  captureMode?: "snapshot" | "recording";
};

type CurrentPageResourceHostCollectionResult = {
  hosts: string[];
  pageLooksLikeErrorOrProtection: boolean;
  summary?: Pick<
    CurrentPageResourceHostPreviewSummary,
    | "rawEntriesInspected"
    | "requestInitiationsInspected"
    | "performanceEntriesInspected"
    | "domAttributesInspected"
    | "urlLikeValuesFound"
    | "droppedPerformanceEntries"
    | "bridgeEventsRejected"
    | "hostsExtracted"
  > & {
    hostsRejected: number;
  };
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
  userOverrides?: readonly DomainCandidateUserOverride[];
};

function response(
  status: CurrentPageResourceHostStatus,
  message: string,
  currentDomain?: string,
  extra?: Pick<CurrentPageResourceHostsResponse, "resultState" | "summary" | "collectedHosts" | "candidates">
): CurrentPageResourceHostsResponse {
  return {
    status,
    message,
    ...(currentDomain ? { currentDomain } : {}),
    ...(extra?.resultState ? { resultState: extra.resultState } : {}),
    ...(extra?.summary ? { summary: extra.summary } : {}),
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

function isSupportedResultState(state: unknown): state is CurrentPageResourceHostResultState {
  return (
    state === "page_not_loaded" ||
    state === "error_or_protection_page" ||
    state === "no_resource_entries_collected" ||
    state === "hosts_collected_but_all_internal_or_ignored" ||
    state === "hosts_collected_but_no_related_candidates" ||
    state === "candidates_available"
  );
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function isPreviewSummary(input: unknown): input is CurrentPageResourceHostPreviewSummary {
  return (
    typeof input === "object" &&
    input !== null &&
    "rawEntriesInspected" in input &&
    typeof input.rawEntriesInspected === "number" &&
    (!("performanceEntriesInspected" in input) || typeof input.performanceEntriesInspected === "number") &&
    (!("domAttributesInspected" in input) || typeof input.domAttributesInspected === "number") &&
    (!("urlLikeValuesFound" in input) || typeof input.urlLikeValuesFound === "number") &&
    "hostsExtracted" in input &&
    typeof input.hostsExtracted === "number" &&
    "hostsAfterSanitization" in input &&
    typeof input.hostsAfterSanitization === "number" &&
    "hostsIgnoredOrInternal" in input &&
    typeof input.hostsIgnoredOrInternal === "number" &&
    "reviewableCandidates" in input &&
    typeof input.reviewableCandidates === "number" &&
    "ignoredCandidates" in input &&
    typeof input.ignoredCandidates === "number" &&
    (!("sampleHosts" in input) || isStringArray(input.sampleHosts))
  );
}

function isCurrentPageResourceHostCollectionResult(input: unknown): input is CurrentPageResourceHostCollectionResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "hosts" in input &&
    isStringArray(input.hosts) &&
    "pageLooksLikeErrorOrProtection" in input &&
    typeof input.pageLooksLikeErrorOrProtection === "boolean" &&
    (!("summary" in input) ||
      (typeof input.summary === "object" &&
        input.summary !== null &&
        "rawEntriesInspected" in input.summary &&
        typeof input.summary.rawEntriesInspected === "number" &&
        (!("performanceEntriesInspected" in input.summary) ||
          typeof input.summary.performanceEntriesInspected === "number") &&
        (!("domAttributesInspected" in input.summary) || typeof input.summary.domAttributesInspected === "number") &&
        (!("urlLikeValuesFound" in input.summary) || typeof input.summary.urlLikeValuesFound === "number") &&
        "hostsExtracted" in input.summary &&
        typeof input.summary.hostsExtracted === "number" &&
        "hostsRejected" in input.summary &&
        typeof input.summary.hostsRejected === "number"))
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

function resultMessage(resultState: CurrentPageResourceHostResultState, summary: CurrentPageResourceHostPreviewSummary): string {
  if (resultState === "no_resource_entries_collected") {
    return "No page resource hosts were found. Try reloading the page, then preview again.";
  }

  if (resultState === "hosts_collected_but_all_internal_or_ignored") {
    return "Resource hosts were found, but they look like analytics/adtech/local or schema helper domains. No rules were saved.";
  }

  if (resultState === "hosts_collected_but_no_related_candidates") {
    return "Resource hosts were found, but no new related-domain candidates were identified. No rules were saved.";
  }

  return `${summary.hostsAfterSanitization} resource host${summary.hostsAfterSanitization === 1 ? "" : "s"} checked for related-domain preview. No rules were saved.`;
}

function flattenInjectionResults(results: readonly ScriptInjectionResult[]): CurrentPageResourceHostCollectionResult {
  const hosts: string[] = [];
  let pageLooksLikeErrorOrProtection = false;
  let rawEntriesInspected = 0;
  let performanceEntriesInspected = 0;
  let domAttributesInspected = 0;
  let urlLikeValuesFound = 0;
  let hostsExtracted = 0;
  let hostsRejected = 0;
  let hasCollectorSummary = false;

  for (const item of results) {
    if (isCurrentPageResourceHostCollectionResult(item.result)) {
      hosts.push(...item.result.hosts);
      pageLooksLikeErrorOrProtection ||= item.result.pageLooksLikeErrorOrProtection;
      if (item.result.summary) {
        hasCollectorSummary = true;
        rawEntriesInspected += item.result.summary.rawEntriesInspected;
        performanceEntriesInspected += item.result.summary.performanceEntriesInspected ?? 0;
        domAttributesInspected += item.result.summary.domAttributesInspected ?? 0;
        urlLikeValuesFound += item.result.summary.urlLikeValuesFound ?? 0;
        hostsExtracted += item.result.summary.hostsExtracted;
        hostsRejected += item.result.summary.hostsRejected;
      }
      continue;
    }

    if (!isStringArray(item.result)) {
      continue;
    }

    hosts.push(...item.result);
  }

  return {
    hosts,
    pageLooksLikeErrorOrProtection,
    ...(hasCollectorSummary
      ? {
          summary: {
            rawEntriesInspected,
            performanceEntriesInspected,
            domAttributesInspected,
            urlLikeValuesFound,
            hostsExtracted,
            hostsRejected
          }
        }
      : {})
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
  return sanitizeResourceHostCandidatesWithSummary(inputs, maxHosts).hosts;
}

function sanitizeResourceHostCandidatesWithSummary(
  inputs: readonly string[],
  maxHosts: number = currentPageResourceHostLimit
): {
  hosts: string[];
  acceptedHostCount: number;
  rejectedHostCount: number;
} {
  const hosts = new Set<string>();
  let acceptedHostCount = 0;
  let rejectedHostCount = 0;

  for (const input of inputs) {
    if (hosts.size >= maxHosts) {
      break;
    }

    const host = sanitizeResourceHostCandidate(input);

    if (host) {
      acceptedHostCount += 1;
      hosts.add(host);
    } else {
      rejectedHostCount += 1;
    }
  }

  return {
    hosts: [...hosts].sort((left, right) => left.localeCompare(right)),
    acceptedHostCount,
    rejectedHostCount
  };
}

export function buildCurrentPageResourceHostPreview(input: {
  url?: string;
  collectedHosts: readonly string[];
  pageLooksLikeErrorOrProtection?: boolean;
  collectionSummary?: CurrentPageResourceHostCollectionResult["summary"];
  userOverrides?: readonly DomainCandidateUserOverride[];
}): CurrentPageResourceHostsResponse {
  const target = getCurrentPageResourceHostTarget(input.url);

  if (!target.ok) {
    return target.response;
  }

  if (input.pageLooksLikeErrorOrProtection) {
    return response("collection_unavailable", errorOrProtectionPageMessage(), target.domain, {
      resultState: "error_or_protection_page"
    });
  }

  const sanitized = sanitizeResourceHostCandidatesWithSummary(input.collectedHosts);
  const collectedHosts = sanitized.hosts;
  const candidates = buildRelatedDomainCandidates({
    currentDomain: target.domain,
    observedUrlsOrHosts: collectedHosts,
    userOverrides: input.userOverrides
  });
  const reviewableCandidates = candidates.strongCandidates.length + candidates.mediumCandidates.length;
  const ignoredCandidates = candidates.ignoredCandidates.length;
  const rawEntriesInspected = input.collectionSummary?.rawEntriesInspected ?? input.collectedHosts.length;
  const performanceEntriesInspected = input.collectionSummary?.performanceEntriesInspected;
  const requestInitiationsInspected = input.collectionSummary?.requestInitiationsInspected;
  const domAttributesInspected = input.collectionSummary?.domAttributesInspected;
  const urlLikeValuesFound = input.collectionSummary?.urlLikeValuesFound ?? input.collectedHosts.length;
  const droppedPerformanceEntries = input.collectionSummary?.droppedPerformanceEntries;
  const bridgeEventsRejected = input.collectionSummary?.bridgeEventsRejected;
  const hostsExtracted = input.collectionSummary?.hostsExtracted ?? sanitized.acceptedHostCount;
  const hostsIgnoredOrInternal = (input.collectionSummary?.hostsRejected ?? 0) + sanitized.rejectedHostCount;
  const summary: CurrentPageResourceHostPreviewSummary = {
    rawEntriesInspected,
    ...(requestInitiationsInspected !== undefined ? { requestInitiationsInspected } : {}),
    ...(performanceEntriesInspected !== undefined ? { performanceEntriesInspected } : {}),
    ...(domAttributesInspected !== undefined ? { domAttributesInspected } : {}),
    urlLikeValuesFound,
    ...(droppedPerformanceEntries !== undefined ? { droppedPerformanceEntries } : {}),
    ...(bridgeEventsRejected !== undefined ? { bridgeEventsRejected } : {}),
    hostsExtracted,
    hostsAfterSanitization: collectedHosts.length,
    hostsIgnoredOrInternal,
    reviewableCandidates,
    ignoredCandidates,
    sampleHosts: collectedHosts.slice(0, 5)
  };
  const resultState: CurrentPageResourceHostResultState =
    rawEntriesInspected === 0 || urlLikeValuesFound === 0
      ? "no_resource_entries_collected"
      : hostsExtracted === 0 || collectedHosts.length === 0 || (reviewableCandidates === 0 && ignoredCandidates > 0)
        ? "hosts_collected_but_all_internal_or_ignored"
        : reviewableCandidates === 0
          ? "hosts_collected_but_no_related_candidates"
          : "candidates_available";

  return response("success", resultMessage(resultState, summary), target.domain, {
    resultState,
    summary,
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
      pageLooksLikeErrorOrProtection: collection.pageLooksLikeErrorOrProtection,
      collectionSummary: collection.summary,
      userOverrides: options.userOverrides
    });
  } catch (error) {
    return response(
      "collection_unavailable",
      collectionUnavailableMessage(error),
      target.domain,
      {
        resultState: "page_not_loaded"
      }
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
    (!("resultState" in input) || isSupportedResultState(input.resultState)) &&
    (!("summary" in input) || isPreviewSummary(input.summary)) &&
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
  const maxGenericAttributeValueLength = 1024;
  const maxUrlLikeValues = 500;
  const maxStyleUrlMatches = 80;
  const maxDomElementsScanned = 700;
  const maxGenericElementsScanned = 500;
  const maxDomAttributesScanned = 1400;
  const maxComputedStyleElements = 80;
  const maxShadowRoots = 12;
  const internalHostSuffixes = [".local", ".lan", ".localhost", ".internal", ".home", ".home.arpa"];
  const resourceAttributeNames = new Set([
    "src",
    "href",
    "poster",
    "data-src",
    "data-delayed-url",
    "data-ghost-url",
    "data-media-url",
    "data-li-src"
  ]);
  const srcsetAttributeNames = new Set(["srcset", "data-srcset"]);
  const styleUrlAttributeNames = new Set(["style", "data-background-image"]);
  const computedStyleProperties = ["backgroundImage", "listStyleImage"] as const;
  const roots: ParentNode[] = [document];
  const hosts = new Set<string>();
  const inspectedPerformanceEntryNames = new Set<string>();
  let performanceEntriesInspected = 0;
  let domAttributesInspected = 0;
  let urlLikeValuesFound = 0;
  let hostsRejected = 0;
  let styleUrlMatches = 0;
  let genericElementsScanned = 0;
  let domAttributesScanned = 0;

  const isBlockedHostname = (hostname: string): boolean => {
    if (hostname === "localhost" || !hostname.includes(".") || internalHostSuffixes.some((suffix) => hostname.endsWith(suffix))) {
      return true;
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) {
      return true;
    }

    return false;
  };

  const looksLikeHttpUrl = (value: string): boolean => /^(?:https?:)?\/\//i.test(value.trim());

  const canInspectMoreUrlValues = (): boolean => hosts.size < maxHosts && urlLikeValuesFound < maxUrlLikeValues;

  const addUrlHostname = (
    value: string | null | undefined,
    options: {
      allowRelative: boolean;
      requireHttpLike?: boolean;
    }
  ): void => {
    if (!value || !canInspectMoreUrlValues()) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > maxAttributeValueLength) {
      hostsRejected += 1;
      return;
    }

    if (options.requireHttpLike && !looksLikeHttpUrl(boundedValue)) {
      return;
    }

    urlLikeValuesFound += 1;

    try {
      const parsedUrl =
        options.allowRelative || boundedValue.startsWith("//")
          ? new URL(boundedValue, document.baseURI)
          : new URL(boundedValue);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        hostsRejected += 1;
        return;
      }

      const hostname = parsedUrl.hostname.toLowerCase().replace(/\.+$/, "");

      if (hostname.length > 0 && !isBlockedHostname(hostname)) {
        hosts.add(hostname);
      } else {
        hostsRejected += 1;
      }
    } catch {
      hostsRejected += 1;
    }
  };

  const addDomUrlHostname = (
    value: string | null | undefined,
    options: {
      allowRelative?: boolean;
      requireHttpLike?: boolean;
    } = {}
  ): void => {
    domAttributesInspected += 1;
    addUrlHostname(value, {
      allowRelative: options.allowRelative ?? true,
      requireHttpLike: options.requireHttpLike
    });
  };

  const addSrcsetHostnames = (value: string | null | undefined): void => {
    if (!value || !canInspectMoreUrlValues()) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > maxAttributeValueLength) {
      return;
    }

    for (const candidate of boundedValue.split(",")) {
      if (!canInspectMoreUrlValues()) {
        return;
      }

      const urlCandidate = candidate.trim().split(/\s+/, 1)[0];

      addUrlHostname(urlCandidate, { allowRelative: true });
    }
  };

  const addDomSrcsetHostnames = (value: string | null | undefined): void => {
    domAttributesInspected += 1;
    addSrcsetHostnames(value);
  };

  const queryElements = (root: ParentNode, selector: string): Element[] => {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  };

  const discoverOpenShadowRoots = (): void => {
    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      for (const element of queryElements(roots[rootIndex], "*")) {
        if (genericElementsScanned >= maxDomElementsScanned || roots.length > maxShadowRoots) {
          return;
        }

        genericElementsScanned += 1;
        const shadowRoot = (element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;

        if (shadowRoot && !roots.includes(shadowRoot)) {
          roots.push(shadowRoot);
        }
      }
    }
  };

  const forEachRootElement = (selector: string, callback: (element: Element) => void): void => {
    for (const root of roots) {
      for (const element of queryElements(root, selector)) {
        if (hosts.size >= maxHosts) {
          return;
        }

        callback(element);
      }
    }
  };

  const addAttributeValues = (selector: string, attributeName: string): void => {
    forEachRootElement(selector, (element) => {
      addDomUrlHostname(element.getAttribute(attributeName));
    });
  };

  const addSrcsetAttributeValues = (selector: string, attributeName = "srcset"): void => {
    forEachRootElement(selector, (element) => {
      addDomSrcsetHostnames(element.getAttribute(attributeName));
    });
  };

  const addStyleUrlValues = (value: string | null | undefined): void => {
    if (!value || !canInspectMoreUrlValues() || styleUrlMatches >= maxStyleUrlMatches) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > maxAttributeValueLength) {
      return;
    }

    const urlPattern = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(boundedValue)) !== null) {
      if (!canInspectMoreUrlValues() || styleUrlMatches >= maxStyleUrlMatches) {
        return;
      }

      styleUrlMatches += 1;
      addUrlHostname(match[1], {
        allowRelative: true,
        requireHttpLike: false
      });
    }
  };

  const addInlineStyleUrlValues = (): void => {
    forEachRootElement("[style]", (element) => {
      domAttributesInspected += 1;
      addStyleUrlValues(element.getAttribute("style"));
    });
  };

  const addStyleAttributeUrlValues = (selector: string, attributeName: string): void => {
    forEachRootElement(selector, (element) => {
      const value = element.getAttribute(attributeName);

      domAttributesInspected += 1;

      if (value && /url\(/i.test(value)) {
        addStyleUrlValues(value);
      } else {
        addUrlHostname(value, { allowRelative: true });
      }
    });
  };

  const addComputedStyleUrlValues = (): void => {
    if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
      return;
    }

    let computedStyleElements = 0;

    for (const root of roots) {
      for (const element of queryElements(root, "*")) {
        if (hosts.size >= maxHosts || computedStyleElements >= maxComputedStyleElements) {
          return;
        }

        computedStyleElements += 1;

        try {
          const style = window.getComputedStyle(element);

          for (const property of computedStyleProperties) {
            addStyleUrlValues(style[property]);
          }
        } catch {
          // Some browser-internal elements can reject computed style reads.
        }
      }
    }
  };

  const addGenericAttributeValues = (): void => {
    let genericElements = 0;

    for (const root of roots) {
      for (const element of queryElements(root, "*")) {
        if (hosts.size >= maxHosts || genericElements >= maxGenericElementsScanned) {
          return;
        }

        genericElements += 1;

        const attributes = "attributes" in element ? Array.from(element.attributes) : [];

        for (const attribute of attributes) {
          if (domAttributesScanned >= maxDomAttributesScanned || !canInspectMoreUrlValues()) {
            return;
          }

          domAttributesScanned += 1;
          domAttributesInspected += 1;

          const attributeName = attribute.name.toLowerCase();
          const value = attribute.value;

          if (!value || value.trim().length === 0 || value.length > maxGenericAttributeValueLength) {
            continue;
          }

          if (srcsetAttributeNames.has(attributeName)) {
            addSrcsetHostnames(value);
            continue;
          }

          if (styleUrlAttributeNames.has(attributeName)) {
            addStyleUrlValues(value);
            continue;
          }

          if (resourceAttributeNames.has(attributeName)) {
            addUrlHostname(value, { allowRelative: true });
            continue;
          }

          if (looksLikeHttpUrl(value)) {
            addUrlHostname(value, {
              allowRelative: false,
              requireHttpLike: true
            });
          }
        }
      }
    }
  };

  const addImageValues = (image: Element & Partial<HTMLImageElement>): void => {
    addDomUrlHostname(image.currentSrc);
    addDomUrlHostname(image.src);
    addDomSrcsetHostnames(image.srcset);
  };

  const addPerformanceEntryName = (name: string | undefined): void => {
    if (!name || inspectedPerformanceEntryNames.has(name) || !canInspectMoreUrlValues()) {
      return;
    }

    inspectedPerformanceEntryNames.add(name);
    performanceEntriesInspected += 1;
    addUrlHostname(name, {
      allowRelative: false,
      requireHttpLike: true
    });
  };

  const addPerformanceEntries = (): void => {
    try {
      if (typeof performance !== "undefined" && typeof performance.getEntries === "function") {
        for (const entry of performance.getEntries()) {
          addPerformanceEntryName(entry.name);

          if (!canInspectMoreUrlValues()) {
            return;
          }
        }
      }
    } catch {
      // Resource timing can be unavailable in some document contexts.
    }

    try {
      if (typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
        for (const entryType of ["resource", "navigation"]) {
          for (const entry of performance.getEntriesByType(entryType)) {
            addPerformanceEntryName(entry.name);

            if (!canInspectMoreUrlValues()) {
              return;
            }
          }
        }
      }
    } catch {
      // Resource timing can be unavailable in some document contexts.
    }
  };

  const doesTitleLookLikeErrorOrProtectionPage = (text: string): boolean => {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

    return normalized.includes("error 403 forbidden") || normalized.includes("varnish cache server");
  };

  discoverOpenShadowRoots();
  addPerformanceEntries();

  for (const image of Array.from(document.images ?? [])) {
    if (hosts.size >= maxHosts) {
      break;
    }

    addImageValues(image);
  }

  forEachRootElement("img", (element) => {
    addImageValues(element as Element & Partial<HTMLImageElement>);
  });

  addAttributeValues("script[src]", "src");
  addAttributeValues('link[href][rel~="stylesheet"]', "href");
  addAttributeValues('link[href][rel~="preload"]', "href");
  addAttributeValues('link[href][rel~="modulepreload"]', "href");
  addAttributeValues('link[href][rel~="preconnect"]', "href");
  addAttributeValues('link[href][rel~="dns-prefetch"]', "href");
  addAttributeValues('link[href][rel~="prefetch"]', "href");
  addAttributeValues('link[href][rel~="icon"]', "href");
  addAttributeValues('link[href][rel~="apple-touch-icon"]', "href");
  addAttributeValues('link[href][rel~="apple-touch-startup-image"]', "href");
  addAttributeValues("iframe[src]", "src");
  addAttributeValues("audio[src]", "src");
  addAttributeValues("video[src]", "src");
  addAttributeValues("video[poster]", "poster");
  addAttributeValues("source[src]", "src");
  addSrcsetAttributeValues("source[srcset]");
  addAttributeValues("object[data]", "data");
  addAttributeValues("embed[src]", "src");
  addAttributeValues("track[src]", "src");
  addAttributeValues("[data-src]", "data-src");
  addSrcsetAttributeValues("[data-srcset]", "data-srcset");
  addAttributeValues("[data-delayed-url]", "data-delayed-url");
  addAttributeValues("[data-ghost-url]", "data-ghost-url");
  addAttributeValues("[data-media-url]", "data-media-url");
  addStyleAttributeUrlValues("[data-background-image]", "data-background-image");
  addAttributeValues("[data-li-src]", "data-li-src");
  addSrcsetAttributeValues("[srcset]");
  addInlineStyleUrlValues();
  addComputedStyleUrlValues();
  addAttributeValues("[src]", "src");
  addAttributeValues("[href]", "href");
  addGenericAttributeValues();

  return {
    hosts: [...hosts],
    pageLooksLikeErrorOrProtection: doesTitleLookLikeErrorOrProtectionPage(document.title),
    summary: {
      rawEntriesInspected: performanceEntriesInspected + domAttributesInspected,
      performanceEntriesInspected,
      domAttributesInspected,
      urlLikeValuesFound,
      hostsExtracted: hosts.size,
      hostsRejected
    }
  };
}
