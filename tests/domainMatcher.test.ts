import { describe, expect, it } from "vitest";

import {
  domainMatchesRule,
  findEffectiveDomainRule,
  findMatchingDomainRule,
  findRedundantDomainRules
} from "../src/rules/domainMatcher";
import type { DomainRule } from "../src/rules/ruleTypes";

const letterboxdRule: DomainRule = {
  domain: "letterboxd.com",
  includeSubdomains: true,
  action: "proxy",
  mode: "proxy",
  source: "manual",
  createdAt: "2026-06-24T00:00:00.000Z"
};

function rule(
  domain: string,
  includeSubdomains: boolean,
  action: "proxy" | "direct" = "proxy",
  createdAt = "2026-06-24T00:00:00.000Z"
): DomainRule {
  return {
    domain,
    includeSubdomains,
    action,
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

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

  it("treats only standard registrable-domain WWW as an exact apex alias", () => {
    const exactRule = { domain: "example.com", includeSubdomains: false };

    expect(domainMatchesRule("example.com", exactRule)).toBe(true);
    expect(domainMatchesRule("www.example.com", exactRule)).toBe(true);
    expect(domainMatchesRule("www2.example.com", exactRule)).toBe(false);
    expect(domainMatchesRule("api.example.com", exactRule)).toBe(false);
    expect(domainMatchesRule("deep.www.example.com", exactRule)).toBe(false);
    expect(domainMatchesRule("www.status.example.com", { domain: "status.example.com", includeSubdomains: false })).toBe(false);
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

describe("findEffectiveDomainRule", () => {
  it("prefers exact host rules over parent rules", () => {
    const rules = [rule("linkedin.com", true, "proxy"), rule("login.linkedin.com", false, "direct")];

    expect(findEffectiveDomainRule("login.linkedin.com", rules)).toMatchObject({
      type: "exact",
      rule: rule("login.linkedin.com", false, "direct")
    });
  });

  it("uses the most specific parent includeSubdomains rule", () => {
    const rules = [rule("linkedin.com", true, "proxy"), rule("media.linkedin.com", true, "direct")];

    expect(findEffectiveDomainRule("img.media.linkedin.com", rules)).toMatchObject({
      type: "parent",
      rule: rule("media.linkedin.com", true, "direct")
    });
  });

  it("uses the most recently created rule for equal specificity", () => {
    const older = rule("example.com", true, "proxy", "2026-06-24T00:00:00.000Z");
    const newer = rule("example.com", true, "direct", "2026-06-24T00:00:01.000Z");

    expect(findEffectiveDomainRule("sub.example.com", [older, newer])).toMatchObject({
      rule: newer
    });
  });

  it("allows a proxy child rule to override a broader direct parent rule", () => {
    const rules = [rule("linkedin.com", true, "direct"), rule("media.linkedin.com", true, "proxy")];

    expect(findEffectiveDomainRule("asset.media.linkedin.com", rules)).toMatchObject({
      type: "parent",
      rule: rule("media.linkedin.com", true, "proxy")
    });
  });
});

describe("findRedundantDomainRules", () => {
  it("suggests same-action child rules covered by a parent includeSubdomains rule", () => {
    const parent = rule("linkedin.com", true, "proxy");
    const child = rule("media.linkedin.com", true, "proxy");

    expect(findRedundantDomainRules([parent, child])).toEqual([
      {
        redundantRule: child,
        coveringRule: parent,
        redundantRuleIndex: 1,
        coveringRuleIndex: 0,
        reason: "linkedin.com already covers this proxy route for the domain and its subdomains.",
        safeToRemove: true
      }
    ]);
  });

  it("does not suggest override child rules with a different action", () => {
    expect(findRedundantDomainRules([rule("linkedin.com", true, "proxy"), rule("login.linkedin.com", false, "direct")])).toEqual([]);
    expect(findRedundantDomainRules([rule("linkedin.com", true, "direct"), rule("login.linkedin.com", false, "proxy")])).toEqual([]);
  });
});
