import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { getSyncSettings, setSyncSettings, addSyncRules, updateSyncSettings, hasSyncRulesStorageChange } from "../src/storage/syncStore";
import { buildProxyApplyPlan, createProxySettingsController } from "../src/proxy/applyProxySettings";
import { namedRulesMetaKey, namedRulesChunkPrefix } from "../src/storage/namedRuleStorage";
import { packRulesIntoChunks, rulesMetaStorageKey } from "../src/storage/ruleChunks";
import { createDefaultSyncSettings } from "../src/storage/defaults";
import type { DomainRule } from "../src/rules/ruleTypes";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../src/storage/storageTypes";

// Execute the unmodified, self-contained storage bundle from the published ZIP.
const fixture = new URL("./fixtures/v0.3.2/syncStore.js", import.meta.url);
const legacy = await import(fixture.href) as {
  a: (area: StorageAreaAdapter) => Promise<SyncSettings>;
  c: (settings: SyncSettings, area: StorageAreaAdapter) => Promise<SyncSettings>;
  r: (rules: DomainRule[], area: StorageAreaAdapter) => Promise<{ ok: boolean }>;
};
function area(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial);
  return { data,
    async get(keys?: string | string[] | Record<string, unknown> | null) { return structuredClone(keys == null ? data : Object.fromEntries((typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)).filter(k => k in data).map(k => [k, data[k]]))); },
    async set(items: Record<string, unknown>) { Object.assign(data, structuredClone(items)); },
    async remove(keys: string | string[]) { for (const key of typeof keys === "string" ? [keys] : keys) delete data[key]; }
  };
}
const rule = (domain: string, routeId?: string, action: "proxy" | "direct" = "proxy", includeSubdomains = true): DomainRule =>
  ({ domain, ...(routeId ? { routeId } : {}), action, includeSubdomains, mode: "proxy", source: "manual", createdAt: "2026-11-06T12:00:00Z" });
const local: LocalSettings = { deviceProxy: { enabled: true, config: { scheme: "socks5", host: "127.0.0.1", port: 18782 } }, diagnostics: { enabled: false } };
function route(settings: SyncSettings, host: string, device = local): string {
  const plan = buildProxyApplyPlan(settings, device);
  return plan.action === "clear" ? "DIRECT" : runInNewContext(plan.pacScript + `\nFindProxyForURL("http://${host}/", "${host}")`);
}
const namedData = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => key === namedRulesMetaKey || key.startsWith(namedRulesChunkPrefix)));

describe("installed 0.3.2 / isolated named-rule storage", () => {
  it("pins the real legacy release bundle", () => {
    expect(createHash("sha256").update(readFileSync(fixture)).digest("hex")).toBe("5e50f0fbbf6d065d3a14a1386158d3e27aa3c5cc66576109767abe851b8803dc");
  });
  it.each([false, true])("preserves the original counterexample (Life proxy=%s) through old reads and unrelated writes", async proxy => {
    const sync = area();
    await legacy.r([rule("work.example")], sync);
    const before = structuredClone(sync.data);
    await addSyncRules([rule("life.example", "life")], sync);
    expect(sync.data.rulesMeta).toEqual(before.rulesMeta); // no Work rewrite
    const device = proxy ? { ...local, routeConnections: { life: { type: "proxy" as const, config: { scheme: "http" as const, host: "127.0.0.1", port: 18781 } } } } : local;
    expect(route(await getSyncSettings(sync), "life.example", device)).toBe(proxy ? "PROXY 127.0.0.1:18781" : "DIRECT");
    const protectedData = structuredClone(namedData(sync.data));
    expect((await legacy.a(sync)).rules.map(r => r.domain)).toEqual(["work.example"]);
    expect(route(await legacy.a(sync), "life.example")).toBe("DIRECT"); // old cannot implement Life proxy
    await legacy.r([rule("unrelated.example")], sync);
    expect(namedData(sync.data)).toEqual(protectedData);
    const reread = await getSyncSettings(sync); // fresh read, no process-local migration state
    expect(reread.rules.find(r => r.domain === "life.example")?.routeId).toBe("life");
    expect(route(reread, "life.example", device)).toBe(proxy ? "PROXY 127.0.0.1:18781" : "DIRECT");
    expect(route(reread, "work.example")).toBe("SOCKS5 127.0.0.1:18782");
    expect(route(reread, "life.example", { ...device, routingEnabled: false })).toBe("DIRECT");
  });
  it("syncs additions, edits and deletions of Work both ways without resurrecting/deleting Life", async () => {
    const sync = area(); await legacy.r([rule("old.example")], sync);
    await addSyncRules([rule("modern.example", "work"), rule("life.example", "life")], sync);
    let old = await legacy.a(sync);
    expect(old.rules.map(r => r.domain)).toEqual(["old.example", "modern.example"]);
    await legacy.c({ ...old, rules: old.rules.filter(r => r.domain !== "old.example").map(r => ({ ...r, action: "direct" })) }, sync);
    expect((await getSyncSettings(sync)).rules.map(r => [r.domain, r.action])).toEqual([["modern.example", "direct"], ["life.example", "proxy"]]);
    await updateSyncSettings(current => ({ rules: current.rules.filter(r => r.domain !== "modern.example") }), sync);
    expect((await legacy.a(sync)).rules).toEqual([]);
    await legacy.r([rule("new-old.example")], sync);
    expect((await getSyncSettings(sync)).rules).toHaveLength(2);
    await updateSyncSettings(current => ({ rules: current.rules.filter(r => r.routeId !== "life") }), sync);
    await legacy.r([rule("another.example")], sync);
    expect((await getSyncSettings(sync)).rules.every(r => r.routeId !== "life")).toBe(true);
  });
  it("preserves overlapping parent/exact scopes, and blocks a cross-route same-scope collision instead of choosing Work", async () => {
    const sync = area(); await legacy.r([rule("example.com")], sync);
    await addSyncRules([rule("child.example.com", "life")], sync);
    expect(route(await getSyncSettings(sync), "child.example.com")).toBe("DIRECT");
    expect(route(await getSyncSettings(sync), "other.example.com")).toBe("SOCKS5 127.0.0.1:18782");
    // An old device still applies its explicitly configured Work parent. It has no Life feature.
    expect(route(await legacy.a(sync), "child.example.com")).toBe("SOCKS5 127.0.0.1:18782");
    await legacy.r([{ ...rule("child.example.com"), createdAt: "2026-11-07T00:00:00Z" }], sync);
    const conflict = await getSyncSettings(sync);
    expect(conflict.rules.find(r => r.routeId === "life")).toBeDefined();
    expect(route(conflict, "child.example.com")).toBe("PROXY 127.0.0.1:9");
    expect(route(conflict, "deep.child.example.com")).toBe("PROXY 127.0.0.1:9");
  });
  it("imports intact 0.4.0 data once and removes exposure in legacy chunks", async () => {
    const rules = [rule("work.example"), rule("life.example", "life")];
    const packed = packRulesIntoChunks(rules);
    const sync = area({ ...packed.chunks, rulesMeta: packed.meta });
    expect((await getSyncSettings(sync)).rules).toEqual(rules);
    expect((await legacy.a(sync)).rules).toEqual([rules[0]]);
    expect((await getSyncSettings(sync)).rules).toEqual(rules);
  });
  it.each([true, false])("preserves cross-list tie order when migrating 0.4.0 (named first=%s)", async namedFirst => {
    const named = rule("tie.example", "life", "proxy", true);
    const work = rule("tie.example", "work", "proxy", false);
    const rules = namedFirst ? [named, work] : [work, named];
    const packed = packRulesIntoChunks(rules);
    const sync = area({ ...packed.chunks, rulesMeta: packed.meta });
    const expected = route({ ...createDefaultSyncSettings(), rules }, "tie.example");
    await getSyncSettings(sync);
    expect(route(await getSyncSettings(sync), "tie.example")).toBe(expected);
    await legacy.r([rule("unrelated.example")], sync);
    expect(route(await getSyncSettings(sync), "tie.example")).toBe(expected);
  });
  it("retains last PAC for missing named chunks, and reapplies when all chunks arrive", async () => {
    const sync = area(); await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("work.example")] }, sync);
    const localArea = area(local); const calls: string[] = [];
    const controller = createProxySettingsController({ syncStorage: sync, localStorage: localArea, proxySettings: { async applyPacScript(pac) { calls.push(pac); }, async clearExtensionSettings() { calls.push("clear"); } }, logger: { info() {}, warn() {} } });
    await controller.apply("startup"); const previous = calls.at(-1);
    const remote = area(sync.data); await addSyncRules([rule("life.example", "life")], remote);
    await sync.set({ [namedRulesMetaKey]: remote.data[namedRulesMetaKey] });
    expect((await controller.handleStorageChange({ [namedRulesMetaKey]: {} }, "sync"))?.ok).toBe(false);
    expect(calls.at(-1)).toBe(previous);
    await sync.set(namedData(remote.data));
    expect((await controller.handleStorageChange({ [namedRulesMetaKey]: {} }, "sync"))?.ok).toBe(true);
    expect(hasSyncRulesStorageChange({ [namedRulesChunkPrefix + "x:0"]: {} })).toBe(true);
  });
  it.each(["work-first", "named-first"])("fences partial cross-list moves (%s)", async delivery => {
    const sync = area(); await legacy.r([rule("move.example")], sync);
    const remote = area(sync.data);
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.example", "life")] }, remote);
    const workPayload = Object.fromEntries(Object.entries(remote.data).filter(([k]) => k === rulesMetaStorageKey || k.startsWith("rulesChunk:")));
    const namedPayload = namedData(remote.data);
    await sync.set(delivery === "work-first" ? workPayload : namedPayload);
    await expect(getSyncSettings(sync)).rejects.toThrow();
    await sync.set(delivery === "work-first" ? namedPayload : workPayload);
    expect((await getSyncSettings(sync)).rules).toEqual([rule("move.example", "life")]);
    await legacy.r([rule("later.example")], sync);
    expect((await getSyncSettings(sync)).rules).toHaveLength(2);
  });
  it("keeps the original data on named quota failure", async () => {
    const sync = area(); await legacy.r([rule("work.example")], sync);
    const before = structuredClone(sync.data);
    const failing = { ...sync, async set(items: Record<string, unknown>) { if (Object.keys(items).some(k => k.startsWith(namedRulesChunkPrefix))) throw Error("QUOTA_BYTES"); await sync.set(items); } };
    await expect(addSyncRules([rule("life.example", "life")], failing)).rejects.toThrow();
    expect(sync.data).toEqual(before);
  });
});
