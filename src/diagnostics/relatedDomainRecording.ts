import {
  buildCurrentPageResourceHostPreview,
  type CurrentPageResourceHostsResponse
} from "./currentPageResourceHosts";
import type { DomainCandidateUserOverride } from "../domainClassification/domainClassificationTypes";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";

export const relatedDomainRecordingMessageType =
  "smart-proxy-route-helper:record-related-domains" as const;

export const relatedDomainRecordingMaxDurationMs = 120_000;
export const relatedDomainRecordingMaxHosts = 80;

export type RelatedDomainRecordingAction = "get-state" | "start" | "stop" | "cancel";

export type RelatedDomainRecordingRequest = {
  type: typeof relatedDomainRecordingMessageType;
  action: RelatedDomainRecordingAction;
  tabId?: number;
  url?: string;
};

export type RelatedDomainRecordingSessionMetadata = {
  tabId: number;
  currentDomain: string;
  startedAt: number;
  expiresAt: number;
  maxDurationMs: number;
  status: "recording" | "expired";
};

export type RelatedDomainRecordingSessionState =
  | {
      status: "idle";
    }
  | RelatedDomainRecordingSessionMetadata;

export type RelatedDomainRecordingStatus =
  | "success"
  | "unsupported_url"
  | "active_in_other_tab"
  | "not_found"
  | "collection_unavailable"
  | "expired"
  | "error";

export type RelatedDomainRecordingResponse = {
  status: RelatedDomainRecordingStatus;
  message: string;
  state: RelatedDomainRecordingSessionState;
  currentDomain?: string;
  preview?: CurrentPageResourceHostsResponse;
};

export type RelatedDomainRecorderPageAction = "start" | "stop" | "cancel";

export type RelatedDomainRecorderPageResult = {
  status: "started" | "already_recording" | "stopped" | "expired" | "cancelled" | "not_found" | "error";
  hosts: string[];
  pageLooksLikeErrorOrProtection: boolean;
  summary: {
    rawEntriesInspected: number;
    performanceEntriesInspected: number;
    domAttributesInspected: number;
    urlLikeValuesFound: number;
    hostsExtracted: number;
    hostsRejected: number;
  };
  message?: string;
};

export type RelatedDomainRecorderPageOptions = {
  maxDurationMs?: number;
  maxHosts?: number;
  maxUrlLikeValues?: number;
  maxDomAttributesInspected?: number;
};

type RecordingTarget =
  | {
      ok: true;
      domain: string;
    }
  | {
      ok: false;
      response: RelatedDomainRecordingResponse;
    };

function idleState(): RelatedDomainRecordingSessionState {
  return {
    status: "idle"
  };
}

export function buildRelatedDomainRecordingResponse(
  status: RelatedDomainRecordingStatus,
  message: string,
  state: RelatedDomainRecordingSessionState = idleState(),
  extra: Pick<RelatedDomainRecordingResponse, "currentDomain" | "preview"> = {}
): RelatedDomainRecordingResponse {
  return {
    status,
    message,
    state,
    ...(extra.currentDomain ? { currentDomain: extra.currentDomain } : {}),
    ...(extra.preview ? { preview: extra.preview } : {})
  };
}

function unsupportedUrlMessage(url: string): string {
  try {
    const protocol = new URL(url).protocol.replace(/:$/, "");
    const protocolLabel = protocol ? `${protocol}://` : "This page";

    return `${protocolLabel} pages cannot be used for diagnostic recording. Open an http or https site first.`;
  } catch {
    return "Open a valid http or https site before starting diagnostic recording.";
  }
}

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": "Internal browser pages cannot be used for diagnostic recording.",
    localhost: "Localhost cannot be used for diagnostic recording.",
    "loopback-ip": "Loopback addresses cannot be used for diagnostic recording.",
    "private-ip": "Private network addresses cannot be used for diagnostic recording.",
    "internal-suffix": "Internal local domains cannot be used for diagnostic recording.",
    "single-label-host": "Open a public domain with a dot before starting diagnostic recording.",
    "invalid-host": "Open a valid http or https site before starting diagnostic recording."
  };

  return messages[reason] ?? "This site cannot be used for diagnostic recording.";
}

export function getRelatedDomainRecordingTarget(url: string | undefined): RecordingTarget {
  if (!url) {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        "Open a supported site before starting diagnostic recording."
      )
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        "Open a valid http or https site before starting diagnostic recording."
      )
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse("unsupported_url", unsupportedUrlMessage(url))
    };
  }

  const normalized = normalizeDomain(url);

  if (!normalized.ok) {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse("unsupported_url", normalized.error.message)
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        denylistMessage(denylist.reason),
        idleState(),
        {
          currentDomain: normalized.domain
        }
      )
    };
  }

  return {
    ok: true,
    domain: normalized.domain
  };
}

function isSupportedAction(action: unknown): action is RelatedDomainRecordingAction {
  return action === "get-state" || action === "start" || action === "stop" || action === "cancel";
}

function isSupportedStatus(status: unknown): status is RelatedDomainRecordingStatus {
  return (
    status === "success" ||
    status === "unsupported_url" ||
    status === "active_in_other_tab" ||
    status === "not_found" ||
    status === "collection_unavailable" ||
    status === "expired" ||
    status === "error"
  );
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function isRecorderSummary(input: unknown): input is RelatedDomainRecorderPageResult["summary"] {
  return (
    typeof input === "object" &&
    input !== null &&
    "rawEntriesInspected" in input &&
    typeof input.rawEntriesInspected === "number" &&
    "performanceEntriesInspected" in input &&
    typeof input.performanceEntriesInspected === "number" &&
    "domAttributesInspected" in input &&
    typeof input.domAttributesInspected === "number" &&
    "urlLikeValuesFound" in input &&
    typeof input.urlLikeValuesFound === "number" &&
    "hostsExtracted" in input &&
    typeof input.hostsExtracted === "number" &&
    "hostsRejected" in input &&
    typeof input.hostsRejected === "number"
  );
}

export function isRelatedDomainRecorderPageResult(input: unknown): input is RelatedDomainRecorderPageResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "status" in input &&
    (input.status === "started" ||
      input.status === "already_recording" ||
      input.status === "stopped" ||
      input.status === "expired" ||
      input.status === "cancelled" ||
      input.status === "not_found" ||
      input.status === "error") &&
    "hosts" in input &&
    isStringArray(input.hosts) &&
    "pageLooksLikeErrorOrProtection" in input &&
    typeof input.pageLooksLikeErrorOrProtection === "boolean" &&
    "summary" in input &&
    isRecorderSummary(input.summary) &&
    (!("message" in input) || typeof input.message === "string")
  );
}

export function isRelatedDomainRecordingSessionMetadata(
  input: unknown
): input is RelatedDomainRecordingSessionMetadata {
  return (
    typeof input === "object" &&
    input !== null &&
    "tabId" in input &&
    Number.isInteger(input.tabId) &&
    "currentDomain" in input &&
    typeof input.currentDomain === "string" &&
    "startedAt" in input &&
    typeof input.startedAt === "number" &&
    "expiresAt" in input &&
    typeof input.expiresAt === "number" &&
    "maxDurationMs" in input &&
    typeof input.maxDurationMs === "number" &&
    "status" in input &&
    (input.status === "recording" || input.status === "expired")
  );
}

export function relatedDomainRecordingSessionState(
  metadata: RelatedDomainRecordingSessionMetadata | null,
  now: number = Date.now()
): RelatedDomainRecordingSessionState {
  if (!metadata) {
    return idleState();
  }

  if (metadata.status === "expired" || metadata.expiresAt <= now) {
    return {
      ...metadata,
      status: "expired"
    };
  }

  return {
    ...metadata,
    status: "recording"
  };
}

export function isRelatedDomainRecordingRequest(input: unknown): input is RelatedDomainRecordingRequest {
  return (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    input.type === relatedDomainRecordingMessageType &&
    "action" in input &&
    isSupportedAction(input.action) &&
    (!("tabId" in input) || typeof input.tabId === "number") &&
    (!("url" in input) || typeof input.url === "string")
  );
}

export function isRelatedDomainRecordingResponse(input: unknown): input is RelatedDomainRecordingResponse {
  if (typeof input !== "object" || input === null || !("state" in input)) {
    return false;
  }

  const state = input.state;

  return (
    "status" in input &&
    isSupportedStatus(input.status) &&
    "message" in input &&
    typeof input.message === "string" &&
    ((typeof state === "object" && state !== null && "status" in state && state.status === "idle") ||
      isRelatedDomainRecordingSessionMetadata(state)) &&
    (!("currentDomain" in input) || typeof input.currentDomain === "string") &&
    (!("preview" in input) || (typeof input.preview === "object" && input.preview !== null))
  );
}

export function buildRelatedDomainRecordingPreview(input: {
  currentDomain: string;
  recordedHosts: readonly string[];
  pageLooksLikeErrorOrProtection?: boolean;
  collectionSummary?: RelatedDomainRecorderPageResult["summary"];
  userOverrides?: readonly DomainCandidateUserOverride[];
}): CurrentPageResourceHostsResponse {
  return buildCurrentPageResourceHostPreview({
    url: `https://${input.currentDomain}/`,
    collectedHosts: input.recordedHosts,
    pageLooksLikeErrorOrProtection: input.pageLooksLikeErrorOrProtection,
    collectionSummary: input.collectionSummary,
    userOverrides: input.userOverrides
  });
}

export function runRelatedDomainRecorderInPage(
  action: RelatedDomainRecorderPageAction,
  options: RelatedDomainRecorderPageOptions = {}
): RelatedDomainRecorderPageResult {
  type RecorderSummary = RelatedDomainRecorderPageResult["summary"];
  type RecorderState = {
    status: "recording" | "expired";
    hosts: Set<string>;
    performanceEntryNames: Set<string>;
    startedAt: number;
    expiresAt: number;
    maxHosts: number;
    maxUrlLikeValues: number;
    maxDomAttributesInspected: number;
    maxAttributeValueLength: number;
    maxGenericAttributeValueLength: number;
    maxMutationNodesScanned: number;
    maxStyleUrlMatches: number;
    styleUrlMatches: number;
    mutationNodesScanned: number;
    summary: RecorderSummary;
    mutationObserver?: MutationObserver;
    performanceObserver?: PerformanceObserver;
    timerId?: ReturnType<typeof setTimeout>;
    pageLooksLikeErrorOrProtection: boolean;
  };

  type RecorderGlobal = typeof globalThis & {
    __smartProxyRouteHelperRelatedDomainRecorder?: RecorderState;
  };

  const recorderGlobal = globalThis as RecorderGlobal;
  const now = Date.now();

  const emptySummary = (): RecorderSummary => ({
    rawEntriesInspected: 0,
    performanceEntriesInspected: 0,
    domAttributesInspected: 0,
    urlLikeValuesFound: 0,
    hostsExtracted: 0,
    hostsRejected: 0
  });

  const emptyResult = (status: RelatedDomainRecorderPageResult["status"], message?: string): RelatedDomainRecorderPageResult => ({
    status,
    hosts: [],
    pageLooksLikeErrorOrProtection: false,
    summary: emptySummary(),
    ...(message ? { message } : {})
  });

  const snapshot = (status: RelatedDomainRecorderPageResult["status"], state: RecorderState): RelatedDomainRecorderPageResult => {
    state.summary.hostsExtracted = state.hosts.size;

    return {
      status,
      hosts: [...state.hosts].sort((left, right) => left.localeCompare(right)),
      pageLooksLikeErrorOrProtection: state.pageLooksLikeErrorOrProtection,
      summary: {
        ...state.summary,
        rawEntriesInspected: state.summary.performanceEntriesInspected + state.summary.domAttributesInspected,
        hostsExtracted: state.hosts.size
      }
    };
  };

  const disconnect = (state: RecorderState): void => {
    try {
      state.mutationObserver?.disconnect();
    } catch {
      // Observer cleanup is best-effort in page contexts.
    }

    try {
      state.performanceObserver?.disconnect();
    } catch {
      // Observer cleanup is best-effort in page contexts.
    }

    if (state.timerId !== undefined) {
      clearTimeout(state.timerId);
      state.timerId = undefined;
    }
  };

  const expire = (state: RecorderState): void => {
    if (state.status !== "recording") {
      return;
    }

    state.status = "expired";
    disconnect(state);
  };

  const existing = recorderGlobal.__smartProxyRouteHelperRelatedDomainRecorder;

  if (action === "cancel") {
    if (!existing) {
      return emptyResult("not_found", "No diagnostic recording was found in this page.");
    }

    disconnect(existing);
    delete recorderGlobal.__smartProxyRouteHelperRelatedDomainRecorder;
    return emptyResult("cancelled");
  }

  if (action === "stop") {
    if (!existing) {
      return emptyResult("not_found", "No diagnostic recording was found in this page. The page may have reloaded.");
    }

    if (existing.expiresAt <= now) {
      expire(existing);
    }

    const result = snapshot(existing.status === "expired" ? "expired" : "stopped", existing);

    disconnect(existing);
    delete recorderGlobal.__smartProxyRouteHelperRelatedDomainRecorder;
    return result;
  }

  if (action !== "start") {
    return emptyResult("error", "Unsupported diagnostic recording action.");
  }

  if (existing && existing.status === "recording" && existing.expiresAt > now) {
    return snapshot("already_recording", existing);
  }

  if (existing) {
    disconnect(existing);
    delete recorderGlobal.__smartProxyRouteHelperRelatedDomainRecorder;
  }

  const maxDurationMs = Math.max(5_000, Math.min(options.maxDurationMs ?? 120_000, 120_000));
  const maxHosts = Math.max(1, Math.min(options.maxHosts ?? 80, 80));
  const maxUrlLikeValues = Math.max(1, Math.min(options.maxUrlLikeValues ?? 500, 500));
  const maxDomAttributesInspected = Math.max(
    1,
    Math.min(options.maxDomAttributesInspected ?? 1_400, 1_400)
  );
  const state: RecorderState = {
    status: "recording",
    hosts: new Set<string>(),
    performanceEntryNames: new Set<string>(),
    startedAt: now,
    expiresAt: now + maxDurationMs,
    maxHosts,
    maxUrlLikeValues,
    maxDomAttributesInspected,
    maxAttributeValueLength: 4_096,
    maxGenericAttributeValueLength: 1_024,
    maxMutationNodesScanned: 700,
    maxStyleUrlMatches: 80,
    styleUrlMatches: 0,
    mutationNodesScanned: 0,
    summary: emptySummary(),
    pageLooksLikeErrorOrProtection: false
  };
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
  const observedAttributeNames = [
    ...resourceAttributeNames,
    ...srcsetAttributeNames,
    ...styleUrlAttributeNames
  ];
  const selectors = [
    "img",
    "script[src]",
    'link[href][rel~="stylesheet"]',
    'link[href][rel~="preload"]',
    'link[href][rel~="modulepreload"]',
    'link[href][rel~="preconnect"]',
    'link[href][rel~="dns-prefetch"]',
    'link[href][rel~="prefetch"]',
    'link[href][rel~="icon"]',
    'link[href][rel~="apple-touch-icon"]',
    'link[href][rel~="apple-touch-startup-image"]',
    "iframe[src]",
    "audio[src]",
    "video[src]",
    "video[poster]",
    "source[src]",
    "source[srcset]",
    "object[data]",
    "embed[src]",
    "track[src]",
    "[src]",
    "[href]",
    "[srcset]",
    "[data-src]",
    "[data-srcset]",
    "[data-delayed-url]",
    "[data-ghost-url]",
    "[data-media-url]",
    "[data-background-image]",
    "[data-li-src]",
    "[style]"
  ];

  const canInspectMore = (): boolean =>
    state.hosts.size < state.maxHosts && state.summary.urlLikeValuesFound < state.maxUrlLikeValues;

  const isBlockedHostname = (hostname: string): boolean => {
    if (
      hostname === "localhost" ||
      !hostname.includes(".") ||
      internalHostSuffixes.some((suffix) => hostname.endsWith(suffix))
    ) {
      return true;
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) {
      return true;
    }

    return false;
  };

  const looksLikeHttpUrl = (value: string): boolean => /^(?:https?:)?\/\//i.test(value.trim());

  const addUrlHostname = (
    value: string | null | undefined,
    urlOptions: {
      allowRelative: boolean;
      requireHttpLike?: boolean;
    }
  ): void => {
    if (!value || !canInspectMore()) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > state.maxAttributeValueLength) {
      state.summary.hostsRejected += 1;
      return;
    }

    if (urlOptions.requireHttpLike && !looksLikeHttpUrl(boundedValue)) {
      return;
    }

    state.summary.urlLikeValuesFound += 1;

    try {
      const parsedUrl =
        urlOptions.allowRelative || boundedValue.startsWith("//")
          ? new URL(boundedValue, document.baseURI)
          : new URL(boundedValue);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        state.summary.hostsRejected += 1;
        return;
      }

      const hostname = parsedUrl.hostname.toLowerCase().replace(/\.+$/, "");

      if (hostname.length > 0 && !isBlockedHostname(hostname)) {
        state.hosts.add(hostname);
      } else {
        state.summary.hostsRejected += 1;
      }
    } catch {
      state.summary.hostsRejected += 1;
    }
  };

  const addSrcsetHostnames = (value: string | null | undefined): void => {
    if (!value || !canInspectMore()) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > state.maxAttributeValueLength) {
      state.summary.hostsRejected += 1;
      return;
    }

    for (const candidate of boundedValue.split(",")) {
      if (!canInspectMore()) {
        return;
      }

      const urlCandidate = candidate.trim().split(/\s+/, 1)[0];

      addUrlHostname(urlCandidate, { allowRelative: true });
    }
  };

  const addStyleUrlValues = (value: string | null | undefined): void => {
    if (!value || !canInspectMore() || state.styleUrlMatches >= state.maxStyleUrlMatches) {
      return;
    }

    const boundedValue = value.trim();

    if (boundedValue.length === 0 || boundedValue.length > state.maxAttributeValueLength) {
      state.summary.hostsRejected += 1;
      return;
    }

    const urlPattern = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(boundedValue)) !== null) {
      if (!canInspectMore() || state.styleUrlMatches >= state.maxStyleUrlMatches) {
        return;
      }

      state.styleUrlMatches += 1;
      addUrlHostname(match[1], {
        allowRelative: true,
        requireHttpLike: false
      });
    }
  };

  const inspectAttributeValue = (name: string, value: string | null | undefined): void => {
    if (state.summary.domAttributesInspected >= state.maxDomAttributesInspected || !canInspectMore()) {
      return;
    }

    state.summary.domAttributesInspected += 1;

    if (!value || value.trim().length === 0 || value.length > state.maxGenericAttributeValueLength) {
      return;
    }

    const attributeName = name.toLowerCase();

    if (srcsetAttributeNames.has(attributeName)) {
      addSrcsetHostnames(value);
      return;
    }

    if (styleUrlAttributeNames.has(attributeName)) {
      if (/url\(/i.test(value)) {
        addStyleUrlValues(value);
      } else {
        addUrlHostname(value, { allowRelative: true });
      }
      return;
    }

    if (resourceAttributeNames.has(attributeName)) {
      addUrlHostname(value, { allowRelative: true });
      return;
    }

    if (looksLikeHttpUrl(value)) {
      addUrlHostname(value, {
        allowRelative: false,
        requireHttpLike: true
      });
    }
  };

  const inspectElement = (element: Element): void => {
    if (state.hosts.size >= state.maxHosts || state.mutationNodesScanned >= state.maxMutationNodesScanned) {
      return;
    }

    state.mutationNodesScanned += 1;

    if ("currentSrc" in element) {
      addUrlHostname((element as Partial<HTMLImageElement>).currentSrc, { allowRelative: true });
    }

    for (const attributeName of observedAttributeNames) {
      inspectAttributeValue(attributeName, element.getAttribute(attributeName));
    }

    const attributes = "attributes" in element ? Array.from(element.attributes) : [];

    for (const attribute of attributes) {
      if (!canInspectMore() || state.summary.domAttributesInspected >= state.maxDomAttributesInspected) {
        return;
      }

      inspectAttributeValue(attribute.name, attribute.value);
    }
  };

  const inspectElementTree = (root: Element): void => {
    inspectElement(root);

    for (const selector of selectors) {
      if (!canInspectMore()) {
        return;
      }

      try {
        for (const element of Array.from(root.querySelectorAll(selector))) {
          inspectElement(element);

          if (!canInspectMore()) {
            return;
          }
        }
      } catch {
        // Some page-provided nodes may reject selector inspection.
      }
    }
  };

  const inspectDocument = (): void => {
    if (typeof document === "undefined") {
      return;
    }

    try {
      if (document.title.replace(/\s+/g, " ").trim().toLowerCase().includes("error 403 forbidden")) {
        state.pageLooksLikeErrorOrProtection = true;
      }
    } catch {
      // Page title inspection can fail in unusual document contexts.
    }

    for (const image of Array.from(document.images ?? [])) {
      inspectElement(image);

      if (!canInspectMore()) {
        return;
      }
    }

    for (const selector of selectors) {
      if (!canInspectMore()) {
        return;
      }

      try {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          inspectElement(element);

          if (!canInspectMore()) {
            return;
          }
        }
      } catch {
        // Some pages can reject a selector in unusual document contexts.
      }
    }
  };

  const addPerformanceEntryName = (name: string | undefined): void => {
    if (!name || state.performanceEntryNames.has(name) || !canInspectMore()) {
      return;
    }

    state.performanceEntryNames.add(name);
    state.summary.performanceEntriesInspected += 1;
    addUrlHostname(name, {
      allowRelative: false,
      requireHttpLike: true
    });
  };

  const inspectExistingPerformanceEntries = (): void => {
    try {
      if (typeof performance !== "undefined" && typeof performance.getEntries === "function") {
        for (const entry of performance.getEntries()) {
          addPerformanceEntryName(entry.name);

          if (!canInspectMore()) {
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

            if (!canInspectMore()) {
              return;
            }
          }
        }
      }
    } catch {
      // Resource timing can be unavailable in some document contexts.
    }
  };

  const observePerformanceEntries = (): void => {
    try {
      if (typeof PerformanceObserver === "undefined") {
        return;
      }

      state.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          addPerformanceEntryName(entry.name);

          if (!canInspectMore()) {
            return;
          }
        }
      });
      state.performanceObserver.observe({
        type: "resource",
        buffered: true
      });
    } catch {
      try {
        state.performanceObserver?.observe({
          entryTypes: ["resource"]
        });
      } catch {
        state.performanceObserver = undefined;
      }
    }
  };

  const observeMutations = (): void => {
    try {
      if (typeof MutationObserver === "undefined") {
        return;
      }

      const target = document.documentElement ?? document;

      state.mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (!canInspectMore()) {
            return;
          }

          if (mutation.type === "attributes" && mutation.target instanceof Element) {
            inspectAttributeValue(
              mutation.attributeName ?? "",
              mutation.attributeName ? mutation.target.getAttribute(mutation.attributeName) : null
            );
            continue;
          }

          for (const addedNode of Array.from(mutation.addedNodes)) {
            if (!canInspectMore()) {
              return;
            }

            if (addedNode instanceof Element) {
              inspectElementTree(addedNode);
            }
          }
        }
      });
      state.mutationObserver.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: observedAttributeNames
      });
    } catch {
      state.mutationObserver = undefined;
    }
  };

  inspectExistingPerformanceEntries();
  inspectDocument();
  observePerformanceEntries();
  observeMutations();
  state.timerId = setTimeout(() => {
    expire(state);
  }, maxDurationMs);
  recorderGlobal.__smartProxyRouteHelperRelatedDomainRecorder = state;

  return snapshot("started", state);
}
