import { describe, expect, it } from "vitest";

import {
  buildRelatedDomainCandidates,
  type RelatedDomainCandidate,
  type RelatedDomainCandidateReason,
  type RelatedDomainRouteTargetConfidence,
  type RelatedDomainRouteTargetReason
} from "../src/diagnostics/relatedDomainCandidates";

function candidate(input: {
  domain: string;
  reason: RelatedDomainCandidateReason;
  sourceHosts: string[];
  suggestedIncludeSubdomains: boolean;
  defaultSelected: boolean;
  routeTargetReason: RelatedDomainRouteTargetReason;
  routeTargetConfidence: RelatedDomainRouteTargetConfidence;
}): RelatedDomainCandidate {
  return {
    domain: input.domain,
    reason: input.reason,
    sourceHosts: input.sourceHosts,
    sourceHostCount: input.sourceHosts.length,
    suggestedRuleDomain: input.domain,
    suggestedIncludeSubdomains: input.suggestedIncludeSubdomains,
    routeTargetReason: input.routeTargetReason,
    routeTargetConfidence: input.routeTargetConfidence,
    defaultSelected: input.defaultSelected
  };
}

describe("related-domain candidate engine", () => {
  it("groups same-site subdomains to the current base domain as a strong route target", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "https://example.com/",
      observedUrlsOrHosts: ["https://static.example.com/app.js", "api.example.com"]
    });

    expect(result.currentDomain).toBe("example.com");
    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "example.com",
        reason: "same-site-subdomain",
        sourceHosts: ["api.example.com", "static.example.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "same-site-resources",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
    expect(result.mediumCandidates).toEqual([]);
    expect(result.ignoredCandidates).toEqual([]);
  });

  it("omits exact current-domain resources when no related domain is discovered", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "letterboxd.com",
      observedUrlsOrHosts: ["https://letterboxd.com/films/", "letterboxd.com"]
    });

    expect(result).toEqual({
      currentDomain: "letterboxd.com",
      strongCandidates: [],
      mediumCandidates: [],
      ignoredCandidates: []
    });
  });

  it("suggests ChatGPT generated resource families as the related base domain", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "chatgpt.com",
      observedUrlsOrHosts: [
        "https://sdmntpritalynorth.oaiusercontent.com/file.png",
        "https://files.oaiusercontent.com/upload"
      ]
    });

    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "oaiusercontent.com",
        reason: "explicit-related-domain",
        sourceHosts: ["files.oaiusercontent.com", "sdmntpritalynorth.oaiusercontent.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
    expect(result.mediumCandidates).toEqual([]);
    expect(result.ignoredCandidates).toEqual([]);
  });

  it("keeps OpenAI static-resource hints bundled and local-only", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "https://chat.openai.com/",
      observedUrlsOrHosts: ["https://static.oaistatic.com/assets/app.js"]
    });

    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "oaistatic.com",
        reason: "explicit-related-domain",
        sourceHosts: ["static.oaistatic.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
  });

  it("categorizes Letterboxd-like diagnostic examples conservatively", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "letterboxd.com",
      observedUrlsOrHosts: [
        "https://a.ltrbxd.com/poster.jpg",
        "https://s.ltrbxd.com/static/app.js",
        "https://image.tmdb.org/t/p/w500/example.jpg",
        "https://www.google-analytics.com/analytics.js",
        "https://doubleclick.net/activity"
      ]
    });

    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "ltrbxd.com",
        reason: "explicit-related-domain",
        sourceHosts: ["a.ltrbxd.com", "s.ltrbxd.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
    expect(result.mediumCandidates).toEqual([
      candidate({
        domain: "image.tmdb.org",
        reason: "third-party-resource",
        sourceHosts: ["image.tmdb.org"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);
    expect(result.ignoredCandidates.map((item) => item.domain)).toEqual(["doubleclick.net", "google-analytics.com"]);
  });

  it("collapses duplicate observed hosts into one route target", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "letterboxd.com",
      observedUrlsOrHosts: [
        "https://a.ltrbxd.com/poster.jpg",
        "a.ltrbxd.com",
        "https://a.ltrbxd.com/another-poster.jpg"
      ]
    });

    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "ltrbxd.com",
        reason: "explicit-related-domain",
        sourceHosts: ["a.ltrbxd.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
  });

  it("rejects private, internal, localhost, and invalid observed hosts", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: [
        "http://localhost:3000/app.js",
        "http://192.168.1.1/status",
        "chrome://extensions",
        "printer.local",
        "bad host.example"
      ]
    });

    expect(result).toEqual({
      currentDomain: "example.com",
      strongCandidates: [],
      mediumCandidates: [],
      ignoredCandidates: []
    });
  });

  it("keeps shared infrastructure exact and non-saveable instead of broadening to base domains", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: [
        "https://d111.cloudfront.net/app.js",
        "https://cdn.akamaihd.net/video.js",
        "https://fonts.gstatic.com/font.woff2",
        "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js",
        "https://cdn.auth0.com/login.js",
        "https://user.github.io/app.js",
        "https://project.appspot.com/app.js",
        "https://lh3.googleusercontent.com/image.png"
      ]
    });

    expect(result.ignoredCandidates.map((item) => item.domain)).toEqual([
      "ajax.googleapis.com",
      "cdn.akamaihd.net",
      "cdn.auth0.com",
      "d111.cloudfront.net",
      "fonts.gstatic.com",
      "lh3.googleusercontent.com",
      "project.appspot.com",
      "user.github.io"
    ]);
    expect(result.ignoredCandidates.every((item) => item.suggestedIncludeSubdomains === false)).toBe(true);
    expect(result.ignoredCandidates.every((item) => item.routeTargetReason === "unsafe-shared-infrastructure")).toBe(true);
    expect(result.ignoredCandidates.every((item) => item.defaultSelected === false)).toBe(true);
    expect(result.strongCandidates).toEqual([]);
    expect(result.mediumCandidates).toEqual([]);
  });

  it("keeps obvious adtech and analytics domains ignored instead of saveable", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "linkedin.com",
      observedUrlsOrHosts: [
        "ads.stickyadstv.com",
        "eb2.3lift.com",
        "lex.33across.com",
        "sync.teads.tv",
        "token.rubiconproject.com",
        "dpm.demdex.net",
        "lnkd.demdex.net",
        "ad.doubleclick.net",
        "www.google-analytics.com",
        "www.googletagmanager.com",
        "connect.facebook.net",
        "script.hotjar.com"
      ]
    });

    expect(result.mediumCandidates).toEqual([]);
    expect(result.strongCandidates).toEqual([]);
    expect(result.ignoredCandidates.map((item) => item.domain)).toEqual([
      "33across.com",
      "3lift.com",
      "demdex.net",
      "doubleclick.net",
      "facebook.net",
      "google-analytics.com",
      "googletagmanager.com",
      "hotjar.com",
      "rubiconproject.com",
      "stickyadstv.com",
      "teads.tv"
    ]);
    expect(result.ignoredCandidates.every((item) => item.reason === "known-tracking-or-analytics")).toBe(true);
    expect(result.ignoredCandidates.every((item) => item.defaultSelected === false)).toBe(true);
  });

  it("keeps local and schema helper hosts ignored and non-saveable", () => {
    expect(
      buildRelatedDomainCandidates({
        currentDomain: "last.fm",
        observedUrlsOrHosts: ["local.adguard.org"]
      }).ignoredCandidates
    ).toEqual([
      candidate({
        domain: "local.adguard.org",
        reason: "local-or-adblock-helper",
        sourceHosts: ["local.adguard.org"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);

    expect(
      buildRelatedDomainCandidates({
        currentDomain: "linkedin.com",
        observedUrlsOrHosts: ["https://www.w3.org/2000/svg", "w3.org"]
      }).ignoredCandidates
    ).toEqual([
      candidate({
        domain: "w3.org",
        reason: "system-or-schema-helper",
        sourceHosts: ["w3.org", "www.w3.org"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);
  });

  it("groups observed LinkedIn media and static hosts under the site-scoped related root", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "https://www.linkedin.com/feed/",
      observedUrlsOrHosts: [
        "https://media.licdn.com/media/image.jpg",
        "https://static.licdn.com/sc/h/app.js",
        "https://dms.licdn.com/playlist/video.mp4",
        "https://ads.stickyadstv.com/sync",
        "https://dpm.demdex.net/id"
      ]
    });

    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "licdn.com",
        reason: "explicit-related-domain",
        sourceHosts: ["dms.licdn.com", "media.licdn.com", "static.licdn.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
    expect(result.mediumCandidates).toEqual([]);
    expect(result.ignoredCandidates.map((item) => item.domain)).toEqual(["demdex.net", "stickyadstv.com"]);
  });

  it("keeps a single unknown third-party host exact and not default-selected", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["https://assets.partner-cdn.example.net/app.js", "image.tmdb.org"]
    });

    expect(result.mediumCandidates).toEqual([
      candidate({
        domain: "assets.partner-cdn.example.net",
        reason: "third-party-resource",
        sourceHosts: ["assets.partner-cdn.example.net"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      }),
      candidate({
        domain: "image.tmdb.org",
        reason: "third-party-resource",
        sourceHosts: ["image.tmdb.org"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);
  });

  it("widens multiple sibling hosts only on a safe unknown base domain", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["static.example-assets.com", "media.example-assets.com", "single.other-assets.net"]
    });

    expect(result.mediumCandidates).toEqual([
      candidate({
        domain: "example-assets.com",
        reason: "third-party-resource",
        sourceHosts: ["media.example-assets.com", "static.example-assets.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "multiple-sibling-hosts",
        routeTargetConfidence: "medium",
        defaultSelected: false
      }),
      candidate({
        domain: "single.other-assets.net",
        reason: "third-party-resource",
        sourceHosts: ["single.other-assets.net"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);
  });

  it("keeps suspicious unknown domains reviewable instead of ignored", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["https://track.suspicious-example.net/pixel.gif"]
    });

    expect(result.strongCandidates).toEqual([]);
    expect(result.ignoredCandidates).toEqual([]);
    expect(result.mediumCandidates).toEqual([
      candidate({
        domain: "track.suspicious-example.net",
        reason: "third-party-resource",
        sourceHosts: ["track.suspicious-example.net"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);
  });

  it("keeps user override route targets explicit", () => {
    const reviewResult = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["https://ad.doubleclick.net/activity"],
      userOverrides: [
        {
          domain: "doubleclick.net",
          action: "review-globally"
        }
      ]
    });

    expect(reviewResult.mediumCandidates).toEqual([
      candidate({
        domain: "doubleclick.net",
        reason: "third-party-resource",
        sourceHosts: ["ad.doubleclick.net"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "high",
        defaultSelected: false
      })
    ]);

    const suggestResult = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["https://ad.doubleclick.net/activity"],
      userOverrides: [
        {
          domain: "doubleclick.net",
          action: "suggest-for-site",
          siteDomain: "example.com"
        }
      ]
    });

    expect(suggestResult.strongCandidates).toEqual([
      candidate({
        domain: "doubleclick.net",
        reason: "explicit-related-domain",
        sourceHosts: ["ad.doubleclick.net"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
  });

  it("lets user overrides ignore an unknown domain", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["https://assets.partner-cdn.example.net/app.js"],
      userOverrides: [
        {
          domain: "partner-cdn.example.net",
          action: "ignore-globally"
        }
      ]
    });

    expect(result.strongCandidates).toEqual([]);
    expect(result.mediumCandidates).toEqual([]);
    expect(result.ignoredCandidates).toEqual([
      candidate({
        domain: "partner-cdn.example.net",
        reason: "third-party-resource",
        sourceHosts: ["assets.partner-cdn.example.net"],
        suggestedIncludeSubdomains: false,
        routeTargetReason: "exact-observed-host",
        routeTargetConfidence: "low",
        defaultSelected: false
      })
    ]);
  });

  it("deduplicates site-scoped related domains across related hosts", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "linkedin.com",
      observedUrlsOrHosts: ["media.licdn.com", "static.licdn.com", "dms.licdn.com", "licdn.com"]
    });

    expect(result.strongCandidates).toEqual([
      candidate({
        domain: "licdn.com",
        reason: "explicit-related-domain",
        sourceHosts: ["dms.licdn.com", "licdn.com", "media.licdn.com", "static.licdn.com"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "known-related-domain",
        routeTargetConfidence: "high",
        defaultSelected: true
      })
    ]);
    expect(result.mediumCandidates).toEqual([]);
    expect(result.ignoredCandidates).toEqual([]);
  });

  it("returns deterministic categories and source host ordering", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "letterboxd.com",
      observedUrlsOrHosts: [
        "https://z.partner.example/resource.js",
        "https://s.ltrbxd.com/static/app.js",
        "https://a.ltrbxd.com/poster.jpg",
        "https://doubleclick.net/activity",
        "https://a.ltrbxd.com/another-poster.jpg",
        "https://a.partner.example/resource.js"
      ]
    });

    expect(result.strongCandidates.map((item) => item.domain)).toEqual(["ltrbxd.com"]);
    expect(result.strongCandidates[0]?.sourceHosts).toEqual(["a.ltrbxd.com", "s.ltrbxd.com"]);
    expect(result.mediumCandidates).toEqual([
      candidate({
        domain: "partner.example",
        reason: "third-party-resource",
        sourceHosts: ["a.partner.example", "z.partner.example"],
        suggestedIncludeSubdomains: true,
        routeTargetReason: "multiple-sibling-hosts",
        routeTargetConfidence: "medium",
        defaultSelected: false
      })
    ]);
    expect(result.ignoredCandidates.map((item) => item.domain)).toEqual(["doubleclick.net"]);
  });
});
