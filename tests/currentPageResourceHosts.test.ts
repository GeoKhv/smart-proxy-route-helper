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
    getAttribute(attributeName: string): string | null {
      return attributes[attributeName] ?? null;
    }
  } as Element;
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
    expect(result.currentDomain).toBe("letterboxd.com");
    expect(result.collectedHosts).toEqual(["a.ltrbxd.com", "image.tmdb.org"]);
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
    expect(result.message).not.toContain("No public resource hosts");
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
      collectedHosts: ["https://local.adguard.org/script.js", "https://dpm.demdex.net/id"]
    });

    expect(result.status).toBe("success");
    expect(result.collectedHosts).toEqual(["dpm.demdex.net", "local.adguard.org"]);
    expect(result.message).toBe(
      "2 public resource hosts checked. Only ignored analytics, helper, or infrastructure hosts were found; no rules were saved."
    );
  });

  it("collects hostnames from resource timing, srcset, media, and bounded generic attributes", () => {
    const selectorResults: Record<string, Element[]> = {
      "script[src]": [fakeElement({ src: "https://static.licdn.com/sc/h/app.js?cache=1" })],
      'link[href][rel~="stylesheet"]': [fakeElement({ href: "https://static.licdn.com/aero.css" })],
      "source[src]": [fakeElement({ src: "https://dms.licdn.com/video.mp4" })],
      "[srcset]": [
        fakeElement({
          srcset:
            "https://media.licdn.com/profile-1.jpg 1x, https://static.licdn.com/profile-2.jpg 2x, data:image/png;base64,abc 3x"
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
        if (entryType !== "resource") {
          return [];
        }

        return [
          { name: "https://ads.stickyadstv.com/sync?uid=1" },
          { name: "https://static.licdn.com/perf-entry.js#hash" },
          { name: "https://192.168.1.10/private.js" }
        ] as PerformanceEntry[];
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
        "static.licdn.com"
      ])
    );
    expect(result.hosts).not.toEqual(expect.arrayContaining(["127.0.0.1", "192.168.1.10", "router.local"]));
    expect(result.hosts.every((host) => !host.includes("/") && !host.includes("?") && !host.includes("#"))).toBe(true);
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
      currentDomain: "example.com"
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
      currentDomain: "example.com"
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
      currentDomain: "last.fm"
    });
  });

  it("does not include storage writes or rule creation helpers in the collection module", async () => {
    const source = await readFile(resolve(__dirname, "../src/diagnostics/currentPageResourceHosts.ts"), "utf8");

    expect(source).not.toContain("chrome.storage");
    expect(source).not.toContain("updateSyncSettings");
    expect(source).not.toContain("setSyncSettings");
    expect(source).not.toContain("addCurrentSiteRule");
  });
});
