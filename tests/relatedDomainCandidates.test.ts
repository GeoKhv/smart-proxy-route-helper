import { describe, expect, it } from "vitest";

import { buildRelatedDomainCandidates } from "../src/diagnostics/relatedDomainCandidates";

describe("related-domain candidate engine", () => {
  it("groups same-site subdomains to the current base domain as a strong candidate", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "https://example.com/",
      observedUrlsOrHosts: ["https://static.example.com/app.js", "api.example.com"]
    });

    expect(result.currentDomain).toBe("example.com");
    expect(result.strongCandidates).toEqual([
      {
        domain: "example.com",
        reason: "same-site-subdomain",
        sourceHosts: ["api.example.com", "static.example.com"],
        sourceHostCount: 2,
        suggestedIncludeSubdomains: true,
        defaultSelected: true
      }
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

  it("categorizes the Letterboxd-like diagnostic examples conservatively", () => {
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
      {
        domain: "ltrbxd.com",
        reason: "explicit-related-domain",
        sourceHosts: ["a.ltrbxd.com", "s.ltrbxd.com"],
        sourceHostCount: 2,
        suggestedIncludeSubdomains: true,
        defaultSelected: true
      }
    ]);
    expect(result.mediumCandidates).toEqual([
      {
        domain: "image.tmdb.org",
        reason: "third-party-resource",
        sourceHosts: ["image.tmdb.org"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      }
    ]);
    expect(result.ignoredCandidates).toEqual([
      {
        domain: "doubleclick.net",
        reason: "known-tracking-or-analytics",
        sourceHosts: ["doubleclick.net"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      },
      {
        domain: "google-analytics.com",
        reason: "known-tracking-or-analytics",
        sourceHosts: ["www.google-analytics.com"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      }
    ]);
  });

  it("collapses duplicate observed hosts", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "letterboxd.com",
      observedUrlsOrHosts: [
        "https://a.ltrbxd.com/poster.jpg",
        "a.ltrbxd.com",
        "https://a.ltrbxd.com/another-poster.jpg"
      ]
    });

    expect(result.strongCandidates).toEqual([
      {
        domain: "ltrbxd.com",
        reason: "explicit-related-domain",
        sourceHosts: ["a.ltrbxd.com"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: true,
        defaultSelected: true
      }
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

  it("keeps huge shared infrastructure domains ignored and not default-selected", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: [
        "https://d111.cloudfront.net/app.js",
        "https://cdn.akamaihd.net/video.js",
        "https://fonts.gstatic.com/font.woff2",
        "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"
      ]
    });

    expect(result.ignoredCandidates).toEqual([
      {
        domain: "akamaihd.net",
        reason: "shared-infrastructure",
        sourceHosts: ["cdn.akamaihd.net"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      },
      {
        domain: "cloudfront.net",
        reason: "shared-infrastructure",
        sourceHosts: ["d111.cloudfront.net"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      },
      {
        domain: "googleapis.com",
        reason: "shared-infrastructure",
        sourceHosts: ["ajax.googleapis.com"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      },
      {
        domain: "gstatic.com",
        reason: "shared-infrastructure",
        sourceHosts: ["fonts.gstatic.com"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      }
    ]);
    expect(result.ignoredCandidates.every((candidate) => candidate.defaultSelected === false)).toBe(true);
    expect(result.ignoredCandidates.every((candidate) => candidate.suggestedIncludeSubdomains === false)).toBe(true);
    expect(result.strongCandidates).toEqual([]);
    expect(result.mediumCandidates).toEqual([]);
  });

  it("classifies unknown third-party domains as medium and not default-selected", () => {
    const result = buildRelatedDomainCandidates({
      currentDomain: "example.com",
      observedUrlsOrHosts: ["https://assets.partner-cdn.example.net/app.js", "image.tmdb.org"]
    });

    expect(result.mediumCandidates).toEqual([
      {
        domain: "assets.partner-cdn.example.net",
        reason: "third-party-resource",
        sourceHosts: ["assets.partner-cdn.example.net"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      },
      {
        domain: "image.tmdb.org",
        reason: "third-party-resource",
        sourceHosts: ["image.tmdb.org"],
        sourceHostCount: 1,
        suggestedIncludeSubdomains: false,
        defaultSelected: false
      }
    ]);
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

    expect(result.strongCandidates.map((candidate) => candidate.domain)).toEqual(["ltrbxd.com"]);
    expect(result.strongCandidates[0]?.sourceHosts).toEqual(["a.ltrbxd.com", "s.ltrbxd.com"]);
    expect(result.mediumCandidates.map((candidate) => candidate.domain)).toEqual([
      "a.partner.example",
      "z.partner.example"
    ]);
    expect(result.ignoredCandidates.map((candidate) => candidate.domain)).toEqual(["doubleclick.net"]);
  });
});
