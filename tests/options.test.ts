import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { addDomainRule, parseLocalProxyForm, removeRuleAtIndex } from "../src/options/options";
import type { DomainRule } from "../src/rules/ruleTypes";

const createdAt = "2026-06-24T00:00:00.000Z";

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

  it("removes rules by index without mutating the original list", () => {
    const currentRules = [manualRule("letterboxd.com", true), manualRule("ltrbxd.com", true)];

    expect(removeRuleAtIndex(currentRules, 0)).toEqual([manualRule("ltrbxd.com", true)]);
    expect(removeRuleAtIndex(currentRules, 99)).toEqual(currentRules);
    expect(currentRules).toEqual([manualRule("letterboxd.com", true), manualRule("ltrbxd.com", true)]);
  });
});

describe("options classification override UI boundary", () => {
  it("renders storage-only classification override management", async () => {
    const optionsSource = await readFile(resolve(__dirname, "../src/options/options.ts"), "utf8");
    const optionsHtml = await readFile(resolve(__dirname, "../src/options/options.html"), "utf8");

    expect(optionsHtml).toContain("Classification overrides");
    expect(optionsHtml).toContain("classification-overrides-list");
    expect(optionsHtml).toContain("Backup and restore");
    expect(optionsHtml).toContain("Route through proxy");
    expect(optionsHtml).toContain("Route directly");
    expect(optionsHtml).toContain("Exact hostname only");
    expect(optionsHtml).toContain("This hostname and its subdomains");
    expect(optionsHtml).toContain("Edit route rule");
    expect(optionsHtml).toContain("Preview changes");
    expect(optionsHtml).toContain("Save changes");
    expect(optionsHtml).toContain("PSL-aware planning");
    expect(optionsHtml).toContain("Find redundant rules");
    expect(optionsHtml).toContain("Conflicting route rules");
    expect(optionsSource).toContain('keepProxy.textContent = "Keep Proxy"');
    expect(optionsSource).toContain('keepDirect.textContent = "Keep Direct"');
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
