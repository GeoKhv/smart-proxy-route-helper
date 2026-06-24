import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  addSelectedRelatedDomainRules,
  addCurrentSiteRule,
  buildRelatedDomainPopupView,
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

describe("popup related-domain candidate view model", () => {
  it("maps candidates to compact selectable popup rows", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "3 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "letterboxd.com",
        collectedHosts: ["a.ltrbxd.com", "image.tmdb.org", "doubleclick.net"],
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
          ignoredCandidates: [
            {
              domain: "doubleclick.net",
              reason: "known-tracking-or-analytics",
              sourceHosts: ["doubleclick.net"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ]
        }
      },
      {
        rules: [],
        denylist: []
      }
    );

    expect(view.candidates).toEqual([
      {
        category: "strong",
        domain: "ltrbxd.com",
        reasonCode: "explicit-related-domain",
        reason: "known related domain",
        sourceHostCount: 1,
        includeSubdomains: true,
        defaultSelected: true,
        selected: true,
        saveable: true,
        alreadyCovered: false
      },
      {
        category: "medium",
        domain: "image.tmdb.org",
        reasonCode: "third-party-resource",
        reason: "resource on current page",
        sourceHostCount: 1,
        includeSubdomains: false,
        defaultSelected: false,
        selected: false,
        saveable: true,
        alreadyCovered: false
      },
      {
        category: "ignored",
        domain: "doubleclick.net",
        reasonCode: "known-tracking-or-analytics",
        reason: "analytics or tracking host",
        sourceHostCount: 1,
        includeSubdomains: false,
        defaultSelected: false,
        selected: false,
        saveable: false,
        alreadyCovered: false
      }
    ]);
  });

  it("never selects medium candidates by default", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "1 public resource host checked for related-domain preview. No rules were saved.",
        currentDomain: "linkedin.com",
        collectedHosts: ["media.licdn.com"],
        candidates: {
          currentDomain: "linkedin.com",
          strongCandidates: [],
          mediumCandidates: [
            {
              domain: "media.licdn.com",
              reason: "third-party-resource",
              sourceHosts: ["media.licdn.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: true
            }
          ],
          ignoredCandidates: []
        }
      },
      {
        rules: [],
        denylist: []
      }
    );

    expect(view.candidates[0]).toMatchObject({
      domain: "media.licdn.com",
      category: "medium",
      defaultSelected: false,
      selected: false,
      saveable: true
    });
  });

  it("marks already-covered candidates and prevents default selection", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "1 public resource host checked for related-domain preview. No rules were saved.",
        currentDomain: "github.com",
        collectedHosts: ["docs.github.com"],
        candidates: {
          currentDomain: "github.com",
          strongCandidates: [
            {
              domain: "docs.github.com",
              reason: "same-site-subdomain",
              sourceHosts: ["docs.github.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              defaultSelected: true
            }
          ],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      },
      {
        rules: [manualRule("github.com", true)],
        denylist: []
      }
    );

    expect(view.candidates[0]).toMatchObject({
      domain: "docs.github.com",
      selected: false,
      saveable: false,
      alreadyCovered: true,
      coveredBy: "github.com"
    });
  });

  it("rejects denylisted, internal, and private candidates before display", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "4 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "example.com",
        collectedHosts: ["localhost", "192.168.1.1", "router.local", "blocked.example"],
        candidates: {
          currentDomain: "example.com",
          strongCandidates: [
            {
              domain: "localhost",
              reason: "same-site-subdomain",
              sourceHosts: ["localhost"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              defaultSelected: true
            },
            {
              domain: "192.168.1.1",
              reason: "same-site-subdomain",
              sourceHosts: ["192.168.1.1"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              defaultSelected: true
            },
            {
              domain: "router.local",
              reason: "same-site-subdomain",
              sourceHosts: ["router.local"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              defaultSelected: true
            },
            {
              domain: "blocked.example",
              reason: "third-party-resource",
              sourceHosts: ["blocked.example"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      },
      {
        rules: [],
        denylist: ["blocked.example"]
      }
    );

    expect(view.candidates).toEqual([]);
  });

  it("caps reviewable and ignored candidates for a compact popup", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "20 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "example.com",
        collectedHosts: [],
        candidates: {
          currentDomain: "example.com",
          strongCandidates: [],
          mediumCandidates: Array.from({ length: 14 }, (_value, index) => ({
            domain: `cdn${index}.example.net`,
            reason: "third-party-resource" as const,
            sourceHosts: [`cdn${index}.example.net`],
            sourceHostCount: 1,
            suggestedIncludeSubdomains: false,
            defaultSelected: false
          })),
          ignoredCandidates: Array.from({ length: 6 }, (_value, index) => ({
            domain: `ignored${index}.example.net`,
            reason: "shared-infrastructure" as const,
            sourceHosts: [`ignored${index}.example.net`],
            sourceHostCount: 1,
            suggestedIncludeSubdomains: false,
            defaultSelected: false
          }))
        }
      },
      {
        rules: [],
        denylist: []
      }
    );

    expect(view.candidates.filter((candidate) => candidate.category !== "ignored")).toHaveLength(12);
    expect(view.candidates.filter((candidate) => candidate.category === "ignored")).toHaveLength(4);
    expect(view.hiddenSaveableCount).toBe(2);
    expect(view.hiddenIgnoredCount).toBe(2);
  });
});

describe("popup related-domain selected save helper", () => {
  it("adds only explicitly selected candidates as diagnostic-sourced rules", () => {
    const candidates = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "2 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "linkedin.com",
        collectedHosts: ["media.licdn.com", "static.licdn.com"],
        candidates: {
          currentDomain: "linkedin.com",
          strongCandidates: [],
          mediumCandidates: [
            {
              domain: "media.licdn.com",
              reason: "third-party-resource",
              sourceHosts: ["media.licdn.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            },
            {
              domain: "static.licdn.com",
              reason: "third-party-resource",
              sourceHosts: ["static.licdn.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ],
          ignoredCandidates: []
        }
      },
      {
        rules: [],
        denylist: []
      }
    ).candidates;

    expect(
      addSelectedRelatedDomainRules(
        {
          rules: [],
          denylist: []
        },
        candidates,
        new Set(["media.licdn.com", "static.licdn.com"]),
        createdAt
      )
    ).toEqual({
      ok: true,
      status: "added",
      rules: [
        {
          domain: "media.licdn.com",
          includeSubdomains: false,
          mode: "proxy",
          source: "diagnostic",
          createdAt
        },
        {
          domain: "static.licdn.com",
          includeSubdomains: false,
          mode: "proxy",
          source: "diagnostic",
          createdAt
        }
      ],
      addedRules: [
        {
          domain: "media.licdn.com",
          includeSubdomains: false,
          mode: "proxy",
          source: "diagnostic",
          createdAt
        },
        {
          domain: "static.licdn.com",
          includeSubdomains: false,
          mode: "proxy",
          source: "diagnostic",
          createdAt
        }
      ],
      skippedDomains: []
    });
  });

  it("prevents duplicates and parent-covered additions at save time", () => {
    const candidates = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "2 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "github.com",
        collectedHosts: ["docs.github.com", "assets.github.io"],
        candidates: {
          currentDomain: "github.com",
          strongCandidates: [],
          mediumCandidates: [
            {
              domain: "docs.github.com",
              reason: "third-party-resource",
              sourceHosts: ["docs.github.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            },
            {
              domain: "assets.github.io",
              reason: "third-party-resource",
              sourceHosts: ["assets.github.io"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ],
          ignoredCandidates: []
        }
      },
      {
        rules: [],
        denylist: []
      }
    ).candidates;

    expect(
      addSelectedRelatedDomainRules(
        {
          rules: [manualRule("github.com", true), manualRule("assets.github.io", false)],
          denylist: []
        },
        candidates,
        new Set(["docs.github.com", "assets.github.io"]),
        createdAt
      )
    ).toEqual({
      ok: true,
      status: "no-new-rules",
      rules: [manualRule("github.com", true), manualRule("assets.github.io", false)],
      addedRules: [],
      skippedDomains: ["docs.github.com", "assets.github.io"]
    });
  });

  it("does not save ignored candidates even if a caller selects them", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "1 public resource host checked for related-domain preview. No rules were saved.",
        currentDomain: "example.com",
        collectedHosts: ["doubleclick.net"],
        candidates: {
          currentDomain: "example.com",
          strongCandidates: [],
          mediumCandidates: [],
          ignoredCandidates: [
            {
              domain: "doubleclick.net",
              reason: "known-tracking-or-analytics",
              sourceHosts: ["doubleclick.net"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ]
        }
      },
      {
        rules: [],
        denylist: []
      }
    );

    expect(
      addSelectedRelatedDomainRules(
        {
          rules: [],
          denylist: []
        },
        view.candidates,
        new Set(["doubleclick.net"]),
        createdAt
      )
    ).toEqual({
      ok: true,
      status: "no-new-rules",
      rules: [],
      addedRules: [],
      skippedDomains: ["doubleclick.net"]
    });
  });

  it("does not write rules when nothing is selected", () => {
    const existingRules = [manualRule("example.com", true)];

    expect(
      addSelectedRelatedDomainRules(
        {
          rules: existingRules,
          denylist: []
        },
        [],
        new Set(),
        createdAt
      )
    ).toEqual({
      ok: true,
      status: "none-selected",
      rules: existingRules,
      addedRules: [],
      skippedDomains: []
    });
  });
});

describe("popup runtime boundaries", () => {
  it("does not call chrome.proxy.settings directly", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");

    expect(popupSource).not.toContain("chrome.proxy");
  });

  it("keeps storage writes out of the preview handler and inside the explicit save handler", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");
    const previewHandler = popupSource.slice(
      popupSource.indexOf("async function handlePreviewRelatedDomains"),
      popupSource.indexOf("async function handleAddSelectedRelatedDomains")
    );
    const saveHandler = popupSource.slice(
      popupSource.indexOf("async function handleAddSelectedRelatedDomains"),
      popupSource.indexOf("async function handleSaveDiagnosticRule")
    );

    expect(previewHandler).not.toContain("updateSyncSettings");
    expect(previewHandler).not.toContain("setSyncSettings");
    expect(saveHandler).toContain("updateSyncSettings");
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
