import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCurrentPageResourceHostPreview,
  currentPageResourceHostsMessageType,
  doesTextLookLikeErrorOrProtectionPage,
  runCurrentPageResourceHostPreview,
  sanitizeResourceHostCandidate,
  sanitizeResourceHostCandidates
} from "../src/diagnostics/currentPageResourceHosts";

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
