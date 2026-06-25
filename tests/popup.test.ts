import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  addRelatedDomainClassificationOverride,
  addSelectedRelatedDomainRules,
  addCurrentSiteRule,
  buildRelatedDomainPopupView,
  getCurrentTabDomain,
  getDiagnosticActionStatus,
  getPopupRuleStatus,
  getRelatedDomainSaveActionStatus,
  getRelatedDomainPreviewActionStatus,
  groupRelatedDomainCandidateViews,
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
      message:
        "Related-domain preview found candidates. No rules were saved yet. Likely related: ltrbxd.com. Review manually: image.tmdb.org.",
      kind: "neutral"
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

  it("does not report no public hosts when LinkedIn-like reviewable hosts exist", () => {
    const status = getRelatedDomainPreviewActionStatus({
      status: "success",
      message: "4 public resource hosts checked for related-domain preview. No rules were saved.",
      currentDomain: "linkedin.com",
      collectedHosts: ["media.licdn.com", "static.licdn.com", "dms.licdn.com", "demdex.net"],
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
        ignoredCandidates: [
          {
            domain: "demdex.net",
            reason: "known-tracking-or-analytics",
            sourceHosts: ["dpm.demdex.net"],
            sourceHostCount: 1,
            suggestedIncludeSubdomains: false,
            defaultSelected: false
          }
        ]
      }
    });

    expect(status.message).toContain("Related-domain preview found candidates.");
    expect(status.message).toContain("Review manually: media.licdn.com, static.licdn.com");
    expect(status.message).not.toContain("No public resource hosts");
  });

  it("reports all-ignored previews separately from empty page collection", () => {
    expect(
      getRelatedDomainPreviewActionStatus({
        status: "success",
        message: "Resource hosts were found, but they look like analytics/adtech/local or schema helper domains. No rules were saved.",
        currentDomain: "linkedin.com",
        resultState: "hosts_collected_but_all_internal_or_ignored",
        summary: {
          rawEntriesInspected: 2,
          hostsExtracted: 2,
          hostsAfterSanitization: 2,
          hostsIgnoredOrInternal: 0,
          reviewableCandidates: 0,
          ignoredCandidates: 2
        },
        collectedHosts: ["local.adguard.org", "demdex.net"],
        candidates: {
          currentDomain: "linkedin.com",
          strongCandidates: [],
          mediumCandidates: [],
          ignoredCandidates: [
            {
              domain: "local.adguard.org",
              reason: "local-or-adblock-helper",
              sourceHosts: ["local.adguard.org"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            },
            {
              domain: "demdex.net",
              reason: "known-tracking-or-analytics",
              sourceHosts: ["dpm.demdex.net"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ]
        }
      })
    ).toEqual({
      message: "Resource hosts were found, but they look like analytics/adtech/local or schema helper domains. No rules were saved.",
      kind: "neutral"
    });
  });

  it("maps empty preview collection to no-resource wording", () => {
    expect(
      getRelatedDomainPreviewActionStatus({
        status: "success",
        message: "No page resource hosts were found. Try reloading the page, then preview again.",
        currentDomain: "linkedin.com",
        resultState: "no_resource_entries_collected",
        summary: {
          rawEntriesInspected: 0,
          hostsExtracted: 0,
          hostsAfterSanitization: 0,
          hostsIgnoredOrInternal: 0,
          reviewableCandidates: 0,
          ignoredCandidates: 0
        },
        collectedHosts: [],
        candidates: {
          currentDomain: "linkedin.com",
          strongCandidates: [],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      })
    ).toEqual({
      message: "No page resource hosts were found. Try reloading the page, then preview again.",
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
        suggestedRuleDomain: "ltrbxd.com",
        reasonCode: "explicit-related-domain",
        reason: "known related domain",
        routeTargetReasonLabel: "known related domain",
        sourceHosts: ["a.ltrbxd.com"],
        sourceHostCount: 1,
        includeSubdomains: true,
        defaultSelected: true,
        selected: true,
        saveable: true,
        alreadyCovered: false,
        overrideActions: ["ignore-globally", "ignore-for-site"]
      },
      {
        category: "medium",
        domain: "image.tmdb.org",
        suggestedRuleDomain: "image.tmdb.org",
        reasonCode: "third-party-resource",
        reason: "resource on current page",
        routeTargetReasonLabel: "resource on current page",
        sourceHosts: ["image.tmdb.org"],
        sourceHostCount: 1,
        includeSubdomains: false,
        defaultSelected: false,
        selected: false,
        saveable: true,
        alreadyCovered: false,
        overrideActions: ["ignore-globally", "ignore-for-site", "suggest-for-site"]
      },
      {
        category: "ignored",
        domain: "doubleclick.net",
        suggestedRuleDomain: "doubleclick.net",
        reasonCode: "known-tracking-or-analytics",
        reason: "analytics or tracking host",
        routeTargetReasonLabel: "analytics or tracking host",
        sourceHosts: ["doubleclick.net"],
        sourceHostCount: 1,
        includeSubdomains: false,
        defaultSelected: false,
        selected: false,
        saveable: false,
        alreadyCovered: false,
        overrideActions: ["review-globally", "suggest-for-site"]
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
    expect(groupRelatedDomainCandidateViews(view.candidates)).toMatchObject({
      strong: [],
      medium: [],
      alreadyCovered: [expect.objectContaining({ domain: "docs.github.com" })],
      ignored: []
    });
  });

  it("keeps LinkedIn media/static hosts saveable while exact covered hosts stay covered", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "5 resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "www.linkedin.com",
        resultState: "candidates_available",
        summary: {
          rawEntriesInspected: 7,
          hostsExtracted: 6,
          hostsAfterSanitization: 6,
          hostsIgnoredOrInternal: 1,
          reviewableCandidates: 4,
          ignoredCandidates: 1
        },
        collectedHosts: [
          "linkedin.com",
          "www.linkedin.com",
          "dms.licdn.com",
          "media.licdn.com",
          "static.licdn.com",
          "dpm.demdex.net"
        ],
        candidates: {
          currentDomain: "www.linkedin.com",
          strongCandidates: [
            {
              domain: "linkedin.com",
              reason: "same-site-subdomain",
              sourceHosts: ["linkedin.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              defaultSelected: true
            }
          ],
          mediumCandidates: [
            {
              domain: "dms.licdn.com",
              reason: "third-party-resource",
              sourceHosts: ["dms.licdn.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            },
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
          ignoredCandidates: [
            {
              domain: "demdex.net",
              reason: "known-tracking-or-analytics",
              sourceHosts: ["dpm.demdex.net"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ]
        }
      },
      {
        rules: [manualRule("linkedin.com", true), manualRule("www.linkedin.com", false), manualRule("dms.licdn.com", false)],
        denylist: []
      }
    );

    expect(view.message).toContain("Review manually: media.licdn.com, static.licdn.com");
    expect(view.message).toContain("2 already-covered candidates");
    expect(view.message).not.toContain("No public resource hosts");
    expect(view.resultState).toBe("candidates_available");
    expect(view.diagnosticSummary).toBeUndefined();
    expect(view.summary).toMatchObject({
      alreadyCoveredCandidates: 2,
      saveableCandidates: 2
    });
    expect(view.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "linkedin.com",
          saveable: false,
          alreadyCovered: true,
          coveredBy: "linkedin.com"
        }),
        expect.objectContaining({
          domain: "dms.licdn.com",
          saveable: false,
          alreadyCovered: true,
          coveredBy: "dms.licdn.com"
        }),
        expect.objectContaining({
          domain: "media.licdn.com",
          category: "medium",
          selected: false,
          saveable: true,
          alreadyCovered: false
        }),
        expect.objectContaining({
          domain: "static.licdn.com",
          category: "medium",
          selected: false,
          saveable: true,
          alreadyCovered: false
        }),
        expect.objectContaining({
          domain: "demdex.net",
          category: "ignored",
          saveable: false
        })
      ])
    );

    const groups = groupRelatedDomainCandidateViews(view.candidates);

    expect(groups.strong).toEqual([]);
    expect(groups.medium.map((candidate) => candidate.domain)).toEqual(["media.licdn.com", "static.licdn.com"]);
    expect(groups.alreadyCovered.map((candidate) => candidate.domain)).toEqual(["linkedin.com", "dms.licdn.com"]);
    expect(groups.alreadyCovered.every((candidate) => !candidate.saveable && !candidate.selected)).toBe(true);
    expect(groups.ignored.map((candidate) => candidate.domain)).toEqual(["demdex.net"]);
  });

  it("reports collected hosts as already covered when no saveable candidates remain", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "2 resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "linkedin.com",
        resultState: "candidates_available",
        summary: {
          rawEntriesInspected: 2,
          hostsExtracted: 2,
          hostsAfterSanitization: 2,
          hostsIgnoredOrInternal: 0,
          reviewableCandidates: 2,
          ignoredCandidates: 0,
          sampleHosts: ["media.licdn.com", "static.licdn.com"]
        },
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
        rules: [manualRule("media.licdn.com", false), manualRule("static.licdn.com", false)],
        denylist: []
      }
    );

    expect(view.resultState).toBe("hosts_collected_but_all_already_covered");
    expect(view.message).toBe("Resource hosts were found, but they are already covered by existing rules. No rules were saved.");
    expect(view.diagnosticSummary).toBe(
      "Preview details: 2 inspected; 0 performance; 0 DOM attributes; 2 URL-like values; 2 sanitized hosts; 0 ignored or internal; 2 already covered; 0 saveable. Hosts: media.licdn.com, static.licdn.com."
    );
    expect(view.summary).toMatchObject({
      alreadyCoveredCandidates: 2,
      saveableCandidates: 0
    });
    expect(view.candidates.every((candidate) => candidate.alreadyCovered && !candidate.saveable)).toBe(true);
  });

  it("keeps compact diagnostic summary when preview finds no saveable candidates", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "No page resource hosts were found. Try reloading the page, then preview again.",
        currentDomain: "linkedin.com",
        resultState: "no_resource_entries_collected",
        summary: {
          rawEntriesInspected: 4,
          performanceEntriesInspected: 1,
          domAttributesInspected: 3,
          urlLikeValuesFound: 0,
          hostsExtracted: 0,
          hostsAfterSanitization: 0,
          hostsIgnoredOrInternal: 0,
          reviewableCandidates: 0,
          ignoredCandidates: 0,
          sampleHosts: []
        },
        collectedHosts: [],
        candidates: {
          currentDomain: "linkedin.com",
          strongCandidates: [],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      },
      {
        rules: [],
        denylist: []
      }
    );

    expect(view.candidates).toEqual([]);
    expect(view.summary).toMatchObject({
      saveableCandidates: 0,
      alreadyCoveredCandidates: 0
    });
    expect(view.diagnosticSummary).toBe(
      "Preview details: 4 inspected; 1 performance; 3 DOM attributes; 0 URL-like values; 0 sanitized hosts; 0 ignored or internal; 0 already covered; 0 saveable."
    );
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
    expect(view.hiddenAlreadyCoveredCount).toBe(0);
    expect(view.hiddenIgnoredCount).toBe(2);
  });
});

describe("popup related-domain selected save helper", () => {
  it("creates classification overrides without creating route rules", () => {
    const result = addRelatedDomainClassificationOverride(
      {
        global: {},
        site: {}
      },
      "https://Letterboxd.com/films",
      "https://image.tmdb.org/t/p/w500/poster.jpg?token=secret",
      "suggest-for-site"
    );

    expect(result).toEqual({
      ok: true,
      classificationOverrides: {
        global: {},
        site: {
          "letterboxd.com": {
            "image.tmdb.org": "suggested"
          }
        }
      },
      override: {
        domain: "image.tmdb.org",
        siteDomain: "letterboxd.com",
        action: "suggest-for-site"
      }
    });
    expect(JSON.stringify(result)).not.toContain("/t/p/w500");
    expect(JSON.stringify(result)).not.toContain("token=secret");
    expect(JSON.stringify(result)).not.toContain("rules");
  });

  it("rejects internal or private override domains before storage writes", () => {
    expect(
      addRelatedDomainClassificationOverride(
        {
          global: {},
          site: {}
        },
        "example.com",
        "http://192.168.1.1/status",
        "ignore-globally"
      )
    ).toMatchObject({
      ok: false
    });
  });

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

  it("saves the suggested ChatGPT related base instead of the observed generated host", () => {
    const existingGeneratedHostRule = manualRule("sdmntpritalynorth.oaiusercontent.com", false);
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "1 public resource host checked for related-domain preview. No rules were saved.",
        currentDomain: "chatgpt.com",
        collectedHosts: ["sdmntpritalynorth.oaiusercontent.com"],
        candidates: {
          currentDomain: "chatgpt.com",
          strongCandidates: [
            {
              domain: "oaiusercontent.com",
              suggestedRuleDomain: "oaiusercontent.com",
              reason: "explicit-related-domain",
              sourceHosts: ["sdmntpritalynorth.oaiusercontent.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              routeTargetReason: "known-related-domain",
              routeTargetConfidence: "high",
              defaultSelected: true
            }
          ],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      },
      {
        rules: [existingGeneratedHostRule],
        denylist: []
      }
    );

    expect(view.candidates[0]).toMatchObject({
      domain: "oaiusercontent.com",
      sourceHosts: ["sdmntpritalynorth.oaiusercontent.com"],
      includeSubdomains: true,
      saveable: true,
      alreadyCovered: false,
      selected: true
    });

    expect(
      addSelectedRelatedDomainRules(
        {
          rules: [existingGeneratedHostRule],
          denylist: []
        },
        view.candidates,
        new Set(["oaiusercontent.com"]),
        createdAt
      )
    ).toEqual({
      ok: true,
      status: "added",
      rules: [
        existingGeneratedHostRule,
        {
          domain: "oaiusercontent.com",
          includeSubdomains: true,
          mode: "proxy",
          source: "diagnostic",
          createdAt
        }
      ],
      addedRules: [
        {
          domain: "oaiusercontent.com",
          includeSubdomains: true,
          mode: "proxy",
          source: "diagnostic",
          createdAt
        }
      ],
      skippedDomains: []
    });
  });

  it("treats the suggested includeSubdomains route target as already covered when the base rule exists", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "1 public resource host checked for related-domain preview. No rules were saved.",
        currentDomain: "chatgpt.com",
        collectedHosts: ["files.oaiusercontent.com"],
        candidates: {
          currentDomain: "chatgpt.com",
          strongCandidates: [
            {
              domain: "oaiusercontent.com",
              suggestedRuleDomain: "oaiusercontent.com",
              reason: "explicit-related-domain",
              sourceHosts: ["files.oaiusercontent.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: true,
              routeTargetReason: "known-related-domain",
              routeTargetConfidence: "high",
              defaultSelected: true
            }
          ],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      },
      {
        rules: [manualRule("oaiusercontent.com", true)],
        denylist: []
      }
    );

    expect(view.candidates[0]).toMatchObject({
      domain: "oaiusercontent.com",
      saveable: false,
      alreadyCovered: true,
      coveredBy: "oaiusercontent.com",
      selected: false
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

  it("does not save already-covered candidates even if a caller selects them", () => {
    const view = buildRelatedDomainPopupView(
      {
        status: "success",
        message: "2 public resource hosts checked for related-domain preview. No rules were saved.",
        currentDomain: "linkedin.com",
        collectedHosts: ["dms.licdn.com", "media.licdn.com"],
        candidates: {
          currentDomain: "linkedin.com",
          strongCandidates: [],
          mediumCandidates: [
            {
              domain: "dms.licdn.com",
              reason: "third-party-resource",
              sourceHosts: ["dms.licdn.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            },
            {
              domain: "media.licdn.com",
              reason: "third-party-resource",
              sourceHosts: ["media.licdn.com"],
              sourceHostCount: 1,
              suggestedIncludeSubdomains: false,
              defaultSelected: false
            }
          ],
          ignoredCandidates: []
        }
      },
      {
        rules: [manualRule("dms.licdn.com", false)],
        denylist: []
      }
    );

    expect(groupRelatedDomainCandidateViews(view.candidates).medium.map((candidate) => candidate.domain)).toEqual([
      "media.licdn.com"
    ]);

    expect(
      addSelectedRelatedDomainRules(
        {
          rules: [manualRule("dms.licdn.com", false)],
          denylist: []
        },
        view.candidates,
        new Set(["dms.licdn.com", "media.licdn.com"]),
        createdAt
      )
    ).toEqual({
      ok: true,
      status: "added",
      rules: [
        manualRule("dms.licdn.com", false),
        {
          domain: "media.licdn.com",
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
        }
      ],
      skippedDomains: ["dms.licdn.com"]
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

  it("formats explicit save completion as success only after selected rules are added", () => {
    expect(
      getRelatedDomainSaveActionStatus({
        ok: true,
        status: "added",
        rules: [manualRule("media.licdn.com", false)],
        addedRules: [manualRule("media.licdn.com", false)],
        skippedDomains: []
      })
    ).toEqual({
      message: "Added synced proxy route for media.licdn.com.",
      kind: "success"
    });

    expect(
      getRelatedDomainSaveActionStatus({
        ok: true,
        status: "none-selected",
        rules: [],
        addedRules: [],
        skippedDomains: []
      })
    ).toMatchObject({
      kind: "neutral"
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
      popupSource.indexOf("async function handleRelatedDomainClassificationOverride")
    );
    const saveHandler = popupSource.slice(
      popupSource.indexOf("async function handleAddSelectedRelatedDomains"),
      popupSource.indexOf("async function handleSaveDiagnosticRule")
    );

    expect(previewHandler).not.toContain("updateSyncSettings");
    expect(previewHandler).not.toContain("setSyncSettings");
    expect(saveHandler).toContain("updateSyncSettings");
  });

  it("saves classification overrides separately from route rules and refreshes preview", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");
    const overrideHandler = popupSource.slice(
      popupSource.indexOf("async function handleRelatedDomainClassificationOverride"),
      popupSource.indexOf("async function handleAddSelectedRelatedDomains")
    );

    expect(overrideHandler).toContain("classificationOverrides: addResult.classificationOverrides");
    expect(overrideHandler).not.toContain("rules:");
    expect(overrideHandler).toContain("loadRelatedDomainPreview");
    expect(overrideHandler).toContain("successKind: \"success\"");
  });

  it("marks selected related-domain rows with a visible styling state", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");
    const popupHtml = await readFile(resolve(__dirname, "../src/popup/popup.html"), "utf8");

    expect(popupSource).toContain('row.dataset.selected = candidate.selected && candidate.saveable ? "true" : "false"');
    expect(popupSource).toContain('const row = document.createElement("div")');
    expect(popupSource).toContain("if (candidate.saveable)");
    expect(popupSource).toContain("updateCandidateRowSelection(row, checkbox)");
    expect(popupSource).toContain("button[data-override-action]");
    expect(popupHtml).toContain('.candidate-row[data-selected="true"]');
    expect(popupHtml).toContain(".candidate-action");
    expect(popupHtml).toContain("accent-color: Highlight");
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
