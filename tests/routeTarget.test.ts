import { describe, expect, it } from "vitest";

import {
  checkRouteTargetAddition,
  findRouteTargetConflicts,
  getRouteTargetKey,
  resolveRouteTargetConflict
} from "../src/rules/routeTarget";
import type { DomainRule, RuleAction } from "../src/rules/ruleTypes";

function rule(
  domain: string,
  includeSubdomains: boolean,
  action: RuleAction,
  createdAt: string,
  id: string
): DomainRule {
  return {
    id,
    domain,
    includeSubdomains,
    action,
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

describe("canonical route-target identity", () => {
  it("normalizes the hostname and excludes action from the key", () => {
    const proxy = rule(" HTTPS://Routing-Test.Test./path ", true, "proxy", "2026-07-13T10:00:00.000Z", "proxy");
    const direct = rule("routing-test.test", true, "direct", "2026-07-13T10:01:00.000Z", "direct");

    expect(getRouteTargetKey(proxy)).toBe(getRouteTargetKey(direct));
  });

  it("keeps exact and include-subdomains scopes as different targets", () => {
    expect(getRouteTargetKey({ domain: "routing-test.test", includeSubdomains: false })).not.toBe(
      getRouteTargetKey({ domain: "routing-test.test", includeSubdomains: true })
    );
  });

  it("classifies same-action matches as duplicates and opposite actions as conflicts", () => {
    const existing = rule("routing-test.test", true, "proxy", "2026-07-13T10:00:00.000Z", "existing");

    expect(
      checkRouteTargetAddition([existing], {
        domain: existing.domain,
        includeSubdomains: existing.includeSubdomains,
        action: existing.action
      })
    ).toMatchObject({
      status: "duplicate",
      existingRule: existing
    });
    expect(
      checkRouteTargetAddition([existing], {
        domain: existing.domain,
        includeSubdomains: existing.includeSubdomains,
        action: "direct"
      })
    ).toMatchObject({
      status: "conflict",
      existingRule: existing
    });
  });
});

describe("stored route-target conflicts", () => {
  const proxy = rule("routing-test.test", true, "proxy", "2026-07-13T10:00:00.000Z", "proxy");
  const direct = rule("routing-test.test", true, "direct", "2026-07-13T10:01:00.000Z", "direct");
  const childDirect = rule("child.routing-test.test", false, "direct", "2026-07-13T10:02:00.000Z", "child");

  it("detects contradictions without treating a legitimate child exception as a conflict", () => {
    const conflicts = findRouteTargetConflicts([proxy, direct, childDirect]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      domain: "routing-test.test",
      includeSubdomains: true,
      proxyRules: [proxy],
      directRules: [direct]
    });
  });

  it.each([
    ["proxy" as const, proxy, direct],
    ["direct" as const, direct, proxy]
  ])("keeps %s only after explicit resolution", (action, keptRule, removedRule) => {
    const conflict = findRouteTargetConflicts([proxy, direct, childDirect])[0];
    const result = resolveRouteTargetConflict([proxy, direct, childDirect], conflict.key, action);

    expect(result).toMatchObject({
      ok: true,
      keptRule,
      removedRules: [removedRule]
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.rules).toEqual([keptRule, childDirect]);
  });
});
