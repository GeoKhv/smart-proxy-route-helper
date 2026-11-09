import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { addSyncRules, getSyncSettings, setSyncSettings } from "../src/storage/syncStore";
import { createDefaultSyncSettings } from "../src/storage/defaults";
import { buildProxyApplyPlan } from "../src/proxy/applyProxySettings";
import type { DomainRule } from "../src/rules/ruleTypes";
import type { LocalSettings } from "../src/storage/storageTypes";
import observed from "./fixtures/v0.4.1/offline-work-online-life.json";

function area(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial);
  return { data,
    async get(keys?: string | string[] | Record<string, unknown> | null) { return structuredClone(keys == null ? data : Object.fromEntries((typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)).filter(k => k in data).map(k => [k, data[k]]))); },
    async set(items: Record<string, unknown>) { Object.assign(data, structuredClone(items)); },
    async remove(keys: string | string[]) { for (const k of typeof keys === "string" ? [keys] : keys) delete data[k]; }
  };
}
const rule = (domain: string, routeId: string): DomainRule => ({ domain, routeId, action: "proxy", includeSubdomains: true, mode: "proxy", source: "manual", createdAt: "2026-11-09T00:00:00Z" });
const device: LocalSettings = { deviceProxy: { enabled: true, config: { scheme: "http", host: "127.0.0.1", port: 19883 } }, routingEnabled: true, routeConnections: { life: { type: "proxy", config: { scheme: "socks5", host: "127.0.0.1", port: 19884 } } }, diagnostics: { enabled: false } };
const changed = (before: Record<string, unknown>, after: Record<string, unknown>) => Object.fromEntries(Object.entries(after).filter(([k,v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
async function expectRouting(sync: ReturnType<typeof area>, work: string, life: string, count: number) {
  const settings = await getSyncSettings(sync);
  expect(settings.rules).toHaveLength(count);
  const plan = buildProxyApplyPlan(settings, device);
  expect(plan.action).toBe("apply-pac");
  if (plan.action !== "apply-pac") throw Error("Missing PAC");
  const find = (host: string) => runInNewContext(plan.pacScript + `\nFindProxyForURL("http://${host}/", "${host}")`);
  expect(find(work)).toBe("PROXY 127.0.0.1:19883");
  expect(find(life)).toBe("SOCKS5 127.0.0.1:19884");
}

describe("real Google Sync P1, 2026-11-06", () => {
  it("reads all ten delivered rules from the exact sanitized acceptance snapshot", async () => {
    const sync = area(observed);
    await expectRouting(sync, "offline-a-work.sprh-sync.test", "online-b-life.sprh-sync.test", 10);
    expect(sync.data).toEqual(observed); // recovery must not rewrite or drop server data
  });
  it.each(["work-first", "life-first"])("converges independent offline Work / online Life writes (%s)", async order => {
    const base = area();
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("base-work.test", "work"), rule("base-life.test", "life")] }, base);
    const a = area(base.data), b = area(base.data);
    await addSyncRules([rule("offline-work.test", "work")], a);
    await addSyncRules([rule("online-life.test", "life")], b);
    const aw = changed(base.data, a.data), bw = changed(base.data, b.data);
    const receiver = area(base.data);
    for (const batch of order === "work-first" ? [aw,bw] : [bw,aw]) await receiver.set(batch);
    await expectRouting(receiver, "offline-work.test", "online-life.test", 4);
    // An unrelated Work writer must never publish a stale Life pointer.
    expect(aw).not.toHaveProperty("namedRoutesV1");
    expect(bw).not.toHaveProperty("rulesMeta");
  });
});

const operationData = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith("splitOperation")));
const workData = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => key === "rulesMeta" || key.startsWith("rulesChunk:")));
const lifeData = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => key === "namedRoutesV1" || key.startsWith("namedRulesChunkV1:")));

describe("cross-list delivery remains safe without a shared generation fence", () => {
  for (const source of ["work", "life"]) {
    const target = source === "work" ? "life" : "work";
    it.each(["work-first", "life-first"])(`${source} -> ${target}: complete delta reconstructs either missing pointer (%s)`, async order => {
      const base = area();
      await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", source)] }, base);
      const writer = area(base.data);
      await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", target)] }, writer);
      const receiver = area(base.data);
      const first = order === "work-first" ? workData(writer.data) : lifeData(writer.data);
      const second = order === "work-first" ? lifeData(writer.data) : workData(writer.data);
      await receiver.set(first);
      await expect(getSyncSettings(receiver)).rejects.toThrow();
      await receiver.set(operationData(writer.data));
      expect((await getSyncSettings(receiver)).rules).toEqual([rule("move.test", target)]);
      await receiver.set(second);
      expect((await getSyncSettings(receiver)).rules).toEqual([rule("move.test", target)]);
      // A fresh read uses only persisted evidence, not a process-local cache.
      expect((await getSyncSettings(area(receiver.data))).rules).toEqual([rule("move.test", target)]);
    });
    it(`${source} -> ${target}: concurrent unrelated destination edit retains both records`, async () => {
      const base = area();
      await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", source), rule("base.test", target)] }, base);
      const a = area(base.data), b = area(base.data);
      await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", target), rule("base.test", target)] }, a);
      await addSyncRules([rule("other.test", target)], b);
      // Move's source pointer wins, concurrent destination pointer wins.
      const receiver = area({ ...a.data, ...(target === "work" ? workData(b.data) : lifeData(b.data)) });
      const rules = (await getSyncSettings(receiver)).rules;
      expect(rules.map(r => [r.domain, r.routeId]).sort()).toEqual([["move.test", target], ["base.test", target], ["other.test", target]].sort());
      // Later intentional deletion acknowledges the operation, so it is not replayed.
      await setSyncSettings({ ...createDefaultSyncSettings(), rules: rules.filter(r => r.domain !== "move.test") }, receiver);
      expect((await getSyncSettings(area(receiver.data))).rules.map(r => r.domain).sort()).toEqual(["base.test", "other.test"]);
    });
  }
  it("does not delete a conflicting edit when replaying a cross-list move", async () => {
    const base = area();
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "work"), rule("life.test", "life")] }, base);
    const a = area(base.data), b = area(base.data);
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "life"), rule("life.test", "life")] }, a);
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [{ ...rule("move.test", "work"), action: "direct" }, rule("life.test", "life")] }, b);
    const receiver = area({ ...a.data, ...workData(b.data) });
    const settings = await getSyncSettings(receiver);
    expect(settings.rules.filter(r => r.domain === "move.test")).toHaveLength(2);
    const plan = buildProxyApplyPlan(settings, device);
    expect(plan.action).toBe("apply-pac");
    if (plan.action === "apply-pac") expect(runInNewContext(plan.pacScript + '\nFindProxyForURL("http://move.test/", "move.test")')).toBe("PROXY 127.0.0.1:9");
  });
  it("rejects a delayed missing operation chunk without discarding any saved rules", async () => {
    const sync = area();
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "work")] }, sync);
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "life")] }, sync);
    const key = Object.keys(sync.data).find(k => k.startsWith("splitOperationChunkV2:"))!;
    const chunk = sync.data[key]; await sync.remove(key);
    const before = structuredClone(sync.data);
    await expect(getSyncSettings(sync)).rejects.toThrow();
    expect(sync.data).toEqual(before);
    await sync.set({ [key]: chunk });
    expect((await getSyncSettings(sync)).rules).toEqual([rule("move.test", "life")]);
  });
});

it("distinguishes a new modern Work writer from an installed legacy writer without receipts", async () => {
  const base = area();
  await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "life")] }, base);
  const a = area(base.data), b = area(base.data);
  await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "work")] }, a);
  await addSyncRules([rule("other.test", "work")], b);
  const receiver = area({ ...a.data, ...workData(b.data) });
  expect((await getSyncSettings(receiver)).rules.map(r => r.domain).sort()).toEqual(["move.test", "other.test"]);
});

it("converges all 24 per-key delivery permutations, including delayed chunk cleanup", async () => {
  const base = area();
  await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("base-work.test", "work"), rule("base-life.test", "life")] }, base);
  const a = area(base.data), b = area(base.data);
  await addSyncRules([rule("offline.test", "work")], a);
  await addSyncRules([rule("online.test", "life")], b);
  const entries = Object.entries({ ...changed(base.data,a.data), ...changed(base.data,b.data) });
  expect(entries).toHaveLength(4);
  function permutations<T>(items: T[]): T[][] { return items.length === 0 ? [[]] : items.flatMap((item,i) => permutations(items.filter((_,j) => j !== i)).map(rest => [item,...rest])); }
  for (const order of permutations(entries)) {
    const receiver = area(base.data);
    // Obsolete chunk deletions may arrive before either activation pointer.
    await receiver.remove(Object.keys(base.data).filter(key => !(key in a.data) || !(key in b.data)));
    for (const [key,value] of order) {
      await receiver.set({ [key]: value });
      try { await getSyncSettings(receiver); } catch (error) { expect((error as Error).name).toBe("RuleChunkStorageError"); }
    }
    await expectRouting(receiver, "offline.test", "online.test", 4);
  }
});

it("Pause succeeds with incomplete Sync; Resume retains failure until chunks arrive", async () => {
  const { applyProxySettings } = await import("../src/proxy/applyProxySettings");
  const sync = area({ rulesMeta: { schemaVersion: 1, generation: "missing", chunkCount: 1, ruleCount: 1 } });
  const local = area({ ...device, routingEnabled: false });
  const calls: string[] = [];
  const proxySettings = { async applyPacScript(pac: string) { calls.push(pac); }, async clearExtensionSettings() { calls.push("clear"); } };
  expect(await applyProxySettings({ syncStorage: sync, localStorage: local, proxySettings })).toMatchObject({ ok: true, status: "cleared" });
  await local.set({ routingEnabled: true });
  expect(await applyProxySettings({ syncStorage: sync, localStorage: local, proxySettings })).toMatchObject({ ok: false, attemptedAction: "read-settings" });
  expect(calls).toEqual(["clear"]);
  await sync.set({ "rulesChunk:missing:0": [rule("restored.test", "work")] });
  expect(await applyProxySettings({ syncStorage: sync, localStorage: local, proxySettings })).toMatchObject({ ok: true, status: "applied-pac" });
});

it("keeps both lists unchanged if a cross-list operation exceeds Sync quota", async () => {
  const sync = area();
  await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "work")] }, sync);
  const before = structuredClone(sync.data);
  const failing = { ...sync, async set(items: Record<string,unknown>) {
    if (Object.keys(items).some(key => key.startsWith("splitOperation"))) throw Error("QUOTA_BYTES");
    await sync.set(items);
  } };
  await expect(setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", "life")] }, failing)).rejects.toThrow();
  expect(sync.data).toEqual(before);
  expect((await getSyncSettings(sync)).rules).toEqual([rule("move.test", "work")]);
});

it("does not resurrect a moved rule after two subsequent cross-list edits and deletion", async () => {
  const sync = area();
  for (const routeId of ["work", "life", "work", "life"]) {
    await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("move.test", routeId)] }, sync);
    expect((await getSyncSettings(area(sync.data))).rules).toEqual([rule("move.test", routeId)]);
  }
  await setSyncSettings({ ...createDefaultSyncSettings(), rules: [] }, sync);
  expect((await getSyncSettings(area(sync.data))).rules).toEqual([]);
});

it("retries a read when a remote pointer changes between metadata and chunks", async () => {
  const sync = area();
  await setSyncSettings({ ...createDefaultSyncSettings(), rules: [rule("base.test", "work")] }, sync);
  const remote = area(sync.data); await addSyncRules([rule("new.test", "work")], remote);
  let raced = false;
  const racing = { ...sync, async get(keys?: string | string[] | Record<string, unknown> | null) {
    const result = await sync.get(keys);
    if (!raced && Array.isArray(keys) && keys.some(key => key.startsWith("rulesChunk:"))) {
      raced = true; await sync.set(remote.data);
    }
    return result;
  } };
  expect((await getSyncSettings(racing)).rules.map(r => r.domain)).toEqual(["base.test", "new.test"]);
});
