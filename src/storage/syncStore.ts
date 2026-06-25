import { sanitizeSyncSettings } from "./sanitize";
import type { SettingsUpdate, StorageAreaAdapter, SyncSettings } from "./storageTypes";

const syncStorageKeys = ["rules", "ignoredDomains", "denylist", "classificationOverrides"] as const;

function getChromeSyncStorage(): StorageAreaAdapter {
  return chrome.storage.sync;
}

function resolveUpdate<TSettings extends object>(current: TSettings, update: SettingsUpdate<TSettings>): TSettings {
  const patch = typeof update === "function" ? update(current) : update;

  return {
    ...current,
    ...patch
  };
}

export async function getSyncSettings(storageArea: StorageAreaAdapter = getChromeSyncStorage()): Promise<SyncSettings> {
  const storedSettings = await storageArea.get([...syncStorageKeys]);

  return sanitizeSyncSettings(storedSettings);
}

export async function setSyncSettings(
  settings: SyncSettings,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<SyncSettings> {
  const sanitizedSettings = sanitizeSyncSettings(settings);

  await storageArea.set(sanitizedSettings);

  return sanitizedSettings;
}

export async function updateSyncSettings(
  update: SettingsUpdate<SyncSettings>,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<SyncSettings> {
  const currentSettings = await getSyncSettings(storageArea);

  return setSyncSettings(resolveUpdate(currentSettings, update), storageArea);
}
