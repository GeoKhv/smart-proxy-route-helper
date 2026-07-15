import { describe, expect, it } from "vitest";

import { classifyDomainCandidate } from "../src/domainClassification/classifyDomainCandidate";

describe("domain candidate classification", () => {
  it("classifies global adtech and analytics domains as ignored", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "ads.stickyadstv.com"
      })
    ).toMatchObject({
      domain: "stickyadstv.com",
      classification: "ignored",
      category: "adtech",
      scope: "global",
      confidence: "high",
      source: "built-in"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "www.google-analytics.com"
      })
    ).toMatchObject({
      domain: "google-analytics.com",
      classification: "ignored",
      category: "analytics",
      scope: "global",
      confidence: "high",
      source: "built-in"
    });
  });

  it("classifies schema and local helper domains as ignored", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "linkedin.com",
        candidateDomain: "https://www.w3.org/2000/svg"
      })
    ).toMatchObject({
      domain: "w3.org",
      classification: "ignored",
      category: "schema-helper",
      scope: "global",
      source: "built-in"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "last.fm",
        candidateDomain: "local.adguard.org"
      })
    ).toMatchObject({
      domain: "local.adguard.org",
      classification: "ignored",
      category: "local-helper",
      scope: "global",
      source: "built-in"
    });
  });

  it("classifies site-scoped related asset domains", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "chatgpt.com",
        candidateDomain: "sdmntpritalynorth.oaiusercontent.com"
      })
    ).toMatchObject({
      domain: "oaiusercontent.com",
      classification: "related",
      category: "site-assets",
      scope: "site",
      siteDomain: "chatgpt.com",
      confidence: "high",
      source: "built-in"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "https://chat.openai.com/",
        candidateDomain: "static.oaistatic.com"
      })
    ).toMatchObject({
      domain: "oaistatic.com",
      classification: "related",
      category: "site-assets",
      scope: "site",
      siteDomain: "openai.com",
      confidence: "high",
      source: "built-in"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "https://www.linkedin.com/feed/",
        candidateDomain: "media.licdn.com"
      })
    ).toMatchObject({
      domain: "licdn.com",
      classification: "related",
      category: "site-assets",
      scope: "site",
      siteDomain: "linkedin.com",
      confidence: "high",
      source: "built-in"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "letterboxd.com",
        candidateDomain: "a.ltrbxd.com"
      })
    ).toMatchObject({
      domain: "ltrbxd.com",
      classification: "related",
      category: "site-assets",
      scope: "site",
      siteDomain: "letterboxd.com",
      confidence: "high",
      source: "built-in"
    });
  });

  it("keeps suspicious unknown domains in manual review instead of ignoring them", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "track.suspicious-example.net"
      })
    ).toMatchObject({
      domain: "track.suspicious-example.net",
      classification: "review",
      category: "suspicious",
      confidence: "low",
      source: "built-in"
    });
  });

  it("lets user overrides review or suggest a built-in ignored domain", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "ad.doubleclick.net",
        userOverrides: [
          {
            domain: "doubleclick.net",
            action: "review-globally"
          }
        ]
      })
    ).toMatchObject({
      domain: "doubleclick.net",
      classification: "review",
      source: "user-override"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "ad.doubleclick.net",
        userOverrides: [
          {
            domain: "doubleclick.net",
            action: "suggest-for-site",
            siteDomain: "example.com"
          }
        ]
      })
    ).toMatchObject({
      domain: "doubleclick.net",
      classification: "related",
      scope: "site",
      siteDomain: "example.com",
      source: "user-override"
    });
  });

  it("lets user overrides ignore an unknown domain", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "assets.partner-cdn.example.net",
        userOverrides: [
          {
            domain: "partner-cdn.example.net",
            action: "ignore-globally"
          }
        ]
      })
    ).toMatchObject({
      domain: "partner-cdn.example.net",
      classification: "ignored",
      scope: "global",
      source: "user-override"
    });
  });

  it("keeps site-scoped overrides limited to the matching site", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "example.com",
        candidateDomain: "assets.partner.example.net",
        userOverrides: [
          {
            domain: "partner.example.net",
            action: "ignore-for-site",
            siteDomain: "example.com"
          }
        ]
      })
    ).toMatchObject({
      domain: "partner.example.net",
      classification: "ignored",
      scope: "site",
      siteDomain: "example.com",
      source: "user-override"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "other.example",
        candidateDomain: "assets.partner.example.net",
        userOverrides: [
          {
            domain: "partner.example.net",
            action: "ignore-for-site",
            siteDomain: "example.com"
          }
        ]
      })
    ).toMatchObject({
      domain: "assets.partner.example.net",
      classification: "review",
      source: "built-in"
    });
  });

  it("matches standard WWW override inputs as canonical domain entities", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "www.example.com",
        candidateDomain: "www.wikipedia.org",
        userOverrides: [
          {
            domain: "www.wikipedia.org",
            action: "suggest-for-site",
            siteDomain: "www.example.com"
          }
        ]
      })
    ).toMatchObject({
      domain: "wikipedia.org",
      classification: "related",
      scope: "site",
      siteDomain: "example.com",
      source: "user-override"
    });
  });

  it("lets global overrides affect every site while site overrides take precedence", () => {
    expect(
      classifyDomainCandidate({
        currentDomain: "first.example",
        candidateDomain: "cdn.partner.example.net",
        userOverrides: [
          {
            domain: "partner.example.net",
            action: "ignore-globally"
          }
        ]
      })
    ).toMatchObject({
      classification: "ignored",
      scope: "global",
      source: "user-override"
    });

    expect(
      classifyDomainCandidate({
        currentDomain: "second.example",
        candidateDomain: "cdn.partner.example.net",
        userOverrides: [
          {
            domain: "partner.example.net",
            action: "ignore-globally"
          },
          {
            domain: "partner.example.net",
            action: "suggest-for-site",
            siteDomain: "second.example"
          }
        ]
      })
    ).toMatchObject({
      classification: "related",
      scope: "site",
      siteDomain: "second.example",
      source: "user-override"
    });
  });
});
