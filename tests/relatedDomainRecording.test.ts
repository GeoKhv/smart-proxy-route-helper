import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildRelatedDomainRecordingPreview,
  getRelatedDomainRecordingTarget,
  relatedDomainRecordingSessionState,
  runRelatedDomainRecorderInPage
} from "../src/diagnostics/relatedDomainRecording";

class FakeElement {
  public attributes: { name: string; value: string }[];

  public constructor(
    private readonly values: Record<string, string>,
    private readonly children: FakeElement[] = []
  ) {
    this.attributes = Object.entries(values).map(([name, value]) => ({ name, value }));
  }

  public getAttribute(attributeName: string): string | null {
    return this.values[attributeName] ?? null;
  }

  public querySelectorAll(): FakeElement[] {
    return this.children;
  }
}

function stubPage(input: {
  baseURI?: string;
  title?: string;
  elements?: Record<string, FakeElement[]>;
  performanceEntries?: string[];
} = {}): {
  mutationCallback: () => MutationCallback | null;
  mutationDisconnects: () => number;
} {
  let mutationCallback: MutationCallback | null = null;
  let mutationDisconnectCount = 0;

  class FakeMutationObserver {
    public constructor(callback: MutationCallback) {
      mutationCallback = callback;
    }

    public observe(): void {
      // The tests invoke the captured callback directly.
    }

    public disconnect(): void {
      mutationDisconnectCount += 1;
    }
  }

  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
  vi.stubGlobal("document", {
    baseURI: input.baseURI ?? "https://chatgpt.com/",
    title: input.title ?? "ChatGPT",
    documentElement: new FakeElement({}),
    images: [],
    querySelectorAll(selector: string): FakeElement[] {
      return input.elements?.[selector] ?? [];
    }
  });
  vi.stubGlobal("performance", {
    getEntries(): PerformanceEntry[] {
      return [];
    },
    getEntriesByType(entryType: string): PerformanceEntry[] {
      if (entryType !== "resource") {
        return [];
      }

      return (input.performanceEntries ?? []).map((name) => ({ name }) as PerformanceEntry);
    }
  });

  return {
    mutationCallback: () => mutationCallback,
    mutationDisconnects: () => mutationDisconnectCount
  };
}

afterEach(() => {
  delete (globalThis as typeof globalThis & { __smartProxyRouteHelperRelatedDomainRecorder?: unknown })
    .__smartProxyRouteHelperRelatedDomainRecorder;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("related-domain diagnostic recording target", () => {
  it("accepts public http and https pages and rejects unsupported targets", () => {
    expect(getRelatedDomainRecordingTarget("https://ChatGPT.com/c/123")).toEqual({
      ok: true,
      domain: "chatgpt.com"
    });
    expect(getRelatedDomainRecordingTarget("chrome://extensions")).toMatchObject({
      ok: false,
      response: {
        status: "unsupported_url"
      }
    });
    expect(getRelatedDomainRecordingTarget("http://localhost:3000")).toMatchObject({
      ok: false,
      response: {
        status: "unsupported_url",
        currentDomain: "localhost"
      }
    });
  });

  it("maps transient metadata to idle, recording, and expired states", () => {
    const metadata = {
      tabId: 7,
      currentDomain: "chatgpt.com",
      startedAt: 1_000,
      expiresAt: 3_000,
      maxDurationMs: 2_000,
      status: "recording" as const
    };

    expect(relatedDomainRecordingSessionState(null, 2_000)).toEqual({ status: "idle" });
    expect(relatedDomainRecordingSessionState(metadata, 2_000)).toEqual(metadata);
    expect(relatedDomainRecordingSessionState(metadata, 3_000)).toEqual({
      ...metadata,
      status: "expired"
    });
  });
});

describe("related-domain recorder page state machine", () => {
  it("starts, records sanitized hosts from performance and mutations, then stops", () => {
    const page = stubPage({
      performanceEntries: [
        "https://sdmntpritalynorth.oaiusercontent.com/assets/file.png?secret=1#frag",
        "data:text/plain,hello",
        "http://127.0.0.1/private"
      ]
    });
    const start = runRelatedDomainRecorderInPage("start", {
      maxDurationMs: 60_000
    });

    expect(start.status).toBe("started");
    expect(start.hosts).toContain("sdmntpritalynorth.oaiusercontent.com");

    const dynamicElement = new FakeElement({
      src: "https://files.openai.com/upload/session.txt?token=private"
    });

    page.mutationCallback()?.(
      [
        {
          type: "attributes",
          target: dynamicElement,
          attributeName: "src",
          addedNodes: []
        } as unknown as MutationRecord
      ],
      {} as MutationObserver
    );

    const stop = runRelatedDomainRecorderInPage("stop");

    expect(stop.status).toBe("stopped");
    expect(stop.hosts).toEqual(["files.openai.com", "sdmntpritalynorth.oaiusercontent.com"]);
    expect(stop.hosts.every((host) => !host.includes("/") && !host.includes("?") && !host.includes("#"))).toBe(true);
    expect(stop.summary).toMatchObject({
      hostsExtracted: 2
    });
    expect(page.mutationDisconnects()).toBeGreaterThan(0);
  });

  it("cancels without returning recorded candidates", () => {
    stubPage({
      performanceEntries: ["https://files.openai.com/upload/session.txt"]
    });

    expect(runRelatedDomainRecorderInPage("start").status).toBe("started");

    const cancel = runRelatedDomainRecorderInPage("cancel");

    expect(cancel).toMatchObject({
      status: "cancelled",
      hosts: []
    });
    expect(runRelatedDomainRecorderInPage("stop").status).toBe("not_found");
  });

  it("auto-expires and returns hosts captured before expiration", () => {
    vi.useFakeTimers();
    stubPage({
      performanceEntries: ["https://sdmntpritalynorth.oaiusercontent.com/assets/file.png"]
    });

    expect(
      runRelatedDomainRecorderInPage("start", {
        maxDurationMs: 5_000
      }).status
    ).toBe("started");

    vi.advanceTimersByTime(5_000);

    const stop = runRelatedDomainRecorderInPage("stop");

    expect(stop.status).toBe("expired");
    expect(stop.hosts).toEqual(["sdmntpritalynorth.oaiusercontent.com"]);
  });

  it("caps recorded hosts and URL-like values conservatively", () => {
    stubPage({
      performanceEntries: Array.from({ length: 20 }, (_value, index) => `https://cdn${index}.example.com/app.js`)
    });

    const start = runRelatedDomainRecorderInPage("start", {
      maxHosts: 5,
      maxUrlLikeValues: 20
    });

    expect(start.hosts).toEqual([
      "cdn0.example.com",
      "cdn1.example.com",
      "cdn2.example.com",
      "cdn3.example.com",
      "cdn4.example.com"
    ]);
    expect(start.summary.hostsExtracted).toBe(5);
  });
});

describe("related-domain recording preview", () => {
  it("feeds recorded ChatGPT upload-like hosts into the existing route target planner", () => {
    const preview = buildRelatedDomainRecordingPreview({
      currentDomain: "chatgpt.com",
      recordedHosts: ["sdmntpritalynorth.oaiusercontent.com", "files.oaiusercontent.com"]
    });

    expect(preview.status).toBe("success");
    expect(preview.currentDomain).toBe("chatgpt.com");
    expect(preview.candidates?.strongCandidates).toEqual([
      expect.objectContaining({
        domain: "oaiusercontent.com",
        suggestedRuleDomain: "oaiusercontent.com",
        suggestedIncludeSubdomains: true,
        sourceHosts: ["files.oaiusercontent.com", "sdmntpritalynorth.oaiusercontent.com"]
      })
    ]);
    expect(JSON.stringify(preview)).not.toContain("sdmntpritalynorth.oaiusercontent.com/assets");
  });

  it("keeps unknown third-party hosts exact and shared infrastructure conservative", () => {
    const preview = buildRelatedDomainRecordingPreview({
      currentDomain: "example.com",
      recordedHosts: ["cdn.unknown-assets.net", "abc.cloudfront.net"]
    });

    expect(preview.candidates?.mediumCandidates).toEqual([
      expect.objectContaining({
        domain: "cdn.unknown-assets.net",
        suggestedRuleDomain: "cdn.unknown-assets.net",
        suggestedIncludeSubdomains: false
      })
    ]);
    expect(preview.candidates?.ignoredCandidates).toEqual([
      expect.objectContaining({
        domain: "abc.cloudfront.net",
        suggestedRuleDomain: "abc.cloudfront.net",
        suggestedIncludeSubdomains: false
      })
    ]);
  });

  it("does not include storage writes or rule creation helpers in the recording module", async () => {
    const source = await readFile(resolve(__dirname, "../src/diagnostics/relatedDomainRecording.ts"), "utf8");

    expect(source).not.toContain("chrome.storage");
    expect(source).not.toContain("chrome.proxy");
    expect(source).not.toContain("updateSyncSettings");
    expect(source).not.toContain("setSyncSettings");
    expect(source).not.toContain("updateLocalSettings");
    expect(source).not.toContain("addCurrentSiteRule");
  });
});
