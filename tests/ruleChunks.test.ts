import { describe, expect, it } from "vitest";

import {
  RuleChunkStorageError,
  estimateStorageItemBytes,
  packRulesIntoChunks,
  reconstructRulesFromChunks,
  ruleChunkStorageKeys,
  rulesChunkTargetBytes
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
