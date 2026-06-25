import { describe, expect, it } from "vitest";

import { domainMatchesRule, findMatchingDomainRule } from "../src/rules/domainMatcher";
import type { DomainRule } from "../src/rules/ruleTypes";

const letterboxdRule: DomainRule = {
  domain: "letterboxd.com",
  includeSubdomains: true,
  mode: "proxy",
  source: "manual",
  createdAt: "2026-06-24T00:00:00.000Z"
};

describe("domainMatchesRule", () => {
  it("matches exact domains", () => {
    expect(domainMatchesRule("letterboxd.com", { ...letterboxdRule, includeSubdomains: false })).toBe(true);
    expect(domainMatchesRule("Letterboxd.com.", { ...letterboxdRule, includeSubdomains: false })).toBe(true);
  });

  it("matches subdomains only when includeSubdomains is enabled", () => {
    const ltrbxdRule = { domain: "ltrbxd.com", includeSubdomains: true };

    expect(domainMatchesRule("a.ltrbxd.com", ltrbxdRule)).toBe(true);
    expect(domainMatchesRule("a.ltrbxd.com", { ...ltrbxdRule, includeSubdomains: false })).toBe(false);
  });

  it("does not allow accidental partial matches", () => {
    expect(domainMatchesRule("badletterboxd.com", letterboxdRule)).toBe(false);
    expect(domainMatchesRule("letterboxd.com.evil.example", letterboxdRule)).toBe(false);
    expect(domainMatchesRule("badexample.com", { domain: "example.com", includeSubdomains: true })).toBe(false);
  });

  it("does not treat LinkedIn rules as covering separate licdn.com resource domains", () => {
    expect(domainMatchesRule("www.linkedin.com", { domain: "linkedin.com", includeSubdomains: true })).toBe(true);
    expect(domainMatchesRule("media.licdn.com", { domain: "linkedin.com", includeSubdomains: true })).toBe(false);
    expect(domainMatchesRule("static.licdn.com", { domain: "linkedin.com", includeSubdomains: true })).toBe(false);
    expect(domainMatchesRule("dms.licdn.com", { domain: "dms.licdn.com", includeSubdomains: false })).toBe(true);
    expect(domainMatchesRule("video.dms.licdn.com", { domain: "dms.licdn.com", includeSubdomains: false })).toBe(false);
  });

  it("covers related asset siblings only when the related base includes subdomains", () => {
    expect(domainMatchesRule("files.oaiusercontent.com", { domain: "oaiusercontent.com", includeSubdomains: true })).toBe(true);
    expect(
      domainMatchesRule("files.oaiusercontent.com", {
        domain: "sdmntpritalynorth.oaiusercontent.com",
        includeSubdomains: false
      })
    ).toBe(false);
    expect(domainMatchesRule("media.licdn.com", { domain: "licdn.com", includeSubdomains: true })).toBe(true);
    expect(domainMatchesRule("static.licdn.com", { domain: "licdn.com", includeSubdomains: true })).toBe(true);
    expect(domainMatchesRule("dms.licdn.com", { domain: "licdn.com", includeSubdomains: true })).toBe(true);
  });

  it("finds the first matching rule", () => {
    const rules = [
      { domain: "example.com", includeSubdomains: true },
      { domain: "ltrbxd.com", includeSubdomains: true }
    ];

    expect(findMatchingDomainRule("a.ltrbxd.com", rules)).toEqual(rules[1]);
  });
});
