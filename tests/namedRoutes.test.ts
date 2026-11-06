import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createDefaultLocalSettings, createDefaultSyncSettings } from "../src/storage/defaults";
import { routeConnection, routeList, ruleRouteId } from "../src/rules/routes";
import { buildProxyApplyPlan } from "../src/proxy/applyProxySettings";
import { describeProxyControl } from "../src/proxy/routeHealth";
import { getNamedPopupRouteStatusView } from "../src/popup/popup";
import { findEffectiveDomainRule, findRedundantDomainRules } from "../src/rules/domainMatcher";
import { checkRouteTargetAddition, findRouteTargetConflicts, resolveRouteTargetConflict } from "../src/rules/routeTarget";
import { getRuleStableId, planRuleEdit } from "../src/rules/ruleEditing";
import { getLocalSettings, updateLocalSettings } from "../src/storage/localStore";
import { addSyncRules, getSyncSettings, setSyncSettings } from "../src/storage/syncStore";
import { preservePreRouteSettings, routeMigrationBackupKey } from "../src/storage/routeMigration";
import { packRulesIntoChunks, rulesMetaStorageKey } from "../src/storage/ruleChunks";
import { buildSettingsExportDocument, previewSettingsImport, applySettingsImportPreview } from "../src/settingsBackup/settingsBackup";
import { buildCurrentSiteDiagnosticPlan, runCurrentSiteDiagnostic, type RunCurrentSiteDiagnosticOptions } from "../src/diagnostics/currentSiteDiagnostics";
import { classifyProxyProbeError } from "../src/diagnostics/proxyProbeErrors";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../src/storage/storageTypes";
import type { DomainRule } from "../src/rules/ruleTypes";

const endpoint = { scheme: "socks5" as const, host: "127.0.0.1", port: 10808 };
const lifeEndpoint = { scheme: "http" as const, host: "127.0.0.1", port: 9080 };
const date = "2026-11-06T10:00:00.000Z";
function rule(domain: string, routeId?: string, action: "proxy" | "direct" = "proxy", includeSubdomains = true): DomainRule {
  return { domain, ...(routeId ? { routeId } : {}), action, includeSubdomains, mode: "proxy", source: "manual", createdAt: date };
}
function storage(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial);
  const area: StorageAreaAdapter & { data: typeof data } = {
    data,
    async get(keys) { const all = structuredClone(data); return keys == null ? all : Object.fromEntries((typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)).filter(k => k in all).map(k => [k, all[k]])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of typeof keys === "string" ? [keys] : keys) delete data[k]; }
  };
  return area;
}
function config(rules = [rule("work.example", "work"), rule("life.example", "life")]) {
  const sync: SyncSettings = { ...createDefaultSyncSettings(), routes: routeList({}), rules };
  const local: LocalSettings = { ...createDefaultLocalSettings(), routingEnabled: true, deviceProxy: { enabled: true, config: endpoint }, routeConnections: { work: { type: "proxy", config: endpoint }, life: { type: "proxy", config: lifeEndpoint } } };
  return { sync, local };
}
function pacRoute(sync: SyncSettings, local: LocalSettings, host: string): string {
  const plan = buildProxyApplyPlan(sync, local);
  if (plan.action !== "apply-pac") throw Error(`Unexpected clear: ${plan.reason}`);
  return runInNewContext(`${plan.pacScript}\nFindProxyForURL("https://${host}/", "${host}")`);
}

describe("simultaneous named routes", () => {
  it("keeps legacy rules and device proxy untouched with virtual Work/Life defaults", async () => {
    const oldRule = rule("legacy.example");
    const sync = storage({ rules: [oldRule], ignoredDomains: ["ignored.example"] });
    const local = storage({ deviceProxy: { enabled: true, config: endpoint }, language: "ru" });
    expect((await getSyncSettings(sync)).rules).toEqual([oldRule]);
    expect(ruleRouteId(oldRule)).toBe("work");
    expect(routeConnection(await getLocalSettings(local), "work")).toEqual({ type: "proxy", config: endpoint });
    expect(routeConnection(await getLocalSettings(local), "life")).toEqual({ type: "direct" });
    expect(local.data.deviceProxy).toEqual({ enabled: true, config: endpoint });
  });
  it("routes Work SOCKS5 and Life HTTP together without DIRECT fallback", () => {
    const { sync, local } = config();
    expect(pacRoute(sync, local, "work.example")).toBe("SOCKS5 127.0.0.1:10808");
    expect(pacRoute(sync, local, "life.example")).toBe("PROXY 127.0.0.1:9080");
    expect(pacRoute(sync, local, "unlisted.example")).toBe("DIRECT");
  });
  it("supports Life SOCKS5 and DIRECT without changing Work", () => {
    const { sync, local } = config();
    local.routeConnections!.life = { type: "proxy", config: { ...endpoint, port: 10809 } };
    expect(pacRoute(sync, local, "life.example")).toBe("SOCKS5 127.0.0.1:10809");
    local.routeConnections!.life = { type: "direct" };
    expect(pacRoute(sync, local, "life.example")).toBe("DIRECT");
    expect(pacRoute(sync, local, "work.example")).toBe("SOCKS5 127.0.0.1:10808");
  });
  it("preserves exact, parent, WWW, timestamp and list order precedence", () => {
    const { sync, local } = config([rule("example.com", "work"), rule("child.example.com", "life"), rule("exact.example.com", "work", "direct", false)]);
    for (const [host, expected] of [["www.example.com", "SOCKS5 127.0.0.1:10808"], ["deep.child.example.com", "PROXY 127.0.0.1:9080"], ["exact.example.com", "DIRECT"]]) {
      expect(pacRoute(sync, local, host)).toBe(expected);
    }
    sync.rules.push(rule("example.com", "life"));
    expect(pacRoute(sync, local, "example.com")).toBe("PROXY 127.0.0.1:9080");
    expect(findEffectiveDomainRule("example.com", sync.rules)?.rule.routeId).toBe("life");
  });
  it("blocks missing and unknown local endpoints instead of leaking direct", () => {
    const { sync, local } = config();
    delete local.routeConnections!.life;
    sync.routes!.push({ id: "research", name: "Research" });
    sync.rules.push(rule("missing.example", "research"));
    expect(pacRoute(sync, local, "missing.example")).toBe("PROXY 127.0.0.1:9");
    expect(pacRoute(sync, local, "life.example")).toBe("DIRECT");
  });
  it("global pause releases Chrome settings while preserving connections and rules", () => {
    const { sync, local } = config();
    local.routingEnabled = false;
    expect(buildProxyApplyPlan(sync, local)).toMatchObject({ action: "clear", reason: "device-proxy-disabled" });
    expect(local.routeConnections!.life).toEqual({ type: "proxy", config: lifeEndpoint });
  });
  it("detects and explicitly resolves cross-route conflicts, retaining old tie breaker", () => {
    const rules = [rule("same.example", "work"), rule("same.example", "life")];
    expect(checkRouteTargetAddition([rules[0]], rules[1]).status).toBe("conflict");
    const conflict = findRouteTargetConflicts(rules)[0];
    const result = resolveRouteTargetConflict(rules, conflict.key, "route:life:proxy");
    expect(result).toMatchObject({ ok: true, rules: [rules[1]] });
    expect(findEffectiveDomainRule("same.example", rules)?.rule).toEqual(rules[1]);
  });
  it("does not suggest removing a different-route child or a needed child override", () => {
    expect(findRedundantDomainRules([rule("example.com", "work"), rule("child.example.com", "life")])).toEqual([]);
    expect(findRedundantDomainRules([rule("example.com", "work"), rule("child.example.com", "life"), rule("deep.child.example.com", "work")])).toEqual([]);
  });
  it("can move an existing rule between lists using the preview, preserving stable identity", () => {
    const rules = [rule("example.com")];
    const plan = planRuleEdit(rules, getRuleStableId(rules[0]), { domain: "example.com", scope: "hostname-and-subdomains", action: "proxy", routeId: "life" });
    expect(plan).toMatchObject({ ok: true, proposedRule: { routeId: "life", id: getRuleStableId(rules[0]) } });
  });
  it("Popup uses the effective Life connection and global pause, not Work availability", () => {
    const { sync, local } = config();
    local.deviceProxy.config = null;
    local.routeConnections!.life = { type: "direct" };
    expect(getNamedPopupRouteStatusView("life.example", sync, local)).toMatchObject({ appearance: "direct", label: expect.stringContaining("Life · DIRECT") });
    local.routeConnections!.life = { type: "proxy", config: null };
    expect(getNamedPopupRouteStatusView("life.example", sync, local).appearance).toBe("warning");
  });
  it("distinguishes actual Chrome control, expected PAC and paused state", () => {
    const { sync, local } = config(); const plan = buildProxyApplyPlan(sync, local);
    expect(describeProxyControl({ levelOfControl: "controlled_by_other_extensions" }, sync, local).ok).toBe(false);
    expect(describeProxyControl({ levelOfControl: "controlled_by_this_extension", value: { mode: "pac_script", pacScript: { data: plan.action === "apply-pac" ? plan.pacScript : "" } } }, sync, local).ok).toBe(true);
    expect(describeProxyControl({ levelOfControl: "controlled_by_this_extension", value: { mode: "pac_script", pacScript: { data: "stale" } } }, sync, local).ok).toBe(false);
  });
});

describe("named-route persistence and backups", () => {
  it("preserves a verified raw migration copy once, even after settings change", async () => {
    const sync = storage({ rules: [rule("old.example")], customLegacy: "preserve" }); const local = storage({ deviceProxy: { enabled: true, config: endpoint } });
    await preservePreRouteSettings(sync, local);
    const original = structuredClone(local.data[routeMigrationBackupKey]);
    await sync.set({ rules: [rule("new.example", "life")] });
    await preservePreRouteSettings(sync, local);
    expect(local.data[routeMigrationBackupKey]).toEqual(original);
    expect(original).toMatchObject({ sync: { customLegacy: "preserve", rules: [rule("old.example")] } });
  });
  it("serializes independent Work and Life writes across contexts", async () => {
    const local = storage();
    await Promise.all([
      updateLocalSettings(current => ({ routeConnections: { ...current.routeConnections, work: { type: "proxy", config: endpoint } } }), local),
      updateLocalSettings(current => ({ routeConnections: { ...current.routeConnections, life: { type: "proxy", config: lifeEndpoint } } }), local)
    ]);
    expect(Object.keys((await getLocalSettings(local)).routeConnections!)).toEqual(["work", "life"]);
    const sync = storage();
    await Promise.all([addSyncRules([rule("work.example", "work")], sync), addSyncRules([rule("life.example", "life")], sync)]);
    expect((await getSyncSettings(sync)).rules).toHaveLength(2);
  });
  it("keeps route IDs in verified chunks and preserves configuration on quota failure", async () => {
    const { sync } = config(); const packed = packRulesIntoChunks(sync.rules); const area = storage({ ...sync, ...packed.chunks, [rulesMetaStorageKey]: packed.meta });
    const before = structuredClone(area.data);
    const failing = { ...area, async set() { throw new Error("QUOTA_BYTES"); } };
    await expect(setSyncSettings(sync, failing)).rejects.toThrow();
    expect(area.data).toEqual(before);
    expect((await getSyncSettings(area)).rules[1].routeId).toBe("life");
  });
  it("keeps custom routes when migrating a legacy rules array, including concurrent reads/writes", async () => {
    const catalog = [...routeList({}), { id: "research", name: "Research" }];
    const area = storage({ rules: [rule("old.example", "research")], routes: catalog });
    await Promise.all([getSyncSettings(area), addSyncRules([rule("new.example", "life")], area)]);
    const next = await getSyncSettings(area);
    expect(next.routes).toEqual(catalog);
    expect(next.rules.map(rule => rule.domain)).toEqual(["old.example", "new.example"]);
  });
  it("restores the prior catalog after post-activation chunk verification fails", async () => {
    const initial = config(); const area = storage(initial.sync); let activated = false;
    const faulty: StorageAreaAdapter = { ...area,
      async set(items) { await area.set(items); if (items[rulesMetaStorageKey]) activated = true; },
      async get(keys) { const data = await area.get(keys); if (activated && Array.isArray(keys) && keys.some(k => k.startsWith("rulesChunk:"))) { activated = false; return {}; } return data; }
    };
    await expect(setSyncSettings({ ...initial.sync, routes: [...initial.sync.routes!, { id: "research", name: "Research" }] }, faulty)).rejects.toThrow();
    expect(area.data.routes).toEqual(initial.sync.routes);
    expect((await getSyncSettings(area)).rules).toEqual(initial.sync.rules);
  });
  it("keeps a possibly active chunk generation if metadata rollback fails", async () => {
    const initial = config(); const area = storage(initial.sync); let activated = false;
    const faulty: StorageAreaAdapter = { ...area,
      async set(items) { if (activated) throw Error("rollback failed"); await area.set(items); if (items[rulesMetaStorageKey]) activated = true; },
      async get(keys) { const data = await area.get(keys); if (activated && Array.isArray(keys) && keys.some(k => k.startsWith("rulesChunk:"))) return {}; return data; }
    };
    await expect(setSyncSettings(initial.sync, faulty)).rejects.toThrow();
    expect(area.data[rulesMetaStorageKey]).toBeDefined();
    expect(Object.keys(area.data).some(key => key.startsWith("rulesChunk:"))).toBe(true);
    expect((await getSyncSettings(area)).rules).toEqual(initial.sync.rules);
  });
  it("exports endpoints only with explicit consent, and round trips named routes", () => {
    const { sync, local } = config();
    const shared = buildSettingsExportDocument(sync, local);
    expect(shared.version).toBe(2); expect(shared.data.localSettings).toBeUndefined();
    expect(JSON.stringify(shared)).not.toContain("10808");
    const backup = buildSettingsExportDocument(sync, local, { includeLocalProxyConfig: true });
    const preview = previewSettingsImport(JSON.stringify(backup), createDefaultSyncSettings(), createDefaultLocalSettings());
    expect(preview).toMatchObject({ ok: true, nextSyncSettings: { routes: sync.routes, rules: sync.rules.map(rule => ({ ...rule, source: "import" })) }, nextLocalSettings: { routeConnections: local.routeConnections } });
  });
  it("merges imported route endpoints without dropping existing local connections", () => {
    const current = config(); const incoming = config([rule("new.example", "work")]); delete incoming.local.routeConnections!.life;
    const preview = previewSettingsImport(JSON.stringify(buildSettingsExportDocument(incoming.sync, incoming.local, { includeLocalProxyConfig: true })), current.sync, current.local);
    expect(preview).toMatchObject({ ok: true, nextLocalSettings: { routeConnections: { life: { type: "proxy", config: lifeEndpoint } } } });
  });
  it("imports a legacy v1 endpoint into the actual Work connection", () => {
    const { sync, local } = config();
    const legacy = { format: "smart-proxy-route-helper-settings", version: 1, data: { syncSettings: createDefaultSyncSettings(), localSettings: { deviceProxy: { enabled: true, config: { ...endpoint, port: 11000 } } } } };
    const preview = previewSettingsImport(JSON.stringify(legacy), sync, local);
    expect(preview).toMatchObject({ ok: true, nextLocalSettings: { routeConnections: { work: { type: "proxy", config: { port: 11000 } }, life: { type: "proxy", config: lifeEndpoint } } } });
  });
  it("rejects stale local import previews instead of overwriting later changes", async () => {
    const { sync, local } = config(); const syncArea = storage(sync); const localArea = storage(local);
    const preview = previewSettingsImport(JSON.stringify(buildSettingsExportDocument(sync, local, { includeLocalProxyConfig: true })), sync, local);
    await localArea.set({ language: "ru" });
    await expect(applySettingsImportPreview(preview, { syncStorage: syncArea, localStorage: localArea })).rejects.toThrow("Local settings changed");
    expect(localArea.data.language).toBe("ru");
  });
  it("rejects orphan routes, duplicate explicit IDs and malformed catalogs", () => {
    const { sync, local } = config();
    const orphan = buildSettingsExportDocument({ ...sync, rules: [rule("orphan.example", "unknown")] }, local);
    expect(previewSettingsImport(JSON.stringify(orphan), sync, local).ok).toBe(false);
    const existing = { ...rule("existing.example"), id: "collision" };
    const incoming = buildSettingsExportDocument({ ...sync, rules: [{ ...rule("other.example"), id: "collision" }] }, local);
    expect(previewSettingsImport(JSON.stringify(incoming), { ...sync, rules: [existing] }, local).ok).toBe(false);
    incoming.data.syncSettings.routes = [{ id: "work", name: "Work" }];
    expect(previewSettingsImport(JSON.stringify(incoming), sync, local).ok).toBe(false);
  });
  it("rolls route catalog back with rules when local import fails", async () => {
    const before = createDefaultSyncSettings(); const local = createDefaultLocalSettings(); const incoming = config();
    const syncArea = storage(before); const localArea = storage(local);
    const preview = previewSettingsImport(JSON.stringify(buildSettingsExportDocument(incoming.sync, incoming.local, { includeLocalProxyConfig: true })), before, local);
    const failLocal = { ...localArea, async set() { throw Error("local failed"); } };
    await expect(applySettingsImportPreview(preview, { syncStorage: syncArea, localStorage: failLocal })).rejects.toThrow();
    expect(await getSyncSettings(syncArea)).toEqual(before);
    expect(syncArea.data.routes).toBeUndefined();
  });
});

describe("route-scoped diagnostics and TLS", () => {
  function probe(overrides: Partial<RunCurrentSiteDiagnosticOptions> = {}) {
    const { sync, local } = config();
    let errorListener: ((error: unknown) => void) | undefined; let cleaned = false; let restored = 0;
    const options: RunCurrentSiteDiagnosticOptions = {
      syncStorage: storage(sync), localStorage: storage(local), routeId: "work",
      proxySettings: { async applyPacScript() {}, async clearExtensionSettings() {} },
      async restoreProxySettings() { restored++; return { ok: true, status: "unchanged", reason: "diagnostic-restore", signature: "restored" }; },
      observeProxyErrors(listener) { errorListener = listener; return () => { cleaned = true; }; },
      async fetcher() { return {}; }, ...overrides
    };
    return { options, emit: (error: unknown) => errorListener?.(error), restored: () => restored, cleaned: () => cleaned };
  }
  it("tests chosen connection while preserving other routes and explicit saved Direct", () => {
    const { sync, local } = config([rule("example.com", "work", "direct"), rule("other.example", "work")]);
    const plan = buildCurrentSiteDiagnosticPlan({ url: "https://example.com/private?q=secret", syncSettings: sync, localSettings: local, routeId: "life" });
    expect(plan.ok).toBe(true);
    if (plan.ok) { expect(plan.probeUrl).toBe("https://example.com/"); expect(runInNewContext(plan.pacScript + '\nFindProxyForURL("https://example.com/", "example.com")')).toBe("PROXY 127.0.0.1:9080"); }
    expect(sync.rules[0].action).toBe("direct");
  });
  it("restores PAC even if applying mutated Chrome then rejected verification", async () => {
    const p = probe({ proxySettings: { async applyPacScript() { throw Error("verification after set failed"); }, async clearExtensionSettings() {} } });
    expect((await runCurrentSiteDiagnostic("https://work.example/", p.options)).status).toBe("error");
    expect(p.restored()).toBe(1); expect(p.cleaned()).toBe(true);
  });
  it("restores PAC at the worker deadline even when the tab/fetcher ignores AbortSignal", async () => {
    const p = probe({ fetcher: () => new Promise(() => {}), timeoutMs: 5 });
    const result = await runCurrentSiteDiagnostic("https://work.example/", p.options);
    expect(result.message).toContain("timed out"); expect(p.restored()).toBe(1); expect(p.cleaned()).toBe(true);
  });
  it("does not call an HTTP-only check HTTPS healthy", async () => {
    const p = probe(); const result = await runCurrentSiteDiagnostic("http://work.example/", p.options);
    expect(result.httpsVerified).toBe(false); expect(result.message).toContain("HTTPS and certificate");
  });
  it("does not call hidden network errors a definite certificate or proxy failure", async () => {
    const p = probe({ fetcher: async () => { throw new TypeError("Failed to fetch"); } });
    const result = await runCurrentSiteDiagnostic("https://work.example/", p.options);
    expect(result.status).toBe("proxy_unreachable"); expect(result.message).toContain("cannot distinguish TLS/CA"); expect(result.httpsVerified).toBe(false);
  });
  it("shows observed certificate failure and Corporate VPN Router guidance, never full health", async () => {
    const p = probe(); p.options.fetcher = async () => { p.emit({ error: "net::ERR_CERT_AUTHORITY_INVALID", details: "private data not retained" }); return {}; };
    const result = await runCurrentSiteDiagnostic("https://work.example/", p.options);
    expect(result).toMatchObject({ status: "certificate_error", errorCode: "ERR_CERT_AUTHORITY_INVALID", httpsVerified: false });
    expect(result.message).toContain("Corporate VPN Router setup wizard"); expect(result.message).toContain("cannot be attributed conclusively"); expect(JSON.stringify(result)).not.toContain("private data");
  });
  it("distinguishes TLS protocol failures from corporate CA errors", async () => {
    const p = probe(); p.options.fetcher = async () => { p.emit({ error: "net::ERR_SSL_PROTOCOL_ERROR" }); throw Error("Failed to fetch"); };
    const result = await runCurrentSiteDiagnostic("https://work.example/", p.options);
    expect(result.status).toBe("tls_error"); expect(result.message).toContain("does not prove a corporate CA problem");
    expect(classifyProxyProbeError({ error: "ERR_CONNECTION_REFUSED", details: "ERR_CERT_INVALID" })).toBeNull();
  });
  it("rejects success when Chrome loses PAC control during the test", async () => {
    const p = probe({ verifyPac: async () => false }); const result = await runCurrentSiteDiagnostic("https://work.example/", p.options);
    expect(result.status).toBe("error"); expect(p.restored()).toBe(1);
  });
});
