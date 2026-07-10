import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runRelatedDomainMainWorldRecorderInPage,
  runRelatedDomainRecorderBridgeInPage,
  type RelatedDomainRecorderOptions
} from "../src/diagnostics/actionRequestRecorder";

const sessionNonce = "a1".repeat(24);
const bridgeEventName = "smart-proxy-route-helper:related-domain-host-v1";

type LooseEvent = {
  type: string;
  detail?: unknown;
  target?: unknown;
};

class FakeDocument {
  public readonly baseURI = "https://chatgpt.com/";
  private readonly listeners = new Map<string, Set<EventListener>>();

  public addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();

    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public dispatchEvent(event: Event): boolean {
    this.emit(event as unknown as LooseEvent);
    return true;
  }

  public emit(event: LooseEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event as unknown as Event);
    }
  }

  public listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeWindow {
  private readonly listeners = new Map<string, Set<EventListener>>();

  public addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();

    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emitResourceError(target: unknown): void {
    for (const listener of this.listeners.get("error") ?? []) {
      listener({ type: "error", target } as unknown as Event);
    }
  }

  public listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeCustomEvent {
  public readonly type: string;
  public readonly detail: unknown;

  public constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

type PerformanceCallback = (
  list: PerformanceObserverEntryList,
  observer: PerformanceObserver,
  options?: { droppedEntriesCount?: number }
) => void;

function stubRecorderEnvironment(input: {
  fetchImpl?: typeof fetch;
  xhrOpenImpl?: (this: XMLHttpRequest, method: string, url: string | URL) => void;
  beaconImpl?: (url: string | URL, data?: BodyInit | null) => boolean;
  existingPerformanceEntries?: string[];
} = {}): {
  document: FakeDocument;
  window: FakeWindow;
  originalFetch: typeof fetch;
  originalXhrOpen: typeof XMLHttpRequest.prototype.open;
  originalSendBeacon: typeof navigator.sendBeacon;
  emitPerformanceEntries: (entries: string[], droppedEntriesCount?: number) => void;
  performanceDisconnects: () => number;
} {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const originalFetch = input.fetchImpl ?? (vi.fn(async () => new Response()) as unknown as typeof fetch);

  class FakeXMLHttpRequest {
    public open(method: string, url: string | URL): void {
      input.xhrOpenImpl?.call(this as unknown as XMLHttpRequest, method, url);
    }
  }

  const navigatorValue = {
    sendBeacon:
      input.beaconImpl ??
      ((_url: string | URL, _data?: BodyInit | null): boolean => true)
  };
  let performanceCallback: PerformanceCallback | null = null;
  let disconnectCount = 0;

  class FakePerformanceObserver {
    public constructor(callback: PerformanceCallback) {
      performanceCallback = callback;
    }

    public observe(): void {
      // The test invokes future entry delivery explicitly.
    }

    public disconnect(): void {
      disconnectCount += 1;
    }
  }

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("CustomEvent", FakeCustomEvent);
  vi.stubGlobal("fetch", originalFetch);
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
  vi.stubGlobal("navigator", navigatorValue);
  vi.stubGlobal("performance", {
    getEntriesByType(entryType: string): PerformanceEntry[] {
      return entryType === "resource"
        ? (input.existingPerformanceEntries ?? []).map((name) => ({ name }) as PerformanceEntry)
        : [];
    }
  });
  vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);

  return {
    document,
    window,
    originalFetch,
    originalXhrOpen: FakeXMLHttpRequest.prototype.open as typeof XMLHttpRequest.prototype.open,
    originalSendBeacon: navigatorValue.sendBeacon,
    emitPerformanceEntries(entries, droppedEntriesCount = 0): void {
      const callback = performanceCallback as PerformanceCallback | null;

      if (!callback) {
        throw new Error("PerformanceObserver was not started");
      }

      callback(
        {
          getEntries: () => entries.map((name) => ({ name }) as PerformanceEntry),
          getEntriesByName: () => [],
          getEntriesByType: () => []
        },
        {} as PerformanceObserver,
        { droppedEntriesCount }
      );
    },
    performanceDisconnects: () => disconnectCount
  };
}

function startRecorders(options: Partial<RelatedDomainRecorderOptions> = {}): void {
  const recorderOptions: RelatedDomainRecorderOptions = {
    sessionNonce,
    maxDurationMs: 60_000,
    ...options
  };

  expect(runRelatedDomainRecorderBridgeInPage("start", recorderOptions).status).toBe("started");
  expect(runRelatedDomainMainWorldRecorderInPage("start", recorderOptions).status).toBe("started");
}

function stopBridge(options: Partial<RelatedDomainRecorderOptions> = {}) {
  return runRelatedDomainRecorderBridgeInPage("stop", {
    sessionNonce,
    maxDurationMs: 60_000,
    ...options
  });
}

function stopMain(options: Partial<RelatedDomainRecorderOptions> = {}) {
  return runRelatedDomainMainWorldRecorderInPage("stop", {
    sessionNonce,
    maxDurationMs: 60_000,
    ...options
  });
}

afterEach(() => {
  delete (globalThis as typeof globalThis & {
    __smartProxyRouteHelperRelatedDomainRecorderBridge?: unknown;
  }).__smartProxyRouteHelperRelatedDomainRecorderBridge;
  delete (globalThis as typeof globalThis & {
    __smartProxyRouteHelperMainWorldRelatedDomainRecorder?: unknown;
  }).__smartProxyRouteHelperMainWorldRelatedDomainRecorder;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MAIN-world action request capture", () => {
  it("captures fetch before its promise settles and remains active without the popup", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    stubRecorderEnvironment({
      fetchImpl: vi.fn(() => pendingFetch) as unknown as typeof fetch
    });
    startRecorders();

    const request = fetch(
      "https://sdmntpritalynorth.oaiusercontent.com/files/upload?sig=secret&se=tomorrow&sp=write"
    );
    const bridge = stopBridge();

    expect(bridge.hosts).toEqual(["sdmntpritalynorth.oaiusercontent.com"]);
    expect(JSON.stringify(bridge)).not.toMatch(/sig=|se=|sp=|\/files\/|\?/);
    expect(stopMain().status).toBe("stopped");
    resolveFetch?.(new Response());
    await request;
  });

  it("keeps a rejected fetch hostname", async () => {
    stubRecorderEnvironment({
      fetchImpl: vi.fn(async () => {
        throw new TypeError("network failed");
      }) as unknown as typeof fetch
    });
    startRecorders();

    await expect(fetch("https://failed.example.com/upload")).rejects.toThrow("network failed");

    expect(stopBridge().hosts).toEqual(["failed.example.com"]);
    stopMain();
  });

  it("does not change fetch behavior for hostile Request-like objects", async () => {
    const originalFetch = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    stubRecorderEnvironment({ fetchImpl: originalFetch });
    startRecorders();
    const hostileInput = new Proxy(
      {},
      {
        has(): never {
          throw new Error("hostile request getter");
        }
      }
    ) as Request;

    await expect(fetch(hostileInput)).resolves.toBeInstanceOf(Response);
    expect(originalFetch).toHaveBeenCalledOnce();
    expect(stopBridge().hosts).toEqual([]);
    stopMain();
  });

  it("captures XMLHttpRequest.open before a failed XHR attempt", () => {
    const environment = stubRecorderEnvironment({
      xhrOpenImpl(): void {
        throw new Error("XHR failed");
      }
    });
    startRecorders();
    const xhr = new XMLHttpRequest();

    expect(() => xhr.open("POST", "https://uploads.example.net/session?token=secret")).toThrow("XHR failed");
    expect(stopBridge().hosts).toEqual(["uploads.example.net"]);
    stopMain();
    expect(XMLHttpRequest.prototype.open).toBe(environment.originalXhrOpen);
  });

  it("captures sendBeacon even when the browser rejects the attempt", () => {
    const environment = stubRecorderEnvironment({
      beaconImpl: () => false
    });
    startRecorders();

    expect(navigator.sendBeacon("https://beacon.example.org/collect?sig=secret")).toBe(false);
    expect(stopBridge().hosts).toEqual(["beacon.example.org"]);
    stopMain();
    expect(navigator.sendBeacon).toBe(environment.originalSendBeacon);
  });

  it("continuously captures future resource entries and reports dropped entries", () => {
    const environment = stubRecorderEnvironment({
      existingPerformanceEntries: ["https://initial.example.com/app.js"]
    });
    startRecorders();

    environment.emitPerformanceEntries(["https://future.example.net/chunk.js?token=secret"], 3);

    const bridge = stopBridge();
    const main = stopMain();

    expect(bridge.hosts).toEqual(["future.example.net", "initial.example.com"]);
    expect(main.summary.performanceEntriesInspected).toBe(2);
    expect(main.summary.droppedPerformanceEntries).toBe(3);
    expect(environment.performanceDisconnects()).toBeGreaterThan(0);
  });

  it("extracts only safe resource attributes from captured DOM error events", () => {
    const environment = stubRecorderEnvironment();
    startRecorders();

    environment.window.emitResourceError({
      src: "https://images.example.com/broken.png?sig=secret",
      textContent: "private page text must not be read",
      errorMessage: "do not inspect"
    });

    const bridge = stopBridge();
    const main = stopMain();

    expect(bridge.hosts).toEqual(["images.example.com"]);
    expect(JSON.stringify(bridge)).not.toMatch(/private page text|errorMessage|sig=/);
    expect(main.summary.domAttributesInspected).toBe(1);
  });
});

describe("privacy-safe session bridge", () => {
  it("rejects unrelated nonces and malformed or raw-URL payloads", () => {
    const environment = stubRecorderEnvironment();
    startRecorders();

    environment.document.emit({
      type: bridgeEventName,
      detail: { version: 1, sessionNonce: "b2".repeat(24), hostname: "unrelated.example.com" }
    });
    environment.document.emit({
      type: bridgeEventName,
      detail: {
        version: 1,
        sessionNonce,
        hostname: "https://sdmntpritalynorth.oaiusercontent.com/files/upload?sig=secret"
      }
    });
    environment.document.emit({
      type: bridgeEventName,
      detail: { sessionNonce, hostname: { unexpected: true } }
    });
    environment.document.emit({
      type: bridgeEventName,
      detail: new Proxy(
        {},
        {
          get(): never {
            throw new Error("untrusted getter");
          }
        }
      )
    });

    const bridge = stopBridge();

    expect(bridge.hosts).toEqual([]);
    expect(bridge.summary.bridgeEventsRejected).toBe(4);
    expect(JSON.stringify(bridge)).not.toContain("sig=secret");
    stopMain();
  });

  it("normalizes and deduplicates hostname-only events", () => {
    const environment = stubRecorderEnvironment();
    startRecorders();

    for (const hostname of ["CDN.Example.com.", "cdn.example.com", "cdn.example.com"]) {
      environment.document.emit({
        type: bridgeEventName,
        detail: { version: 1, sessionNonce, hostname }
      });
    }

    expect(stopBridge().hosts).toEqual(["cdn.example.com"]);
    stopMain();
  });

  it("caps untrusted event count, hostname length, and unique hosts", () => {
    const environment = stubRecorderEnvironment();
    startRecorders({ maxHosts: 2, maxUrlLikeValues: 3 });

    for (const hostname of [
      `${"a".repeat(254)}.example.com`,
      "one.example.com",
      "two.example.com",
      "three.example.com",
      "four.example.com"
    ]) {
      environment.document.emit({
        type: bridgeEventName,
        detail: { version: 1, sessionNonce, hostname }
      });
    }

    const bridge = stopBridge({ maxHosts: 2, maxUrlLikeValues: 3 });

    expect(bridge.hosts).toEqual(["one.example.com", "two.example.com"]);
    expect(bridge.summary.rawEntriesInspected).toBe(3);
    expect(bridge.summary.hostsRejected).toBe(1);
    stopMain({ maxHosts: 2, maxUrlLikeValues: 3 });
  });
});

describe("recorder lifecycle and injection scope", () => {
  it("restores fetch, XHR, beacon, observers, and listeners on Stop", () => {
    const environment = stubRecorderEnvironment();
    startRecorders();

    expect(fetch).not.toBe(environment.originalFetch);
    expect(XMLHttpRequest.prototype.open).not.toBe(environment.originalXhrOpen);
    expect(navigator.sendBeacon).not.toBe(environment.originalSendBeacon);

    stopMain();
    stopBridge();

    expect(fetch).toBe(environment.originalFetch);
    expect(XMLHttpRequest.prototype.open).toBe(environment.originalXhrOpen);
    expect(navigator.sendBeacon).toBe(environment.originalSendBeacon);
    expect(environment.window.listenerCount("error")).toBe(0);
    expect(environment.document.listenerCount(bridgeEventName)).toBe(0);
  });

  it("restores hooks and discards candidates on Cancel", () => {
    const environment = stubRecorderEnvironment();
    startRecorders();

    void fetch("https://cancelled.example.com/request");
    expect(
      runRelatedDomainMainWorldRecorderInPage("cancel", { sessionNonce })
    ).toMatchObject({ status: "cancelled" });
    expect(
      runRelatedDomainRecorderBridgeInPage("cancel", { sessionNonce })
    ).toMatchObject({ status: "cancelled", hosts: [] });
    expect(fetch).toBe(environment.originalFetch);
    expect(environment.document.listenerCount(bridgeEventName)).toBe(0);
  });

  it("cleans up automatically on timeout", () => {
    vi.useFakeTimers();
    const environment = stubRecorderEnvironment();
    startRecorders({ maxDurationMs: 5_000 });

    vi.advanceTimersByTime(5_000);

    expect(fetch).toBe(environment.originalFetch);
    expect(XMLHttpRequest.prototype.open).toBe(environment.originalXhrOpen);
    expect(navigator.sendBeacon).toBe(environment.originalSendBeacon);
    expect(environment.window.listenerCount("error")).toBe(0);
    expect(environment.document.listenerCount(bridgeEventName)).toBe(0);
    expect(stopMain({ maxDurationMs: 5_000 }).status).toBe("expired");
    expect(stopBridge({ maxDurationMs: 5_000 }).status).toBe("expired");
  });

  it("uses MAIN world and all accessible frames without changing manifest permissions", async () => {
    const [serviceWorkerSource, manifestSource, popupHtml, optionsHtml] = await Promise.all([
      readFile(resolve(__dirname, "../src/background/service-worker.ts"), "utf8"),
      readFile(resolve(__dirname, "../manifest.json"), "utf8"),
      readFile(resolve(__dirname, "../src/popup/popup.html"), "utf8"),
      readFile(resolve(__dirname, "../src/options/options.html"), "utf8")
    ]);
    const manifest = JSON.parse(manifestSource) as {
      permissions: string[];
      host_permissions?: string[];
      content_scripts?: unknown[];
    };

    expect(serviceWorkerSource).toContain('world: "MAIN"');
    expect(serviceWorkerSource).toMatch(/tabId,\s*allFrames: true/);
    expect(manifest.permissions).toEqual(["proxy", "storage", "activeTab", "scripting"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifestSource).not.toMatch(/<all_urls>|webRequest|webNavigation|debugger/);
    expect(`${popupHtml}\n${optionsHtml}`).not.toMatch(/paste failed|failed-url|failed-hostname/i);
  });
});
