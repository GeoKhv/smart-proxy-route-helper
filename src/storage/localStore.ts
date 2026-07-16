import { sanitizeLocalSettings } from "./sanitize";
import type { LocalSettings, SettingsUpdate, StorageAreaAdapter } from "./storageTypes";

const localStorageKeys = ["deviceProxy", "diagnostics", "language"] as const;

function getChromeLocalStorage(): StorageAreaAdapter {
  return chrome.storage.local;
}

function resolveUpdate<TSettings extends object>(current: TSettings, update: SettingsUpdate<TSettings>): TSettings {
  const patch = typeof update === "function" ? update(current) : update;

  return {
    ...current,
    ...patch
  };
}

export async function getLocalSettings(storageArea: StorageAreaAdapter = getChromeLocalStorage()): Promise<LocalSettings> {
  const storedSettings = await storageArea.get([...localStorageKeys]);

  return sanitizeLocalSettings(storedSettings);
}

export async function setLocalSettings(
  settings: LocalSettings,
  storageArea: StorageAreaAdapter = getChromeLocalStorage()
): Promise<LocalSettings> {
  const sanitizedSettings = sanitizeLocalSettings(settings);

  await storageArea.set(sanitizedSettings);

  return sanitizedSettings;
}

export async function updateLocalSettings(
  update: SettingsUpdate<LocalSettings>,
  storageArea: StorageAreaAdapter = getChromeLocalStorage()
): Promise<LocalSettings> {
  const currentSettings = await getLocalSettings(storageArea);

  return setLocalSettings(resolveUpdate(currentSettings, update), storageArea);
}
