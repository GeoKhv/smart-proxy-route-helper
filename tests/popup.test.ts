import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  addCurrentSiteRule,
  getCurrentTabDomain,
  getDiagnosticActionStatus,
  getPopupRuleStatus,
  getRelatedDomainPreviewActionStatus,
  removeCurrentSiteRule
} from "../src/popup/popup";
import type { DomainRule } from "../src/rules/ruleTypes";

const createdAt = "2026-06-24T00:00:00.000Z";

function manualRule(domain: string, includeSubdomains = true): DomainRule {
  return {
    domain,
    includeSubdomains,
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

describe("popup current tab domain helpers", () => {
  it("extracts and normalizes supported http and https URLs", () => {
    expect(getCurrentTabDomain("https://Letterboxd.com/films/popular/")).toEqual({
      ok: true,
      domain: "letterboxd.com"
    });
    expect(getCurrentTabDomain("http://www.letterboxd.com:80/path")).toEqual({
      ok: true,
      domain: "www.letterboxd.com"
    });
  });

  it("rejects unsupported browser, file, and local URLs", () => {
    for (const url of ["chrome://extensions", "chrome-extension://abc/options.html", "file:///tmp/test.html", "about:blank"]) {
      expect(getCurrentTabDomain(url)).toMatchObject({ ok: false });
    }

    expect(getCurrentTabDomain("http://localhost:3000")).toMatchObject({
      ok: false,
      message: "Localhost cannot be routed."
    });
    expect(getCurrentTabDomain("https://router.local")).toMatchObject({
      ok: false,
      message: "Internal local domains cannot be routed."
    });
  });
});

describe("popup rule status helpers", () => {
  it("detects exact current-domain rules", () => {
    const settings = {
      rules: [manualRule("letterboxd.com", false)],
      denylist: []
    };

    expect(getPopupRuleStatus("letterboxd.com", settings)).toMatchObject({
      state: "exact",
      exactRule: manualRule("letterboxd.com", false)
    });
  });

  it("detects parent includeSubdomains routing conservatively", () => {
    const settings = {
      rules: [manualRule("example.com", true)],
      denylist: []
    };

    expect(getPopupRuleStatus("watch.example.com", settings)).toMatchObject({
      state: "inherited",
      parentRule: manualRule("example.com", true)
    });
  });

  it("reports stored denylist matches as blocked", () => {
    expect(
      getPopupRuleStatus("sub.blocked.example", {
        rules: [],
        denylist: ["blocked.example"]
      })
    ).toMatchObject({
      state: "blocked"
    });
  });
});

describe("popup add current site rule helper", () => {
  it("adds a synced manual proxy rule with subdomains included", () => {
    expect(addCurrentSiteRule([], "https://letterboxd.com/films", createdAt)).toEqual({
      ok: true,
      status: "added",
      domain: "letterboxd.com",
      rules: [manualRule("letterboxd.com", true)]
    });
  });

  it("adds a diagnostic-sourced rule only when the confirmation helper is called", () => {
    expect(addCurrentSiteRule([], "https://letterboxd.com/films", createdAt, "diagnostic")).toEqual({
      ok: true,
      status: "added",
      domain: "letterboxd.com",
      rules: [
        {
          ...manualRule("letterboxd.com", true),
          source: "diagnostic"
        }
      ]
    });
  });

  it("prevents duplicate exact-domain rules", () => {
    const rules = [manualRule("letterboxd.com", false)];

    expect(addCurrentSiteRule(rules, "letterboxd.com", createdAt)).toEqual({
      ok: true,
      status: "duplicate",
      domain: "letterboxd.com",
      rules
    });
  });

  it("does not add a redundant child rule when a parent includeSubdomains rule matches", () => {
    const rules = [manualRule("example.com", true)];

    expect(addCurrentSiteRule(rules, "watch.example.com", createdAt)).toEqual({
      ok: true,
      status: "inherited",
      domain: "watch.example.com",
      parentRule: manualRule("example.com", true),
      rules
    });
  });

  it("rejects denylisted and internal domains", () => {
    expect(addCurrentSiteRule([], "localhost", createdAt)).toMatchObject({
      ok: false,
      error: "Localhost cannot be routed."
    });
    expect(addCurrentSiteRule([], "10.0.0.1", createdAt)).toMatchObject({
      ok: false,
      error: "Private network addresses cannot be routed."
    });
  });
});

describe("popup diagnostic result messages", () => {
  it("offers saving only after a reachable check when no synced rule covers the current site", () => {
    expect(
      getDiagnosticActionStatus(
        {
          status: "proxy_reachable",
          message: "This site appears reachable through your local proxy.",
          domain: "letterboxd.com"
        },
        "letterboxd.com",
        {
          state: "none",
          message: "letterboxd.com is using the direct route unless another proxy setting applies."
        }
      )
    ).toEqual({
      message: "This site appears reachable through your local proxy. You can add it as a synced proxy route.",
      kind: "success",
      saveReachableDomain: "letterboxd.com"
    });
  });

  it("warns when an existing synced rule is covered but the proxy check fails", () => {
    expect(
      getDiagnosticActionStatus(
        {
          status: "proxy_unreachable",
          message: "This site did not appear reachable through your local proxy.",
          domain: "2ip.ru"
        },
        "2ip.ru",
        {
          state: "exact",
          exactRule: manualRule("2ip.ru", true),
          message: "2ip.ru is routed through proxy by an exact synced rule."
        }
      )
    ).toEqual({
      message:
        "A synced rule covers this site, but it did not appear reachable through your local proxy. Check your local proxy settings.",
      kind: "error"
    });
  });
});

describe("popup related-domain preview messages", () => {
  it("summarizes preview candidates without offering to save rules", () => {
    expect(
      getRelatedDomainPreviewActionStatus({
        status: "success",
        message: "2 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "letterboxd.com",
        collectedHosts: ["a.ltrbxd.com", "image.tmdb.org"],
        candidates: {
          currentDomain: "letterboxd.com",
          strongCandidates: [
            {
              domain: "ltrbxd.com",
              reason: "explicit-related-domain",
              sourceHosts: ["a.ltrbxd.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              defaultSelected: true
            }
          ],
          mediumCandidates: [
            {
              domain: "image.tmdb.org",
              reason: "third-party-resource",
              sourceHosts: ["image.tmdb.org"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ],
          ignoredCandidates: []
        }
      })
    ).toEqual({
      message: "Likely related: ltrbxd.com. Review manually: image.tmdb.org. No rules were saved.",
      kind: "success"
    });
  });

  it("maps preview collection failures to a non-saving neutral status", () => {
    expect(
      getRelatedDomainPreviewActionStatus({
        status: "collection_unavailable",
        message: "Could not collect resource hosts from this page.",
        currentDomain: "example.com"
      })
    ).toEqual({
      message: "Could not collect resource hosts from this page.",
      kind: "neutral"
    });
  });
});

describe("popup runtime boundaries", () => {
  it("does not call chrome.proxy.settings directly", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");

    expect(popupSource).not.toContain("chrome.proxy");
  });
});

describe("popup remove current site rule helper", () => {
  it("removes exact current-domain rules without mutating the input list", () => {
    const rules = [manualRule("letterboxd.com", false), manualRule("example.com", true)];

    expect(removeCurrentSiteRule(rules, "letterboxd.com")).toEqual({
      status: "removed",
      domain: "letterboxd.com",
      rules: [manualRule("example.com", true)]
    });
    expect(rules).toEqual([manualRule("letterboxd.com", false), manualRule("example.com", true)]);
  });

  it("does not remove parent includeSubdomains rules silently", () => {
    const rules = [manualRule("example.com", true)];

    expect(removeCurrentSiteRule(rules, "watch.example.com")).toEqual({
      status: "inherited",
      domain: "watch.example.com",
      parentRule: manualRule("example.com", true),
      rules
    });
  });
});
