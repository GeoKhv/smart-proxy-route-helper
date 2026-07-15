export type RelatedDomainRecorderAction = "start" | "stop" | "cancel";

export type RelatedDomainRecorderOptions = {
  sessionNonce: string;
  maxDurationMs?: number;
  maxHosts?: number;
  maxUrlLikeValues?: number;
};

export type RelatedDomainRecorderSummary = {
  rawEntriesInspected: number;
  requestInitiationsInspected: number;
  performanceEntriesInspected: number;
  domAttributesInspected: number;
  urlLikeValuesFound: number;
  hostsExtracted: number;
  hostsRejected: number;
  bridgeEventsRejected: number;
  droppedPerformanceEntries: number;
};

export type RelatedDomainRecorderBridgeResult = {
  status: "started" | "already_recording" | "stopped" | "expired" | "cancelled" | "not_found" | "error";
  hosts: string[];
  pageLooksLikeErrorOrProtection: boolean;
  summary: RelatedDomainRecorderSummary;
  message?: string;
};

export type RelatedDomainMainWorldRecorderResult = {
  status: "started" | "already_recording" | "stopped" | "expired" | "cancelled" | "not_found" | "error";
  summary: RelatedDomainRecorderSummary;
  message?: string;
};

/**
 * Runs in Chrome's ISOLATED world. Keep this function self-contained because
 * chrome.scripting serializes the function body without its module scope.
 */
export function runRelatedDomainRecorderBridgeInPage(
  action: RelatedDomainRecorderAction,
  options: RelatedDomainRecorderOptions
): RelatedDomainRecorderBridgeResult {
  type BridgeState = {
    status: "recording" | "expired";
    sessionNonce: string;
    hosts: Set<string>;
    expiresAt: number;
    maxHosts: number;
    maxEvents: number;
    eventsInspected: number;
    summary: RelatedDomainRecorderSummary;
    eventListener: EventListener;
    timerId?: ReturnType<typeof setTimeout>;
  };
  type BridgeGlobal = typeof globalThis & {
    __smartProxyRouteHelperRelatedDomainRecorderBridge?: BridgeState;
  };

  const bridgeGlobal = globalThis as BridgeGlobal;
  const eventName = "smart-proxy-route-helper:related-domain-host-v1";
  const now = Date.now();
  const emptySummary = (): RelatedDomainRecorderSummary => ({
    rawEntriesInspected: 0,
    requestInitiationsInspected: 0,
    performanceEntriesInspected: 0,
    domAttributesInspected: 0,
    urlLikeValuesFound: 0,
    hostsExtracted: 0,
    hostsRejected: 0,
    bridgeEventsRejected: 0,
    droppedPerformanceEntries: 0
  });
  const emptyResult = (
    status: RelatedDomainRecorderBridgeResult["status"],
    message?: string
  ): RelatedDomainRecorderBridgeResult => ({
    status,
    hosts: [],
    pageLooksLikeErrorOrProtection: false,
    summary: emptySummary(),
    ...(message ? { message } : {})
  });
  const snapshot = (
    status: RelatedDomainRecorderBridgeResult["status"],
    state: BridgeState
  ): RelatedDomainRecorderBridgeResult => ({
    status,
    hosts: [...state.hosts].sort((left, right) => left.localeCompare(right)),
    pageLooksLikeErrorOrProtection: false,
    summary: {
      ...state.summary,
      rawEntriesInspected: state.eventsInspected,
      hostsExtracted: state.hosts.size
    }
  });
  const validNonce = (input: string): boolean =>
    input.length >= 32 && input.length <= 96 && /^[a-f0-9-]+$/i.test(input);
  const normalizeHostname = (input: string): string | null => {
    if (input.length === 0 || input.length > 253 || input !== input.trim()) {
      return null;
    }

    const hostname = input.trim().toLowerCase().replace(/\.+$/, "");

    if (
      hostname.length === 0 ||
      hostname.length > 253 ||
      !hostname.includes(".") ||
      /[\s:/?#@\\]/.test(hostname) ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname.includes(":")
    ) {
      return null;
    }

    const labels = hostname.split(".");

    if (
      labels.some(
        (label) =>
          label.length === 0 ||
          label.length > 63 ||
          !/^[a-z0-9-]+$/.test(label) ||
          label.startsWith("-") ||
          label.endsWith("-")
      )
    ) {
      return null;
    }

    return hostname;
  };
  const disconnect = (state: BridgeState): void => {
    try {
      document.removeEventListener(eventName, state.eventListener, true);
    } catch {
      // The document may already be tearing down.
    }

    if (state.timerId !== undefined) {
      clearTimeout(state.timerId);
      state.timerId = undefined;
    }
  };
  const expire = (state: BridgeState): void => {
    if (state.status !== "recording") {
      return;
    }

    state.status = "expired";
    disconnect(state);
  };
  const existing = bridgeGlobal.__smartProxyRouteHelperRelatedDomainRecorderBridge;

  if (action === "cancel") {
    if (!existing || existing.sessionNonce !== options.sessionNonce) {
      return emptyResult("not_found", getMessage("recordingBridgeMissing"));
    }

    disconnect(existing);
    delete bridgeGlobal.__smartProxyRouteHelperRelatedDomainRecorderBridge;
    return emptyResult("cancelled");
  }

  if (action === "stop") {
    if (!existing || existing.sessionNonce !== options.sessionNonce) {
      return emptyResult("not_found", getMessage("recordingBridgeMissing"));
    }

    if (existing.expiresAt <= now) {
      expire(existing);
    }

    const result = snapshot(existing.status === "expired" ? "expired" : "stopped", existing);

    disconnect(existing);
    delete bridgeGlobal.__smartProxyRouteHelperRelatedDomainRecorderBridge;
    return result;
  }

  if (action !== "start" || !validNonce(options.sessionNonce)) {
    return emptyResult("error", getMessage("recordingBridgeInvalidRequest"));
  }

  if (
    existing &&
    existing.sessionNonce === options.sessionNonce &&
    existing.status === "recording" &&
    existing.expiresAt > now
  ) {
    return snapshot("already_recording", existing);
  }

  if (existing) {
    disconnect(existing);
    delete bridgeGlobal.__smartProxyRouteHelperRelatedDomainRecorderBridge;
  }

  const maxDurationMs = Math.max(5_000, Math.min(options.maxDurationMs ?? 120_000, 120_000));
  const maxHosts = Math.max(1, Math.min(options.maxHosts ?? 80, 80));
  const state: BridgeState = {
    status: "recording" as const,
    sessionNonce: options.sessionNonce,
    hosts: new Set<string>(),
    expiresAt: now + maxDurationMs,
    maxHosts,
    maxEvents: Math.max(1, Math.min(options.maxUrlLikeValues ?? 2_000, 2_000)),
    eventsInspected: 0,
    summary: emptySummary(),
    eventListener: (() => undefined) as EventListener
  };

  state.eventListener = ((event: Event): void => {
    if (state.eventsInspected >= state.maxEvents) {
      return;
    }

    state.eventsInspected += 1;
    let detail: unknown;

    try {
      detail = (event as CustomEvent<unknown>).detail;
    } catch {
      state.summary.bridgeEventsRejected += 1;
      return;
    }

    if (typeof detail !== "object" || detail === null) {
      state.summary.bridgeEventsRejected += 1;
      return;
    }

    let version: unknown;
    let eventNonce: unknown;
    let eventHostname: unknown;

    try {
      version = Reflect.get(detail, "version");
      eventNonce = Reflect.get(detail, "sessionNonce");
      eventHostname = Reflect.get(detail, "hostname");
    } catch {
      state.summary.bridgeEventsRejected += 1;
      return;
    }

    if (version !== 1 || eventNonce !== state.sessionNonce || typeof eventHostname !== "string") {
      state.summary.bridgeEventsRejected += 1;
      return;
    }

    const hostname = normalizeHostname(eventHostname);

    if (!hostname) {
      state.summary.bridgeEventsRejected += 1;
      state.summary.hostsRejected += 1;
      return;
    }

    if (state.hosts.size >= state.maxHosts && !state.hosts.has(hostname)) {
      state.summary.hostsRejected += 1;
      return;
    }

    state.hosts.add(hostname);
    state.summary.hostsExtracted = state.hosts.size;
  }) as EventListener;

  document.addEventListener(eventName, state.eventListener, true);
  state.timerId = setTimeout(() => {
    expire(state);
  }, maxDurationMs);
  bridgeGlobal.__smartProxyRouteHelperRelatedDomainRecorderBridge = state;

  return snapshot("started", state);
}

/**
 * Runs in the page's MAIN world. It converts every observed URL-like value to
 * a hostname before dispatching anything across the page/extension boundary.
 * Keep this function self-contained for chrome.scripting serialization.
 */
export function runRelatedDomainMainWorldRecorderInPage(
  action: RelatedDomainRecorderAction,
  options: RelatedDomainRecorderOptions
): RelatedDomainMainWorldRecorderResult {
  type MainWorldState = {
    status: "recording" | "expired";
    sessionNonce: string;
    expiresAt: number;
    maxHosts: number;
    maxUrlLikeValues: number;
    hosts: Set<string>;
    summary: RelatedDomainRecorderSummary;
    originalFetch?: typeof fetch;
    wrappedFetch?: typeof fetch;
    xhrPrototype?: typeof XMLHttpRequest.prototype;
    originalXhrOpen?: typeof XMLHttpRequest.prototype.open;
    wrappedXhrOpen?: typeof XMLHttpRequest.prototype.open;
    originalSendBeacon?: typeof navigator.sendBeacon;
    wrappedSendBeacon?: typeof navigator.sendBeacon;
    performanceObserver?: PerformanceObserver;
    errorTarget?: EventTarget;
    errorListener?: EventListener;
    timerId?: ReturnType<typeof setTimeout>;
  };
  type MainWorldGlobal = typeof globalThis & {
    __smartProxyRouteHelperMainWorldRelatedDomainRecorder?: MainWorldState;
  };

  const recorderGlobal = globalThis as MainWorldGlobal;
  const eventName = "smart-proxy-route-helper:related-domain-host-v1";
  const now = Date.now();
  const emptySummary = (): RelatedDomainRecorderSummary => ({
    rawEntriesInspected: 0,
    requestInitiationsInspected: 0,
    performanceEntriesInspected: 0,
    domAttributesInspected: 0,
    urlLikeValuesFound: 0,
    hostsExtracted: 0,
    hostsRejected: 0,
    bridgeEventsRejected: 0,
    droppedPerformanceEntries: 0
  });
  const emptyResult = (
    status: RelatedDomainMainWorldRecorderResult["status"],
    message?: string
  ): RelatedDomainMainWorldRecorderResult => ({
    status,
    summary: emptySummary(),
    ...(message ? { message } : {})
  });
  const snapshot = (
    status: RelatedDomainMainWorldRecorderResult["status"],
    state: MainWorldState
  ): RelatedDomainMainWorldRecorderResult => ({
    status,
    summary: {
      ...state.summary,
      rawEntriesInspected:
        state.summary.requestInitiationsInspected +
        state.summary.performanceEntriesInspected +
        state.summary.domAttributesInspected,
      hostsExtracted: state.hosts.size
    }
  });
  const validNonce = (input: string): boolean =>
    input.length >= 32 && input.length <= 96 && /^[a-f0-9-]+$/i.test(input);
  const normalizeHostname = (input: string): string | null => {
    const hostname = input.trim().toLowerCase().replace(/\.+$/, "");

    if (
      hostname.length === 0 ||
      hostname.length > 253 ||
      !hostname.includes(".") ||
      /[\s:/?#@\\]/.test(hostname) ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname.includes(":")
    ) {
      return null;
    }

    const labels = hostname.split(".");

    return labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9-]+$/.test(label) ||
        label.startsWith("-") ||
        label.endsWith("-")
    )
      ? null
      : hostname;
  };
  const disconnect = (state: MainWorldState): void => {
    try {
      state.performanceObserver?.disconnect();
    } catch {
      // Performance observation cleanup is best-effort in page contexts.
    }

    if (state.errorTarget && state.errorListener) {
      try {
        state.errorTarget.removeEventListener("error", state.errorListener, true);
      } catch {
        // The frame may already be tearing down.
      }
    }

    if (state.wrappedFetch && recorderGlobal.fetch === state.wrappedFetch && state.originalFetch) {
      try {
        recorderGlobal.fetch = state.originalFetch;
      } catch {
        // A page can make globals non-writable while the recorder is active.
      }
    }

    if (
      state.xhrPrototype &&
      state.wrappedXhrOpen &&
      state.xhrPrototype.open === state.wrappedXhrOpen &&
      state.originalXhrOpen
    ) {
      try {
        state.xhrPrototype.open = state.originalXhrOpen;
      } catch {
        // A page can make prototype methods non-writable while recording.
      }
    }

    if (
      state.wrappedSendBeacon &&
      typeof navigator !== "undefined" &&
      navigator.sendBeacon === state.wrappedSendBeacon &&
      state.originalSendBeacon
    ) {
      try {
        navigator.sendBeacon = state.originalSendBeacon;
      } catch {
        // A page can make navigator methods non-writable while recording.
      }
    }

    if (state.timerId !== undefined) {
      clearTimeout(state.timerId);
      state.timerId = undefined;
    }
  };
  const expire = (state: MainWorldState): void => {
    if (state.status !== "recording") {
      return;
    }

    state.status = "expired";
    disconnect(state);
    state.hosts.clear();
  };
  const existing = recorderGlobal.__smartProxyRouteHelperMainWorldRelatedDomainRecorder;

  if (action === "cancel") {
    if (!existing || existing.sessionNonce !== options.sessionNonce) {
      return emptyResult("not_found", getMessage("recordingMainMissing"));
    }

    disconnect(existing);
    delete recorderGlobal.__smartProxyRouteHelperMainWorldRelatedDomainRecorder;
    return emptyResult("cancelled");
  }

  if (action === "stop") {
    if (!existing || existing.sessionNonce !== options.sessionNonce) {
      return emptyResult("not_found", getMessage("recordingMainMissing"));
    }

    if (existing.expiresAt <= now) {
      expire(existing);
    }

    const result = snapshot(existing.status === "expired" ? "expired" : "stopped", existing);

    disconnect(existing);
    delete recorderGlobal.__smartProxyRouteHelperMainWorldRelatedDomainRecorder;
    return result;
  }

  if (action !== "start" || !validNonce(options.sessionNonce)) {
    return emptyResult("error", getMessage("recordingMainInvalidRequest"));
  }

  if (
    existing &&
    existing.sessionNonce === options.sessionNonce &&
    existing.status === "recording" &&
    existing.expiresAt > now
  ) {
    return snapshot("already_recording", existing);
  }

  if (existing) {
    disconnect(existing);
    delete recorderGlobal.__smartProxyRouteHelperMainWorldRelatedDomainRecorder;
  }

  const maxDurationMs = Math.max(5_000, Math.min(options.maxDurationMs ?? 120_000, 120_000));
  const state: MainWorldState = {
    status: "recording",
    sessionNonce: options.sessionNonce,
    expiresAt: now + maxDurationMs,
    maxHosts: Math.max(1, Math.min(options.maxHosts ?? 80, 80)),
    maxUrlLikeValues: Math.max(1, Math.min(options.maxUrlLikeValues ?? 2_000, 2_000)),
    hosts: new Set<string>(),
    summary: emptySummary()
  };
  const emitUrlHostname = (input: unknown): void => {
    if (state.summary.urlLikeValuesFound >= state.maxUrlLikeValues) {
      state.summary.hostsRejected += 1;
      return;
    }

    let value: string | null = null;

    if (typeof input === "string") {
      value = input;
    } else if (typeof URL !== "undefined" && input instanceof URL) {
      value = input.href;
    } else if (typeof input === "object" && input !== null && "url" in input && typeof input.url === "string") {
      value = input.url;
    }

    if (!value || value.length > 8_192) {
      state.summary.hostsRejected += 1;
      return;
    }

    state.summary.urlLikeValuesFound += 1;

    try {
      const parsed = new URL(value, typeof document !== "undefined" ? document.baseURI : undefined);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        state.summary.hostsRejected += 1;
        return;
      }

      const hostname = normalizeHostname(parsed.hostname);

      if (!hostname) {
        state.summary.hostsRejected += 1;
        return;
      }

      if (state.hosts.has(hostname)) {
        return;
      }

      if (state.hosts.size >= state.maxHosts) {
        state.summary.hostsRejected += 1;
        return;
      }

      state.hosts.add(hostname);
      state.summary.hostsExtracted = state.hosts.size;

      document.dispatchEvent(
        new CustomEvent(eventName, {
          detail: {
            version: 1,
            sessionNonce: state.sessionNonce,
            hostname
          }
        })
      );
    } catch {
      state.summary.hostsRejected += 1;
    }
  };
  const safelyEmitUrlHostname = (input: unknown): void => {
    try {
      emitUrlHostname(input);
    } catch {
      state.summary.hostsRejected += 1;
    }
  };

  if (typeof recorderGlobal.fetch === "function") {
    try {
      state.originalFetch = recorderGlobal.fetch;
      state.wrappedFetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
        state.summary.requestInitiationsInspected += 1;
        safelyEmitUrlHostname(input);
        return Reflect.apply(state.originalFetch as typeof fetch, this, [input, init]);
      } as typeof fetch;
      recorderGlobal.fetch = state.wrappedFetch;
    } catch {
      state.originalFetch = undefined;
      state.wrappedFetch = undefined;
    }
  }

  if (typeof XMLHttpRequest !== "undefined" && typeof XMLHttpRequest.prototype.open === "function") {
    try {
      state.xhrPrototype = XMLHttpRequest.prototype;
      state.originalXhrOpen = XMLHttpRequest.prototype.open;
      state.wrappedXhrOpen = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: unknown[]
      ): void {
        state.summary.requestInitiationsInspected += 1;
        safelyEmitUrlHostname(url);
        Reflect.apply(state.originalXhrOpen as typeof XMLHttpRequest.prototype.open, this, [method, url, ...rest]);
      } as typeof XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = state.wrappedXhrOpen;
    } catch {
      state.xhrPrototype = undefined;
      state.originalXhrOpen = undefined;
      state.wrappedXhrOpen = undefined;
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      state.originalSendBeacon = navigator.sendBeacon;
      state.wrappedSendBeacon = function (this: Navigator, url: string | URL, data?: BodyInit | null): boolean {
        state.summary.requestInitiationsInspected += 1;
        safelyEmitUrlHostname(url);
        return Reflect.apply(state.originalSendBeacon as typeof navigator.sendBeacon, this, [url, data]);
      } as typeof navigator.sendBeacon;
      navigator.sendBeacon = state.wrappedSendBeacon;
    } catch {
      state.originalSendBeacon = undefined;
      state.wrappedSendBeacon = undefined;
    }
  }

  const inspectPerformanceEntry = (entry: PerformanceEntry): void => {
    state.summary.performanceEntriesInspected += 1;
    safelyEmitUrlHostname(entry.name);
  };

  try {
    if (typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
      for (const entry of performance.getEntriesByType("resource")) {
        inspectPerformanceEntry(entry);
      }
    }
  } catch {
    // Existing resource timing entries are an optional input.
  }

  try {
    if (typeof PerformanceObserver !== "undefined") {
      const PerformanceObserverWithOptions = PerformanceObserver as unknown as new (
        callback: (
          list: PerformanceObserverEntryList,
          observer: PerformanceObserver,
          callbackOptions?: { droppedEntriesCount?: number }
        ) => void
      ) => PerformanceObserver;
      state.performanceObserver = new PerformanceObserverWithOptions((list, _observer, callbackOptions) => {
        const droppedEntriesCount = callbackOptions?.droppedEntriesCount;

        if (typeof droppedEntriesCount === "number" && droppedEntriesCount > 0) {
          state.summary.droppedPerformanceEntries += droppedEntriesCount;
        }

        for (const entry of list.getEntries()) {
          inspectPerformanceEntry(entry);
        }
      });
      state.performanceObserver.observe({
        type: "resource",
        buffered: true
      });
    }
  } catch {
    try {
      state.performanceObserver?.observe({ entryTypes: ["resource"] });
    } catch {
      state.performanceObserver = undefined;
    }
  }

  state.errorTarget = typeof window !== "undefined" ? window : recorderGlobal;
  state.errorListener = ((event: Event): void => {
    const target = event.target;

    if (typeof target !== "object" || target === null) {
      return;
    }

    let foundResourceAttribute = false;

    for (const attributeName of ["currentSrc", "src", "href", "poster"] as const) {
      let value: unknown;

      try {
        value =
          attributeName in target
            ? (target as unknown as Record<string, unknown>)[attributeName]
            : undefined;

        if (
          (typeof value !== "string" || value.length === 0) &&
          "getAttribute" in target &&
          typeof target.getAttribute === "function"
        ) {
          value = Reflect.apply(target.getAttribute as (name: string) => string | null, target, [attributeName]);
        }
      } catch {
        value = undefined;
      }

      if (typeof value === "string" && value.length > 0) {
        foundResourceAttribute = true;
        state.summary.domAttributesInspected += 1;
        safelyEmitUrlHostname(value);
      }
    }

    if (!foundResourceAttribute) {
      return;
    }
  }) as EventListener;

  try {
    state.errorTarget.addEventListener("error", state.errorListener, true);
  } catch {
    state.errorTarget = undefined;
    state.errorListener = undefined;
  }

  state.timerId = setTimeout(() => {
    expire(state);
  }, maxDurationMs);
  recorderGlobal.__smartProxyRouteHelperMainWorldRelatedDomainRecorder = state;

  return snapshot("started", state);
}

function isRecorderStatus(input: unknown): input is RelatedDomainRecorderBridgeResult["status"] {
  return (
    input === "started" ||
    input === "already_recording" ||
    input === "stopped" ||
    input === "expired" ||
    input === "cancelled" ||
    input === "not_found" ||
    input === "error"
  );
}

function isBoundedCount(input: unknown): input is number {
  return typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 100_000;
}

export function isRelatedDomainRecorderSummary(input: unknown): input is RelatedDomainRecorderSummary {
  return (
    typeof input === "object" &&
    input !== null &&
    "rawEntriesInspected" in input &&
    isBoundedCount(input.rawEntriesInspected) &&
    "requestInitiationsInspected" in input &&
    isBoundedCount(input.requestInitiationsInspected) &&
    "performanceEntriesInspected" in input &&
    isBoundedCount(input.performanceEntriesInspected) &&
    "domAttributesInspected" in input &&
    isBoundedCount(input.domAttributesInspected) &&
    "urlLikeValuesFound" in input &&
    isBoundedCount(input.urlLikeValuesFound) &&
    "hostsExtracted" in input &&
    isBoundedCount(input.hostsExtracted) &&
    "hostsRejected" in input &&
    isBoundedCount(input.hostsRejected) &&
    "bridgeEventsRejected" in input &&
    isBoundedCount(input.bridgeEventsRejected) &&
    "droppedPerformanceEntries" in input &&
    isBoundedCount(input.droppedPerformanceEntries)
  );
}

export function isRelatedDomainRecorderBridgeResult(input: unknown): input is RelatedDomainRecorderBridgeResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "status" in input &&
    isRecorderStatus(input.status) &&
    "hosts" in input &&
    Array.isArray(input.hosts) &&
    input.hosts.length <= 80 &&
    input.hosts.every((host) => typeof host === "string" && host.length <= 253) &&
    "pageLooksLikeErrorOrProtection" in input &&
    typeof input.pageLooksLikeErrorOrProtection === "boolean" &&
    "summary" in input &&
    isRelatedDomainRecorderSummary(input.summary) &&
    (!("message" in input) || typeof input.message === "string")
  );
}

export function isRelatedDomainMainWorldRecorderResult(
  input: unknown
): input is RelatedDomainMainWorldRecorderResult {
  return (
    typeof input === "object" &&
    input !== null &&
    "status" in input &&
    isRecorderStatus(input.status) &&
    "summary" in input &&
    isRelatedDomainRecorderSummary(input.summary) &&
    (!("message" in input) || typeof input.message === "string")
  );
}
import { getMessage } from "../i18n/i18n";
