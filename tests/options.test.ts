import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { findRedundantDomainRules } from "../src/rules/domainMatcher";
import { getRuleStableId, removeRuleByStableId } from "../src/rules/ruleEditing";
import { addDomainRule, parseLocalProxyForm } from "../src/options/options";
import type { DomainRule } from "../src/rules/ruleTypes";

const createdAt = "2026-06-24T00:00:00.000Z";

function manualRule(domain: string, includeSubdomains = true, id?: string): DomainRule {
  return {
    ...(id ? { id } : {}),
    domain,
    includeSubdomains,
    action: "proxy",
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

describe("options local proxy helpers", () => {
  it("converts valid proxy form data to device-local proxy settings", () => {
    expect(
      parseLocalProxyForm({
        enabled: true,
        scheme: "socks5",
        host: " 127.0.0.1 ",
        port: "10808"
      })
    ).toEqual({
      ok: true,
      deviceProxy: {
        enabled: true,
        config: {
          scheme: "socks5",
          host: "127.0.0.1",
          port: 10808
        }
      }
    });
  });

  it("allows disabled local routing with no stored proxy config", () => {
    expect(
      parseLocalProxyForm({
        enabled: false,
        scheme: "",
        host: "",
        port: ""
      })
    ).toEqual({
      ok: true,
      deviceProxy: {
        enabled: false,
        config: null
      }
    });
  });

  it("returns validation errors for invalid proxy form data", () => {
    expect(
      parseLocalProxyForm({
        enabled: true,
        scheme: "socks5",
        host: "127.0.0.1",
        port: "70000"
      })
    ).toMatchObject({
      ok: false,
      errors: {
        port: "Enter a local proxy port from 1 to 65535."
      }
    });
  });
});

describe("options synced rule helpers", () => {
  it("normalizes domain input when adding a synced manual rule", () => {
    const result = addDomainRule([], "https://Letterboxd.com/films", true, createdAt);

    expect(result).toEqual({
      ok: true,
      status: "added",
      normalizedDomain: "letterboxd.com",
      rules: [manualRule("letterboxd.com", true)]
    });
  });

  it.each(["proxy", "direct"] as const)("canonicalizes standard WWW when adding a %s rule", (action) => {
    const result = addDomainRule([], "www.example.com", false, createdAt, action);

    expect(result).toMatchObject({
      ok: true,
      status: "added",
      normalizedDomain: "example.com",
      rules: [{ domain: "example.com", action, includeSubdomains: false }]
    });
  });

  it("rejects denylisted and internal domains", () => {
    expect(addDomainRule([], "localhost", true, createdAt)).toMatchObject({
      ok: false,
      error: "Localhost cannot be routed."
    });
    expect(addDomainRule([], "192.168.1.1", true, createdAt)).toMatchObject({
      ok: false,
      error: "Private network addresses cannot be routed."
    });
    expect(addDomainRule([], "chrome://extensions", true, createdAt)).toMatchObject({
      ok: false
    });
  });

  it("handles duplicate rules without adding another copy", () => {
    const currentRules = [manualRule("ltrbxd.com", true)];
    const result = addDomainRule(currentRules, "LTRBXD.com", true, createdAt);

    expect(result).toEqual({
      ok: true,
      status: "duplicate",
      normalizedDomain: "ltrbxd.com",
      rules: currentRules
    });
  });

  it("detects duplicates after standard WWW canonicalization", () => {
    const currentRules = [manualRule("example.com", false)];

    expect(addDomainRule(currentRules, "www.example.com", false, createdAt)).toMatchObject({
      ok: true,
      status: "duplicate",
      normalizedDomain: "example.com",
      rules: currentRules
    });
  });

  it("blocks proxy and direct rules for the same normalized domain scope", () => {
    const currentRules = [manualRule("example.com", false)];
    const result = addDomainRule(currentRules, "HTTPS://EXAMPLE.COM./path", false, createdAt, "direct");

    expect(result).toMatchObject({
      ok: false,
      reason: "conflict",
      existingRule: currentRules[0],
      error: "A Proxy rule already exists for this hostname and scope. Edit existing rule instead."
    });
  });

  it("removes an ordinary rule by its stable ID without mutating the original list", () => {
    const target = manualRule("letterboxd.com", true, "rule-letterboxd");
    const sibling = manualRule("ltrbxd.com", true, "rule-ltrbxd");
    const currentRules = [target, sibling];
    const result = removeRuleByStableId(currentRules, getRuleStableId(target));

    expect(result).toMatchObject({
      status: "removed",
      removedRule: target,
      removedIndex: 0,
      rules: [sibling]
    });
    expect(currentRules).toEqual([target, sibling]);
  });

  it("removes the rendered rule after the current list has been reordered", () => {
    const target = manualRule("letterboxd.com", true, "rule-letterboxd");
    const sibling = manualRule("ltrbxd.com", true, "rule-ltrbxd");
    const currentRules = [sibling, target];
    const result = removeRuleByStableId(currentRules, getRuleStableId(target));

    expect(result).toMatchObject({ status: "removed", rules: [sibling] });
    expect(currentRules).toEqual([sibling, target]);
  });

  it("does not remove a newly inserted rule before the rendered rule", () => {
    const target = manualRule("letterboxd.com", true, "rule-letterboxd");
    const sibling = manualRule("ltrbxd.com", true, "rule-ltrbxd");
    const inserted = manualRule("new.example", false, "rule-new");
    const result = removeRuleByStableId([inserted, target, sibling], getRuleStableId(target));

    expect(result).toMatchObject({ status: "removed", rules: [inserted, sibling] });
  });

  it("does not change the list when another operation already removed the selected rule", () => {
    const remaining = manualRule("ltrbxd.com", true, "rule-ltrbxd");
    const result = removeRuleByStableId([remaining], "rule-letterboxd");

    expect(result).toEqual({ status: "not-found", rules: [remaining] });
  });

  it("does not remove a rule when a legacy stable ID is ambiguous", () => {
    const ambiguousFirst = manualRule("letterboxd.com", true);
    const ambiguousSecond = manualRule("letterboxd.com", true);
    const unrelated = manualRule("ltrbxd.com", true, "rule-ltrbxd");
    const currentRules = [ambiguousFirst, unrelated, ambiguousSecond];
    const result = removeRuleByStableId(currentRules, getRuleStableId(ambiguousFirst));

    expect(result).toEqual({ status: "ambiguous", rules: currentRules });
  });

  it("removes a cleanup suggestion by the same stable-ID semantics after the list changes", () => {
    const parent = manualRule("example.com", true, "rule-parent");
    const redundant = manualRule("media.example.com", true, "rule-redundant");
    const suggestion = findRedundantDomainRules([parent, redundant])[0];
    const inserted = manualRule("new.example", false, "rule-new");
    const currentRules = [inserted, redundant, parent];
    const result = removeRuleByStableId(currentRules, getRuleStableId(suggestion.redundantRule));

    expect(suggestion.redundantRuleIndex).toBe(1);
    expect(result).toMatchObject({ status: "removed", rules: [inserted, parent] });
    expect(currentRules).toEqual([inserted, redundant, parent]);
  });
});

describe("options classification override UI boundary", () => {
  it("renders storage-only classification override management", async () => {
    const optionsSource = await readFile(resolve(__dirname, "../src/options/options.ts"), "utf8");
    const optionsHtml = await readFile(resolve(__dirname, "../src/options/options.html"), "utf8");

    expect(optionsHtml).toContain('data-i18n="optionsOverridesTitle"');
    expect(optionsHtml).toContain("classification-overrides-list");
    expect(optionsHtml).toContain('data-i18n="optionsBackupTitle"');
    expect(optionsHtml).toContain('data-i18n="optionsRouteThroughProxy"');
    expect(optionsHtml).toContain('data-i18n="optionsRouteDirectly"');
    expect(optionsHtml).toContain('data-i18n="commonExactHostname"');
    expect(optionsHtml).toContain('data-i18n="commonHostnameAndSubdomains"');
    expect(optionsHtml).toContain('data-i18n="optionsEditRuleTitle"');
    expect(optionsHtml).toContain('data-i18n="optionsPreviewChanges"');
    expect(optionsHtml).toContain('data-i18n="optionsSaveChanges"');
    expect(optionsHtml).toContain('data-i18n="optionsSafeParentHint"');
    expect(optionsHtml).toContain('data-i18n="optionsFindRedundant"');
    expect(optionsHtml).toContain('data-i18n="optionsConflictsTitle"');
    expect(optionsSource).toContain('keepProxy.textContent = getMessage("optionsKeepProxy")');
    expect(optionsSource).toContain('keepDirect.textContent = getMessage("optionsKeepDirect")');
    expect(optionsHtml).toContain("backup-include-local-proxy");
    expect(optionsHtml).toContain("preview-import-button");
    expect(optionsHtml).toContain("apply-import-button");
    expect(optionsSource).toContain("removeUserClassificationOverride");
    expect(optionsSource).toContain("classificationOverrides: removeUserClassificationOverride");
    expect(optionsSource).toContain("previewSettingsImport");
    expect(optionsSource).toContain("applySettingsImportPreview");
    expect(optionsSource).toContain("planRuleEdit");
    expect(optionsSource).toContain("updateSyncRule(plan.ruleId, plan.proposedRule)");
    expect(optionsSource).toContain("resolveSyncRouteTargetConflict");
    expect(optionsSource).not.toContain("chrome.proxy");
  });
});
