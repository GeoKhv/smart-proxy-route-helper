import { sanitizeLocalSettings } from "./sanitize";
import { validateLocalProxyConfig } from "../proxy/proxyConfig";
import type { DeviceProxySettings, LocalSettings, SettingsUpdate, StorageAreaAdapter } from "./storageTypes";

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

export type DeviceProxyEnabledUpdateResult =
  | {
      ok: true;
      previous: DeviceProxySettings;
      deviceProxy: DeviceProxySettings;
    }
  | {
      ok: false;
      reason: "invalid-config";
      deviceProxy: DeviceProxySettings;
    };

export function planDeviceProxyEnabledUpdate(
  current: DeviceProxySettings,
  enabled: boolean
): DeviceProxyEnabledUpdateResult {
  if (enabled) {
    const validation = validateLocalProxyConfig(current.config);

    if (!validation.ok || current.config === null || current.config.host.includes("@")) {
      return {
        ok: false,
        reason: "invalid-config",
        deviceProxy: current
      };
    }
  }

  return {
    ok: true,
    previous: current,
    deviceProxy: {
      ...current,
      enabled
    }
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

export async function setDeviceProxyEnabled(
  enabled: boolean,
  storageArea: StorageAreaAdapter = getChromeLocalStorage()
): Promise<DeviceProxyEnabledUpdateResult> {
  const currentSettings = await getLocalSettings(storageArea);
  const update = planDeviceProxyEnabledUpdate(currentSettings.deviceProxy, enabled);

  if (!update.ok) {
    return update;
  }

  await storageArea.set({
    deviceProxy: update.deviceProxy
  });

  return update;
}
