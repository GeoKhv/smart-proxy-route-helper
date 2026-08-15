import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  addCurrentSiteRule,
  buildRelatedDomainRecordingControlView,
  getCurrentTabDomain,
  getDiagnosticActionStatus,
  getPopupRouteStatusView,
  getPopupRuleStatus,
  getRelatedDomainPreviewActionStatus,
  isRelatedDomainPreviewCurrent,
  removeCurrentSiteRule,
} from "../src/popup/popup";
import { getRuleStableId, replaceRuleAtomically } from "../src/rules/ruleEditing";
import type { DomainRule } from "../src/rules/ruleTypes";

const createdAt = "2026-06-24T00:00:00.000Z";
const availableLocalProxy = {
  enabled: true,
  config: {
    scheme: "socks5" as const,
    host: "127.0.0.1",
    port: 10808
  }
};

function manualRule(domain: string, includeSubdomains = true): DomainRule {
  return {
    domain,
    includeSubdomains,
    action: "proxy",
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

function directRule(domain: string, includeSubdomains = true): DomainRule {
  return {
    ...manualRule(domain, includeSubdomains),
    action: "direct"
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
      domain: "letterboxd.com"
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

  it("keeps a standard WWW related-domain preview bound to its canonical site", () => {
    expect(isRelatedDomainPreviewCurrent("www.google.com", "google.com")).toBe(true);
    expect(isRelatedDomainPreviewCurrent("google.com", "www.google.com")).toBe(true);
    expect(isRelatedDomainPreviewCurrent("www1.google.com", "google.com")).toBe(false);
    expect(isRelatedDomainPreviewCurrent("deep.www.google.com", "google.com")).toBe(false);
    expect(isRelatedDomainPreviewCurrent("google.com", null)).toBe(false);
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

  it("reports canonical WWW exact and parent route status", () => {
    expect(
      getPopupRuleStatus("www.linkedin.com", {
        rules: [directRule("linkedin.com", false)],
        denylist: []
      })
    ).toMatchObject({
      state: "exact",
      action: "direct",
      exactRule: directRule("linkedin.com", false)
    });

    expect(
      getPopupRuleStatus("img.media.linkedin.com", {
        rules: [manualRule("linkedin.com", true), directRule("media.linkedin.com", true)],
        denylist: []
      })
    ).toMatchObject({
      state: "inherited",
      action: "direct",
      parentRule: directRule("media.linkedin.com", true)
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

  it("maps exact, parent, direct, and default matches to distinct prominent route states", () => {
    expect(
      getPopupRouteStatusView(
        "child.example.com",
        { rules: [manualRule("child.example.com", false)], denylist: [] },
        availableLocalProxy
      )
    ).toEqual({
      routeState: "proxy_exact",
      appearance: "proxy",
      label: "Through proxy",
      explanation: "Exact rule for child.example.com",
      ariaLabel: "Through proxy. Exact rule for child.example.com"
    });
    expect(
      getPopupRouteStatusView(
        "child.example.com",
        { rules: [manualRule("example.com", true)], denylist: [] },
        availableLocalProxy
      )
    ).toMatchObject({
      routeState: "proxy_parent",
      label: "Through proxy",
      explanation: "Covered by parent rule example.com"
    });
    expect(
      getPopupRouteStatusView(
        "child.example.com",
        { rules: [directRule("child.example.com", false)], denylist: [] },
        availableLocalProxy
      )
    ).toMatchObject({
      routeState: "direct_exact",
      appearance: "direct",
      label: "Direct",
      explanation: "Exact direct rule for child.example.com"
    });
    expect(
      getPopupRouteStatusView(
        "child.example.com",
        { rules: [directRule("example.com", true)], denylist: [] },
        availableLocalProxy
      )
    ).toMatchObject({
      routeState: "direct_parent",
      label: "Direct",
      explanation: "Direct through parent rule example.com"
    });
    expect(
      getPopupRouteStatusView("child.example.com", { rules: [], denylist: [] }, availableLocalProxy)
    ).toEqual({
      routeState: "default_direct",
      appearance: "not-configured",
      label: "Not configured",
      explanation: "No matching rule. Default route is direct.",
      ariaLabel: "Not configured. No matching rule. Default route is direct."
    });
  });

  it("shows a warning instead of a healthy proxy state when local proxy settings are unavailable", () => {
    expect(
      getPopupRouteStatusView(
        "child.example.com",
        { rules: [manualRule("example.com", true)], denylist: [] },
        { enabled: false, config: null }
      )
    ).toEqual({
      routeState: "proxy_parent",
      appearance: "warning",
      label: "Proxy unavailable",
      explanation: "Covered by parent rule example.com. Local proxy is disabled or invalid on this device.",
      ariaLabel:
        "Warning: Proxy unavailable. Covered by parent rule example.com. Local proxy is disabled or invalid on this device."
    });
  });

  it("shows unresolved same-target actions as a conflict while preserving the deterministic winner", () => {
    const proxy = {
      ...manualRule("routing-test.test", true),
      createdAt: "2026-07-13T10:00:00.000Z"
    };
    const direct = {
      ...directRule("routing-test.test", true),
      createdAt: "2026-07-13T10:01:00.000Z"
    };
    const settings = { rules: [proxy, direct], denylist: [] };

    expect(getPopupRuleStatus("child.routing-test.test", settings)).toMatchObject({
      state: "conflict",
      action: "direct",
      effectiveRule: direct,
      matchType: "parent"
    });
    expect(getPopupRouteStatusView("child.routing-test.test", settings, availableLocalProxy)).toEqual({
      routeState: "conflict",
      appearance: "warning",
      label: "Conflicting rules",
      explanation:
        "Direct is currently effective through parent target routing-test.test. Resolve this configuration in Options.",
      ariaLabel:
        "Warning: Conflicting rules. Direct is currently effective through parent target routing-test.test. Resolve this configuration in Options."
    });
  });

  it("refreshes from exact Proxy to parent-covered Proxy immediately after atomic scope expansion", () => {
    const exactRule = {
      ...manualRule("child.example.com", false),
      id: "popup-scope-rule"
    };
    const replacement = replaceRuleAtomically([exactRule], getRuleStableId(exactRule), {
      domain: "example.com",
      includeSubdomains: true,
      action: "proxy"
    });

    expect(replacement).toMatchObject({ ok: true });

    if (!replacement.ok) {
      throw new Error(replacement.error);
    }

    expect(
      getPopupRouteStatusView(
        "child.example.com",
        { rules: replacement.rules, denylist: [] },
        availableLocalProxy
      )
    ).toMatchObject({
      routeState: "proxy_parent",
      label: "Through proxy",
      explanation: "Covered by parent rule example.com"
    });
  });
});

describe("popup add current site rule helper", () => {
  it("defaults a current-site proxy rule to hostname and subdomains", () => {
    expect(addCurrentSiteRule([], "https://letterboxd.com/films", createdAt)).toEqual({
      ok: true,
      status: "added",
      domain: "letterboxd.com",
      action: "proxy",
      includeSubdomains: true,
      rules: [manualRule("letterboxd.com", true)]
    });
  });

  it("canonicalizes www quick actions while retaining the default subdomain scope", () => {
    expect(addCurrentSiteRule([], "https://www.linkedin.com/feed", createdAt)).toEqual({
      ok: true,
      status: "added",
      domain: "linkedin.com",
      action: "proxy",
      includeSubdomains: true,
      rules: [manualRule("linkedin.com", true)]
    });
  });

  it("does not add an opposite-action current-site rule at the default scope", () => {
    expect(addCurrentSiteRule([manualRule("linkedin.com", true)], "https://www.linkedin.com/feed", createdAt, "manual", "direct")).toMatchObject({
      ok: false,
      reason: "conflict",
      existingRule: manualRule("linkedin.com", true)
    });
  });

  it("adds a diagnostic-sourced rule only when the confirmation helper is called", () => {
    expect(addCurrentSiteRule([], "https://letterboxd.com/films", createdAt, "diagnostic")).toEqual({
      ok: true,
      status: "added",
      domain: "letterboxd.com",
      action: "proxy",
      includeSubdomains: true,
      rules: [
        {
          ...manualRule("letterboxd.com", true),
          source: "diagnostic"
        }
      ]
    });
  });

  it("prevents duplicate exact-domain rules", () => {
    const rules = [manualRule("letterboxd.com", true)];

    expect(addCurrentSiteRule(rules, "letterboxd.com", createdAt)).toEqual({
      ok: true,
      status: "duplicate",
      domain: "letterboxd.com",
      action: "proxy",
      includeSubdomains: true,
      rules
    });
  });

  it("prevents a standard WWW duplicate of an apex exact rule", () => {
    const rules = [manualRule("example.com", true)];

    expect(addCurrentSiteRule(rules, "www.example.com", createdAt)).toMatchObject({
      ok: true,
      status: "duplicate",
      domain: "example.com",
      rules
    });
  });

  it("does not append an opposite action for an existing exact route target", () => {
    const existing = directRule("routing-test.test", true);

    expect(addCurrentSiteRule([existing], "routing-test.test", createdAt, "manual", "proxy")).toMatchObject({
      ok: false,
      reason: "conflict",
      existingRule: existing,
      error: "A Direct rule already exists for this hostname and scope. Edit existing rule instead."
    });
    expect(addCurrentSiteRule([existing], "routing-test.test", createdAt, "diagnostic", "proxy")).toMatchObject({
      ok: false,
      reason: "conflict"
    });
  });

  it("does not add a redundant child rule when a same-action parent includeSubdomains rule matches", () => {
    const rules = [manualRule("example.com", true)];

    expect(addCurrentSiteRule(rules, "watch.example.com", createdAt)).toEqual({
      ok: true,
      status: "inherited",
      domain: "watch.example.com",
      action: "proxy",
      includeSubdomains: true,
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
          action: "proxy",
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

  it("explains the privacy-preserving visibility limit when recording captures nothing", () => {
    expect(
      getRelatedDomainPreviewActionStatus({
        status: "success",
        message: "No request hostnames were captured during this session.",
        captureMode: "recording",
        currentDomain: "chatgpt.com",
        resultState: "no_resource_entries_collected",
        summary: {
          rawEntriesInspected: 0,
          requestInitiationsInspected: 0,
          hostsExtracted: 0,
          hostsAfterSanitization: 0,
          hostsIgnoredOrInternal: 0,
          reviewableCandidates: 0,
          ignoredCandidates: 0
        },
        collectedHosts: [],
        candidates: {
          currentDomain: "chatgpt.com",
          strongCandidates: [],
          mediumCandidates: [],
          ignoredCandidates: []
        }
      })
    ).toEqual({
      message:
        "No request hostnames were captured during this session. Some worker, service-worker, or browser-level requests may be outside this privacy-preserving recorder.",
      kind: "neutral"
    });
  });
});

describe("popup related-domain recording controls", () => {
  it("shows start when no recording is active", () => {
    expect(buildRelatedDomainRecordingControlView({ status: "idle" }, 1)).toEqual({
      startVisible: true,
      stopVisible: false,
      cancelVisible: false,
      kind: "neutral"
    });
  });

  it("shows stop and cancel for the recorded tab", () => {
    expect(
      buildRelatedDomainRecordingControlView(
        {
          status: "recording",
          tabId: 3,
          currentDomain: "chatgpt.com",
          startedAt: 1,
          expiresAt: 121,
          maxDurationMs: 120
        },
        3
      )
    ).toMatchObject({
      startVisible: false,
      stopVisible: true,
      cancelVisible: true,
      kind: "neutral",
      message: "Diagnostic recording is active for chatgpt.com. No data is saved until you use an add action."
    });
  });

  it("allows cancellation from another tab without offering stop-and-preview", () => {
    expect(
      buildRelatedDomainRecordingControlView(
        {
          status: "recording",
          tabId: 3,
          currentDomain: "chatgpt.com",
          startedAt: 1,
          expiresAt: 121,
          maxDurationMs: 120
        },
        4
      )
    ).toMatchObject({
      startVisible: false,
      stopVisible: false,
      cancelVisible: true,
      kind: "neutral"
    });
  });

  it("keeps expired recordings previewable from the recorded tab", () => {
    expect(
      buildRelatedDomainRecordingControlView(
        {
          status: "expired",
          tabId: 3,
          currentDomain: "chatgpt.com",
          startedAt: 1,
          expiresAt: 121,
          maxDurationMs: 120
        },
        3
      )
    ).toMatchObject({
      startVisible: false,
      stopVisible: true,
      cancelVisible: true,
      message: "Diagnostic recording for chatgpt.com auto-expired. Stop and preview captured hosts, or cancel it."
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
      popupSource.indexOf("async function handleAddRelatedDomains"),
      popupSource.indexOf("async function handleSaveDiagnosticRule")
    );

    expect(previewHandler).not.toContain("updateSyncSettings");
    expect(previewHandler).not.toContain("setSyncSettings");
    expect(saveHandler).toContain("addSyncRules");
  });

  it("saves classification overrides separately from route rules and refreshes preview", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");
    const overrideHandler = popupSource.slice(
      popupSource.indexOf("async function handleRelatedDomainClassificationOverride"),
      popupSource.indexOf("function renderRelatedDomainAddResult")
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
    expect(popupSource).toContain("button.dataset.overrideAction");
    expect(popupSource).toContain("relatedDomainAddActionLabel(candidate)");
    expect(popupSource).toContain('addButton.dataset.relatedDomainAdd = candidate.domain');
    expect(popupSource).toContain('addButton.dataset.relatedDomainBatchAdd = "true"');
    expect(popupSource).toContain('summary.setAttribute("aria-expanded", "false")');
    expect(popupSource).toContain('summary.setAttribute("aria-controls", actionsId)');
    expect(popupSource).toContain('backButton.textContent = getMessage("popupRelatedBack")');
    expect(popupHtml).toContain('.candidate-row[data-selected="true"]');
    expect(popupHtml).toContain(".candidate-batch-panel");
    expect(popupHtml).toContain("position: sticky");
    expect(popupHtml).toContain(".candidate-more-actions");
    expect(popupHtml).toContain(".candidate-action");
    expect(popupHtml).toContain("accent-color: Highlight");
    expect(popupHtml).not.toContain('id="add-selected-related-domains"');
    expect(popupHtml).not.toContain(">Add selected domains</button>");
  });

  it("pins the popup root width without adding a fixed height", async () => {
    const popupHtml = await readFile(resolve(__dirname, "../src/popup/popup.html"), "utf8");

    expect(popupHtml).toContain(`html,
      body {
        width: 330px;
        min-width: 330px;
        max-width: 330px;
      }

      html {
        overflow-x: hidden;
      }`);
  });

  it("exposes text, aria status, exact-host microcopy, and explicit scope confirmation controls", async () => {
    const popupSource = await readFile(resolve(__dirname, "../src/popup/popup.ts"), "utf8");
    const popupHtml = await readFile(resolve(__dirname, "../src/popup/popup.html"), "utf8");

    expect(popupHtml).toContain('data-i18n="popupProxyThisHostname"');
    expect(popupHtml).toContain('data-i18n="popupDirectThisHostname"');
    expect(popupHtml).toContain('data-i18n="popupNewRuleScopeCopy"');
    expect(popupHtml).toContain('id="change-current-site-scope"');
    expect(popupHtml).toContain('id="confirm-scope-change"');
    expect(popupHtml).toContain('role="status"');
    expect(popupHtml).toContain("route-status-indicator");
    expect(popupSource).toContain('container.setAttribute("aria-label", view.ariaLabel)');
    expect(popupSource).toContain('routeStatus.setAttribute("aria-label", result.message)');
    expect(popupSource).toContain("updateSyncRule(plan.ruleId, plan.proposedRule)");
    expect(popupSource).toContain("renderSupported(currentDomain.domain, updateResult.settings)");
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

  it("removes only the effective exact rule when proxy and direct exact rules coexist", () => {
    const olderProxyRule = manualRule("example.com", false);
    const newerDirectRule = {
      ...directRule("example.com", false),
      createdAt: "2026-06-24T00:00:01.000Z"
    };
    const rules = [olderProxyRule, newerDirectRule];

    expect(removeCurrentSiteRule(rules, "example.com")).toEqual({
      status: "removed",
      domain: "example.com",
      rules: [olderProxyRule]
    });
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
