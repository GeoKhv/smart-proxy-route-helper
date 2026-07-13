import { describe, expect, it } from "vitest";

import {
  getRuleScopeOptions,
  getRuleStableId,
  planRuleEdit,
  replaceRuleAtomically,
  type RuleScope
} from "../src/rules/ruleEditing";
import type { DomainRule, RuleAction } from "../src/rules/ruleTypes";

function rule(
  domain: string,
  includeSubdomains: boolean,
  action: RuleAction = "proxy",
  createdAt = "2026-07-13T10:00:00.000Z",
  id?: string
): DomainRule {
  return {
    ...(id ? { id } : {}),
    domain,
    includeSubdomains,
    action,
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

function plan(
  rules: readonly DomainRule[],
  currentRule: DomainRule,
  input: { domain: string; action: RuleAction; scope: RuleScope }
) {
  return planRuleEdit(rules, getRuleStableId(currentRule), input);
}

describe("rule scope planning", () => {
  it("offers explicit exact, hostname, and safe PSL-aware parent scopes", () => {
    expect(getRuleScopeOptions("www.linkedin.com")).toEqual([
      {
        scope: "exact",
        label: "Exact hostname only",
        targetDomain: "www.linkedin.com",
        includeSubdomains: false,
        coverage: ["www.linkedin.com"]
      },
      {
        scope: "hostname-and-subdomains",
        label: "This hostname and its subdomains",
        targetDomain: "www.linkedin.com",
        includeSubdomains: true,
        coverage: ["www.linkedin.com", "*.www.linkedin.com"]
      },
      {
        scope: "registrable-domain-and-subdomains",
        label: "Parent domain and all subdomains",
        targetDomain: "linkedin.com",
        includeSubdomains: true,
        coverage: ["linkedin.com", "*.linkedin.com"]
      }
    ]);
  });

  it("plans registrable parents generically rather than special-casing www", () => {
    const parentOption = getRuleScopeOptions("deep.api.example.co.uk").find(
      (option) => option.scope === "registrable-domain-and-subdomains"
    );

    expect(parentOption).toMatchObject({
      targetDomain: "example.co.uk",
      includeSubdomains: true
    });
    expect(
      getRuleScopeOptions("child.routing-test.test").find(
        (option) => option.scope === "registrable-domain-and-subdomains"
      )
    ).toMatchObject({
      targetDomain: "routing-test.test",
      includeSubdomains: true
    });
  });

  it("does not offer unsafe shared-infrastructure broadening", () => {
    expect(
      getRuleScopeOptions("files.googleusercontent.com").some(
        (option) => option.scope === "registrable-domain-and-subdomains"
      )
    ).toBe(false);
  });
});

describe("rule edit planning", () => {
  it("edits proxy to direct and direct to proxy without changing scope", () => {
    const proxyRule = rule("child.example.com", false, "proxy", undefined, "rule-action");
    const directPlan = plan([proxyRule], proxyRule, {
      domain: proxyRule.domain,
      action: "direct",
      scope: "exact"
    });

    expect(directPlan).toMatchObject({
      ok: true,
      proposedRule: {
        id: "rule-action",
        action: "direct",
        domain: "child.example.com",
        includeSubdomains: false
      }
    });

    if (!directPlan.ok) {
      throw new Error(directPlan.error);
    }

    expect(
      plan([directPlan.proposedRule], directPlan.proposedRule, {
        domain: directPlan.proposedRule.domain,
        action: "proxy",
        scope: "exact"
      })
    ).toMatchObject({
      ok: true,
      proposedRule: {
        id: "rule-action",
        action: "proxy"
      }
    });
  });

  it("expands exact scope on the same hostname only after that scope is selected", () => {
    const current = rule("child.example.com", false, "proxy", undefined, "rule-same-host");

    expect(
      plan([current], current, {
        domain: current.domain,
        action: current.action,
        scope: "hostname-and-subdomains"
      })
    ).toMatchObject({
      ok: true,
      isBroadening: true,
      proposedRule: {
        domain: "child.example.com",
        includeSubdomains: true,
        action: "proxy"
      },
      warnings: [{ kind: "broader-scope", message: "This rule will apply to more hostnames." }]
    });
  });

  it("expands an exact child to its safe registrable parent while preserving action and metadata", () => {
    const current = rule("www.linkedin.com", false, "direct", "2026-07-13T10:05:00.000Z", "rule-parent");
    const result = plan([current], current, {
      domain: current.domain,
      action: current.action,
      scope: "registrable-domain-and-subdomains"
    });

    expect(result).toMatchObject({
      ok: true,
      isBroadening: true,
      proposedRule: {
        id: "rule-parent",
        domain: "linkedin.com",
        includeSubdomains: true,
        action: "direct",
        source: "manual",
        createdAt: "2026-07-13T10:05:00.000Z"
      },
      coverage: ["linkedin.com", "www.linkedin.com", "Other subdomains of linkedin.com"]
    });
  });

  it("does not broaden when exact scope remains selected", () => {
    const current = rule("child.example.com", false);

    expect(
      plan([current], current, {
        domain: current.domain,
        action: current.action,
        scope: "exact"
      })
    ).toMatchObject({
      ok: false,
      reason: "no-change"
    });
  });

  it("rejects identical duplicates and same-target opposite actions", () => {
    const current = rule("child.example.com", false, "proxy", "2026-07-13T10:00:00.000Z", "current");

    expect(
      plan([current, rule("example.com", true, "proxy", "2026-07-13T10:01:00.000Z", "duplicate")], current, {
        domain: current.domain,
        action: current.action,
        scope: "registrable-domain-and-subdomains"
      })
    ).toMatchObject({ ok: false, reason: "duplicate" });

    expect(
      plan([current, rule("example.com", true, "direct", "2026-07-13T10:01:00.000Z", "conflict")], current, {
        domain: current.domain,
        action: current.action,
        scope: "registrable-domain-and-subdomains"
      })
    ).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("reports an existing broader same-action parent", () => {
    const parent = rule("example.com", true, "proxy", "2026-07-13T10:00:00.000Z", "parent");
    const current = rule("child.example.com", false, "direct", "2026-07-13T10:01:00.000Z", "child");
    const result = plan([parent, current], current, {
      domain: current.domain,
      action: "proxy",
      scope: "exact"
    });

    expect(result).toMatchObject({
      ok: true,
      warnings: [
        {
          kind: "covered-by-parent",
          message: "An existing parent rule example.com already provides the same route."
        }
      ]
    });
  });

  it("preserves opposite-action child exceptions and previews same-action redundancy", () => {
    const current = rule("child.example.com", false, "proxy", "2026-07-13T10:00:00.000Z", "current");
    const directChild = rule("login.example.com", false, "direct", "2026-07-13T10:01:00.000Z", "direct-child");
    const proxyChild = rule("media.example.com", false, "proxy", "2026-07-13T10:02:00.000Z", "proxy-child");
    const result = plan([current, directChild, proxyChild], current, {
      domain: current.domain,
      action: current.action,
      scope: "registrable-domain-and-subdomains"
    });

    expect(result).toMatchObject({ ok: true });

    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.warnings.map((warning) => warning.kind)).toEqual([
      "broader-scope",
      "child-exception-preserved",
      "child-rule-redundant"
    ]);
    expect(result.warnings[1].message).toContain("The Direct exception will continue to win.");
    expect(result.warnings[2].message).toContain("It will not be removed automatically.");
  });
});

describe("atomic rule replacement", () => {
  it("replaces one rule in place, preserves stable identity, and never mutates the original list", () => {
    const current = rule("child.example.com", false, "proxy", "2026-07-13T10:00:00.000Z");
    const exception = rule("login.example.com", false, "direct", "2026-07-13T10:01:00.000Z", "exception");
    const original = [current, exception];
    const ruleId = getRuleStableId(current);
    const result = replaceRuleAtomically(original, ruleId, {
      domain: "example.com",
      includeSubdomains: true,
      action: "proxy"
    });

    expect(result).toMatchObject({
      ok: true,
      replacedIndex: 0,
      updatedRule: {
        id: ruleId,
        domain: "example.com",
        includeSubdomains: true,
        action: "proxy",
        source: "manual",
        createdAt: "2026-07-13T10:00:00.000Z"
      }
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.rules).toHaveLength(original.length);
    expect(result.rules[1]).toBe(exception);
    expect(getRuleStableId(result.updatedRule)).toBe(ruleId);
    expect(original[0]).toBe(current);
    expect(original[0].domain).toBe("child.example.com");
  });
});
