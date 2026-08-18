import { describe, expect, it } from "vitest";

import {
  RuleChunkStorageError,
  estimateStorageItemBytes,
  packRulesIntoChunks,
  reconstructRulesFromChunks,
  ruleChunkStorageKeys,
  rulesChunkTargetBytes,
  rulesMatchExactly
} from "../src/storage/ruleChunks";
import type { DomainRule } from "../src/rules/ruleTypes";

const createdAt = "2026-08-15T00:00:00.000Z";

function rule(index: number, domain = `rule-${index}.example.test`): DomainRule {
  return {
    id: `rule-${index}`,
    domain,
    includeSubdomains: index % 2 === 0,
    action: index % 3 === 0 ? "direct" : "proxy",
    mode: "proxy",
    source: index % 2 === 0 ? "manual" : "import",
    createdAt
  };
}

describe("chunked route-rule packing", () => {
  it("packs a small list into one item and reconstructs its original order", () => {
    const rules = [rule(1), rule(2)];
    const packed = packRulesIntoChunks(rules, "small");

    expect(ruleChunkStorageKeys(packed.meta)).toHaveLength(1);
    expect(reconstructRulesFromChunks(packed.meta, packed.chunks)).toEqual(rules);
  });

  it("splits large rule lists into safe items without splitting a rule", () => {
    const rules = Array.from(
      { length: 220 },
      (_, index) => rule(index, `rule-${index}-with-a-long-hostname-for-storage-packing.example.test`)
    );
    const packed = packRulesIntoChunks(rules, "large");

    expect(estimateStorageItemBytes("rules", rules)).toBeGreaterThan(8192);
    expect(ruleChunkStorageKeys(packed.meta).length).toBeGreaterThan(1);
    for (const [key, chunk] of Object.entries(packed.chunks)) {
      expect(estimateStorageItemBytes(key, chunk)).toBeLessThanOrEqual(rulesChunkTargetBytes);
    }
    expect(reconstructRulesFromChunks(packed.meta, packed.chunks)).toEqual(rules);
  });

  it("accounts for UTF-8 bytes in Unicode rule data", () => {
    const unicodeRule = rule(1, "пример.испытание");
    const packed = packRulesIntoChunks([unicodeRule], "unicode-поколение");
    const [key] = ruleChunkStorageKeys(packed.meta);

    expect(estimateStorageItemBytes(key, packed.chunks[key])).toBeGreaterThan(key.length + JSON.stringify(packed.chunks[key]).length);
    expect(reconstructRulesFromChunks(packed.meta, packed.chunks)).toEqual([unicodeRule]);
  });

  it("returns a typed error when one rule cannot fit in a safe item", () => {
    const oversized = rule(1, `${"a".repeat(rulesChunkTargetBytes)}.example`);

    expect(() => packRulesIntoChunks([oversized], "oversized")).toThrow(RuleChunkStorageError);
    try {
      packRulesIntoChunks([oversized], "oversized");
    } catch (error) {
      expect(error).toMatchObject({ code: "rule-too-large" });
    }
  });
});

describe("semantic route-rule verification", () => {
  it("accepts Chrome Storage property reordering without weakening rule equality", () => {
    const source = rule(1);
    const chromeRoundTrip: DomainRule = {
      action: source.action,
      createdAt: source.createdAt,
      domain: source.domain,
      includeSubdomains: source.includeSubdomains,
      mode: source.mode,
      source: source.source,
      id: source.id
    };
    const { id: _sourceId, ...ruleWithoutId } = source;

    expect(JSON.stringify([chromeRoundTrip])).not.toBe(JSON.stringify([source]));
    expect(rulesMatchExactly([source], [chromeRoundTrip])).toBe(true);
    expect(rulesMatchExactly([ruleWithoutId], [{ ...ruleWithoutId, id: undefined }])).toBe(true);
  });

  it("detects a real change to every supported DomainRule field", () => {
    const source = rule(1);
    const changedRules: DomainRule[] = [
      { ...source, id: "changed-id" },
      { ...source, domain: "changed.example.test" },
      { ...source, includeSubdomains: !source.includeSubdomains },
      { ...source, action: source.action === "proxy" ? "direct" : "proxy" },
      { ...source, mode: "unexpected" as DomainRule["mode"] },
      { ...source, source: source.source === "manual" ? "import" : "manual" },
      { ...source, createdAt: "2026-08-18T00:00:00.000Z" }
    ];

    for (const changed of changedRules) {
      expect(rulesMatchExactly([source], [changed])).toBe(false);
    }
    expect(rulesMatchExactly([{ ...source, id: undefined }], [source])).toBe(false);
  });

  it("keeps array order and rule count significant", () => {
    const first = rule(1);
    const second = rule(2);

    expect(rulesMatchExactly([first, second], [second, first])).toBe(false);
    expect(rulesMatchExactly([first, second], [first])).toBe(false);
    expect(rulesMatchExactly([first], [first, second])).toBe(false);
    expect(rulesMatchExactly(new Array<DomainRule>(1), [first])).toBe(false);
  });
});
