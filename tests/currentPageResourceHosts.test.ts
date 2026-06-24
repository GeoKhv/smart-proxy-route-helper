import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCurrentPageResourceHostPreview,
  collectCurrentPageResourceHostnamesFromDom,
  currentPageResourceHostsMessageType,
  doesTextLookLikeErrorOrProtectionPage,
  runCurrentPageResourceHostPreview,
  sanitizeResourceHostCandidate,
  sanitizeResourceHostCandidates
} from "../src/diagnostics/currentPageResourceHosts";

function fakeElement(attributes: Record<string, string>): Element {
  return {
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    getAttribute(attributeName: string): string | null {
      return attributes[attributeName] ?? null;
    }
  } as unknown as Element;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("current-page resource host sanitization", () => {
  it("converts URLs to hostnames and strips paths, query strings, fragments, and credentials", () => {
    expect(sanitizeResourceHostCandidate("https://user:pass@Static.Example.com/assets/app.js?token=secret#frag")).toBe(
      "static.example.com"
    );
    expect(sanitizeResourceHostCandidate("//Images.Example.net/photo.jpg?size=large")).toBe("images.example.net");
  });

  it("deduplicates normalized hosts", () => {
    expect(
      sanitizeResourceHostCandidates([
        "https://cdn.example.com/app.js?one=1",
        "cdn.example.com",
        "https://CDN.example.com/other.js#hash"
      ])
    ).toEqual(["cdn.example.com"]);
  });

  it("rejects unsupported schemes, localhost, private, internal, and IP hosts", () => {
    expect(
      sanitizeResourceHostCandidates([
        "data:text/plain,hello",
        "chrome://extensions",
        "http://localhost:3000/app.js",
        "http://127.0.0.1/app.js",
        "http://192.168.1.1/status",
        "https://router.local/app.js",
        "https://8.8.8.8/dns-query",
        "https://public.example/app.js"
      ])
    ).toEqual(["public.example"]);
  });

  it("caps sanitized resource hosts conservatively", () => {
    const hosts = Array.from({ length: 100 }, (_value, index) => `cdn${index}.example.com`);

    expect(sanitizeResourceHostCandidates(hosts, 5)).toEqual([
      "cdn0.example.com",
      "cdn1.example.com",
      "cdn2.example.com",
      "cdn3.example.com",
      "cdn4.example.com"
    ]);
  });
});

describe("current-page resource host preview", () => {
  it("feeds sanitized collected hosts into the related-domain candidate engine", () => {
    const result = buildCurrentPageResourceHostPreview({
      url: "https://letterboxd.com/films/",
      collectedHosts: [
        "https://a.ltrbxd.com/poster.jpg?private=1",
        "https://image.tmdb.org/t/p/w500/example.jpg",
        "http://localhost:3000/app.js"
      ]
    });

    expect(result.status).toBe("success");
    expect(result.resultState).toBe("candidates_available");
    expect(result.currentDomain).toBe("letterboxd.com");
    expect(result.collectedHosts).toEqual(["a.ltrbxd.com", "image.tmdb.org"]);
    expect(result.summary).toMatchObject({
      rawEntriesInspected: 3,
      hostsAfterSanitization: 2,
      hostsIgnoredOrInternal: 1,
      reviewableCandidates: 2,
      ignoredCandidates: 0
    });
    expect(result.candidates?.strongCandidates.map((candidate) => candidate.domain)).toEqual(["ltrbxd.com"]);
    expect(result.candidates?.mediumCandidates.map((candidate) => candidate.domain)).toEqual(["image.tmdb.org"]);
  });

  it("keeps LinkedIn-like media/static hosts reviewable while noisy helpers stay ignored", () => {
    const result = buildCurrentPageResourceHostPreview({
      url: "https://www.linkedin.com/feed/",
      collectedHosts: [
        "https://media.licdn.com/media/image.jpg",
        "https://static.licdn.com/sc/h/app.js",
        "https://dms.licdn.com/playlist/video.mp4",
        "https://ads.stickyadstv.com/sync",
        "https://eb2.3lift.com/id",
        "https://lex.33across.com/id",
        "https://sync.teads.tv/id",
        "https://token.rubiconproject.com/id",
        "https://dpm.demdex.net/id",
        "https://ad.doubleclick.net/activity",
        "https://www.google-analytics.com/analytics.js",
        "https://www.googletagmanager.com/gtm.js",
        "https://connect.facebook.net/sdk.js",
        "https://script.hotjar.com/modules.js",
        "https://local.adguard.org/script.js"
      ]
    });

    expect(result.status).toBe("success");
    expect(result.resultState).toBe("candidates_available");
    expect(result.message).not.toContain("No public resource hosts");
    expect(result.summary).toMatchObject({
      hostsAfterSanitization: 15,
      reviewableCandidates: 3,
      ignoredCandidates: 12
    });
    expect(result.candidates?.mediumCandidates.map((candidate) => candidate.domain)).toEqual([
      "dms.licdn.com",
      "media.licdn.com",
      "static.licdn.com"
    ]);
    expect(result.candidates?.ignoredCandidates.map((candidate) => candidate.domain)).toEqual([
      "33across.com",
      "3lift.com",
      "demdex.net",
      "doubleclick.net",
      "facebook.net",
      "google-analytics.com",
      "googletagmanager.com",
      "hotjar.com",
      "local.adguard.org",
      "rubiconproject.com",
      "stickyadstv.com",
      "teads.tv"
    ]);
  });

  it("reports collected-but-ignored hosts separately from no public hosts", () => {
    const result = buildCurrentPageResourceHostPreview({
      url: "https://www.linkedin.com/feed/",
      collectedHosts: [
        "https://local.adguard.org/script.js",
        "https://dpm.demdex.net/id",
        "https://www.w3.org/2000/svg"
      ]
    });

    expect(result.status).toBe("success");
    expect(result.resultState).toBe("hosts_collected_but_all_internal_or_ignored");
    expect(result.collectedHosts).toEqual(["dpm.demdex.net", "local.adguard.org", "www.w3.org"]);
    expect(result.message).toBe(
      "Resource hosts were found, but they look like analytics/adtech/local or schema helper domains. No rules were saved."
    );
    expect(result.summary).toMatchObject({
      rawEntriesInspected: 3,
      hostsAfterSanitization: 3,
      reviewableCandidates: 0,
      ignoredCandidates: 3
    });
    expect(result.candidates?.ignoredCandidates.map((candidate) => candidate.domain)).toEqual([
      "demdex.net",
      "local.adguard.org",
      "w3.org"
    ]);
  });

  it("reports no collected resource entries separately from filtered resource entries", () => {
    expect(
      buildCurrentPageResourceHostPreview({
        url: "https://www.linkedin.com/feed/",
        collectedHosts: []
      })
    ).toMatchObject({
      status: "success",
      resultState: "no_resource_entries_collected",
      message: "No page resource hosts were found. Try reloading the page, then preview again.",
      summary: {
        rawEntriesInspected: 0,
        hostsExtracted: 0,
        hostsAfterSanitization: 0,
        hostsIgnoredOrInternal: 0,
        reviewableCandidates: 0,
        ignoredCandidates: 0
      }
    });

    expect(
      buildCurrentPageResourceHostPreview({
        url: "https://www.linkedin.com/feed/",
        collectedHosts: ["chrome://extensions/app.js", "http://127.0.0.1/debug.js"]
      })
    ).toMatchObject({
      status: "success",
      resultState: "hosts_collected_but_all_internal_or_ignored",
      message:
        "Resource hosts were found, but they look like analytics/adtech/local or schema helper domains. No rules were saved.",
      summary: {
        rawEntriesInspected: 2,
        hostsExtracted: 0,
        hostsAfterSanitization: 0,
        hostsIgnoredOrInternal: 2,
        reviewableCandidates: 0,
        ignoredCandidates: 0
      }
    });
  });

  it("collects hostnames from resource timing, navigation, srcset, media, style URLs, and bounded generic attributes", () => {
    const selectorResults: Record<string, Element[]> = {
      "script[src]": [fakeElement({ src: "https://static.licdn.com/sc/h/app.js?cache=1" })],
      'link[href][rel~="stylesheet"]': [fakeElement({ href: "https://static.licdn.com/aero.css" })],
      'link[href][rel~="icon"]': [fakeElement({ href: "https://static.licdn.com/favicon.ico" })],
      "source[src]": [fakeElement({ src: "https://dms.licdn.com/video.mp4" })],
      "[srcset]": [
        fakeElement({
          srcset:
            "https://media.licdn.com/profile-1.jpg 1x, https://static.licdn.com/profile-2.jpg 2x, data:image/png;base64,abc 3x"
        })
      ],
      "[style]": [
        fakeElement({
          style:
            "background-image: url('https://media.licdn.com/background.jpg?secret=1'); mask-image: url(data:image/png;base64,abc)"
        })
      ],
      "[src]": [
        fakeElement({ src: "https://media.licdn.com/generic.jpg" }),
        fakeElement({ src: "http://127.0.0.1/debug.js" })
      ],
      "[href]": [
        fakeElement({ href: "https://local.adguard.org/script.js" }),
        fakeElement({ href: "mailto:person@example.com" }),
        fakeElement({ href: "https://router.local/admin" })
      ]
    };

    vi.stubGlobal("document", {
      baseURI: "https://www.linkedin.com/feed/",
      title: "Feed | LinkedIn",
      body: {
        innerText: "Regular loaded feed",
        textContent: "Regular loaded feed"
      },
      images: [
        {
          currentSrc: "https://media.licdn.com/feed-image.jpg?secret=1",
          src: ""
        }
      ],
      querySelectorAll(selector: string): Element[] {
        return selectorResults[selector] ?? [];
      }
    });
    vi.stubGlobal("performance", {
      getEntriesByType(entryType: string): PerformanceEntry[] {
        if (entryType === "resource") {
          return [
            { name: "https://ads.stickyadstv.com/sync?uid=1" },
            { name: "https://static.licdn.com/perf-entry.js#hash" },
            { name: "https://192.168.1.10/private.js" }
          ] as PerformanceEntry[];
        }

        if (entryType === "navigation") {
          return [{ name: "https://www.linkedin.com/feed/" }] as PerformanceEntry[];
        }

        return [];
      }
    });

    const result = collectCurrentPageResourceHostnamesFromDom();

    expect(result.pageLooksLikeErrorOrProtection).toBe(false);
    expect(result.hosts).toEqual(
      expect.arrayContaining([
        "ads.stickyadstv.com",
        "dms.licdn.com",
        "local.adguard.org",
        "media.licdn.com",
        "www.linkedin.com",
        "static.licdn.com"
      ])
    );
    expect(result.hosts).not.toEqual(expect.arrayContaining(["127.0.0.1", "192.168.1.10", "router.local"]));
    expect(result.hosts.every((host) => !host.includes("/") && !host.includes("?") && !host.includes("#"))).toBe(true);
    expect(result.summary).toMatchObject({
      hostsExtracted: result.hosts.length
    });
    expect(result.summary?.rawEntriesInspected).toBeGreaterThan(result.hosts.length);
    expect(result.summary?.hostsRejected).toBeGreaterThan(0);
  });

  it("collects LinkedIn-like lazy resources from data attributes, computed style, getEntries, and open shadow roots", () => {
    const openShadowRoot = {
      querySelectorAll(selector: string): Element[] {
        if (selector === "[data-delayed-url]") {
          return [fakeElement({ "data-delayed-url": "https://media.licdn.com/shadow-lazy.jpg?secret=1" })];
        }

        if (selector === "*") {
          return [fakeElement({ "data-media-url": "https://dms.licdn.com/shadow-video.mp4?token=1" })];
        }

        return [];
      }
    } as unknown as ShadowRoot;
    const shadowHost = {
      ...fakeElement({ "data-ignored": "not a url" }),
      shadowRoot: openShadowRoot
    } as Element;
    const computedElement = fakeElement({ class: "lazy-image" });
    const genericDataElement = fakeElement({
      "data-delayed-url": "https://media.licdn.com/delayed.jpg?private=1",
      "data-li-src": "https://media.licdn.com/li-src.jpg#frag",
      "data-background-image": "url('https://media.licdn.com/background-data.jpg?secret=1')",
      "data-noise": "https://local.adguard.org/helper.js"
    });
    const selectorResults: Record<string, Element[]> = {
      "*": [shadowHost, computedElement, genericDataElement],
      "script[src]": [fakeElement({ src: "https://static.licdn.com/sc/h/app.js?cache=1" })],
      'link[href][rel~="preload"]': [fakeElement({ href: "https://static.licdn.com/preload.js" })],
      'link[href][rel~="preconnect"]': [fakeElement({ href: "https://static.licdn.com" })],
      "[data-delayed-url]": [genericDataElement],
      "[data-li-src]": [genericDataElement],
      "[data-background-image]": [genericDataElement]
    };

    vi.stubGlobal("document", {
      baseURI: "https://www.linkedin.com/feed/",
      title: "Feed | LinkedIn",
      images: [
        {
          currentSrc: "https://media.licdn.com/current.jpg?secret=1",
          src: "https://media.licdn.com/src.jpg?secret=1",
          srcset:
            "https://media.licdn.com/srcset-1.jpg 1x, https://static.licdn.com/srcset-2.jpg 2x, data:image/png;base64,abc 3x"
        }
      ],
      querySelectorAll(selector: string): Element[] {
        return selectorResults[selector] ?? [];
      }
    });
    vi.stubGlobal("window", {
      getComputedStyle(element: Element): Partial<CSSStyleDeclaration> {
        return {
          backgroundImage:
            element === computedElement ? 'url("https://media.licdn.com/computed-background.jpg?secret=1")' : "none",
          listStyleImage: "none"
        };
      }
    });
    vi.stubGlobal("performance", {
      getEntries(): PerformanceEntry[] {
        return [{ name: "https://static.licdn.com/from-get-entries.js?cache=1" }] as PerformanceEntry[];
      },
      getEntriesByType(entryType: string): PerformanceEntry[] {
        if (entryType === "resource") {
          return [
            { name: "https://static.licdn.com/from-get-entries.js?cache=1" },
            { name: "https://dms.licdn.com/performance-video.mp4?token=1" }
          ] as PerformanceEntry[];
        }

        if (entryType === "navigation") {
          return [{ name: "https://www.linkedin.com/feed/" }] as PerformanceEntry[];
        }

        return [];
      }
    });

    const result = collectCurrentPageResourceHostnamesFromDom();

    expect(result.pageLooksLikeErrorOrProtection).toBe(false);
    expect(result.hosts).toEqual(
      expect.arrayContaining(["dms.licdn.com", "media.licdn.com", "static.licdn.com", "www.linkedin.com"])
    );
    expect(result.hosts.every((host) => !host.includes("/") && !host.includes("?") && !host.includes("#"))).toBe(true);
    expect(result.summary).toMatchObject({
      performanceEntriesInspected: 3,
      hostsExtracted: result.hosts.length
    });
    expect(result.summary?.domAttributesInspected).toBeGreaterThan(0);
    expect(result.summary?.urlLikeValuesFound).toBeGreaterThanOrEqual(result.hosts.length);
  });

  it("adds deterministic diagnostic summary counts without raw URLs", () => {
    const result = buildCurrentPageResourceHostPreview({
      url: "https://www.linkedin.com/feed/",
      collectedHosts: [
        "https://static.licdn.com/sc/h/app.js?secret=1#frag",
        "https://media.licdn.com/media/image.jpg?private=1",
        "https://192.168.1.10/private.js"
      ],
      collectionSummary: {
        rawEntriesInspected: 7,
        performanceEntriesInspected: 2,
        domAttributesInspected: 5,
        urlLikeValuesFound: 3,
        hostsExtracted: 2,
        hostsRejected: 1
      }
    });

    expect(result.summary).toEqual({
      rawEntriesInspected: 7,
      performanceEntriesInspected: 2,
      domAttributesInspected: 5,
      urlLikeValuesFound: 3,
      hostsExtracted: 2,
      hostsAfterSanitization: 2,
      hostsIgnoredOrInternal: 2,
      reviewableCandidates: 2,
      ignoredCandidates: 0,
      sampleHosts: ["media.licdn.com", "static.licdn.com"]
    });
    expect(JSON.stringify(result.summary)).not.toContain("/sc/h/app.js");
    expect(JSON.stringify(result.summary)).not.toContain("?");
    expect(JSON.stringify(result.summary)).not.toContain("#");
  });

  it("rejects unsupported current pages before attempting script collection", async () => {
    let scriptWasCalled = false;
    const result = await runCurrentPageResourceHostPreview(
      {
        type: currentPageResourceHostsMessageType,
        tabId: 1,
        url: "chrome://extensions"
      },
      {
        async executeScript() {
          scriptWasCalled = true;
          return [];
        }
      }
    );

    expect(result.status).toBe("unsupported_url");
    expect(scriptWasCalled).toBe(false);
  });

  it("maps script collection failures without writing storage or creating rules", async () => {
    const result = await runCurrentPageResourceHostPreview(
      {
        type: currentPageResourceHostsMessageType,
        tabId: 1,
        url: "https://example.com/"
      },
      {
        async executeScript() {
          throw new Error("Cannot access this page.");
        }
      }
    );

    expect(result).toEqual({
      status: "collection_unavailable",
      message: "Could not collect resource hosts from this page: Cannot access this page.",
      currentDomain: "example.com",
      resultState: "page_not_loaded"
    });
  });

  it("maps browser error pages to friendly page-not-loaded copy", async () => {
    const result = await runCurrentPageResourceHostPreview(
      {
        type: currentPageResourceHostsMessageType,
        tabId: 1,
        url: "https://example.com/"
      },
      {
        async executeScript() {
          throw new Error("Frame with ID 0 is showing error page");
        }
      }
    );

    expect(result).toEqual({
      status: "collection_unavailable",
      message:
        "This page appears to be an error or protection page, so related-domain results may not represent the target site. Route or check this site through proxy, reload the page, then preview related domains.",
      currentDomain: "example.com",
      resultState: "page_not_loaded"
    });
  });

  it("maps server error or protection page signals to friendly warning copy", () => {
    expect(doesTextLookLikeErrorOrProtectionPage("Error 403 Forbidden\nVarnish cache server")).toBe(true);
    expect(doesTextLookLikeErrorOrProtectionPage("Regular app page with loaded resources")).toBe(false);

    const result = buildCurrentPageResourceHostPreview({
      url: "https://last.fm/music",
      collectedHosts: ["local.adguard.org", "media.example.com"],
      pageLooksLikeErrorOrProtection: true
    });

    expect(result).toEqual({
      status: "collection_unavailable",
      message:
        "This page appears to be an error or protection page, so related-domain results may not represent the target site. Route or check this site through proxy, reload the page, then preview related domains.",
      currentDomain: "last.fm",
      resultState: "error_or_protection_page"
    });
  });

  it("does not include storage writes or rule creation helpers in the collection module", async () => {
    const source = await readFile(resolve(__dirname, "../src/diagnostics/currentPageResourceHosts.ts"), "utf8");

    expect(source).not.toContain("chrome.storage");
    expect(source).not.toContain("document.body");
    expect(source).not.toContain("innerText");
    expect(source).not.toContain("textContent");
    expect(source).not.toContain("updateSyncSettings");
    expect(source).not.toContain("setSyncSettings");
    expect(source).not.toContain("addCurrentSiteRule");
  });
});
