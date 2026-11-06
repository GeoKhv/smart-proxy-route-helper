import type { StorageAreaAdapter } from "./storageTypes";

export const routeMigrationBackupKey = "namedRoutesMigrationBackupV1";
let pending: Promise<void> | null = null;

// Virtual migration: untagged rules still mean Work; deviceProxy still owns its
// original endpoint. No bulk rewrite and no Sync quota cost on upgrade.
async function savePreRouteSettings(
  sync: StorageAreaAdapter,
  local: StorageAreaAdapter
): Promise<void> {
  const existing = await local.get(routeMigrationBackupKey);
  if (existing[routeMigrationBackupKey] !== undefined) return;
  const [syncData, localData] = await Promise.all([
    sync.get(null), local.get(["deviceProxy", "diagnostics", "language", "routeConnections", "routingEnabled"])
  ]);
  const backup = { version: 1, createdAt: new Date().toISOString(), sync: syncData, local: localData };
  await local.set({ [routeMigrationBackupKey]: backup });
  const saved = await local.get(routeMigrationBackupKey);
  if (stableJson(saved[routeMigrationBackupKey]) !== stableJson(backup)) throw new Error("Migration backup verification failed; settings were not changed.");
}

export async function ensurePreRouteSettingsBackup(): Promise<void> {
  if (!globalThis.chrome?.storage?.sync || !globalThis.chrome?.storage?.local) return;
  if (!pending) pending = preservePreRouteSettings(chrome.storage.sync, chrome.storage.local).catch(error => { pending = null; throw error; });
  return pending;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
export async function preservePreRouteSettings(sync: StorageAreaAdapter, local: StorageAreaAdapter): Promise<void> {
  if (globalThis.navigator?.locks) return navigator.locks.request("smart-proxy-pre-route-backup", () => savePreRouteSettings(sync, local));
  return savePreRouteSettings(sync, local);
}
