import { sanitizeSyncSettings } from "./sanitize";
import { replaceRuleAtomically } from "../rules/ruleEditing";
import type { DomainRule } from "../rules/ruleTypes";
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

export type UpdateSyncRuleResult =
  | {
      ok: true;
      settings: SyncSettings;
      updatedRule: DomainRule;
    }
  | {
      ok: false;
      settings: SyncSettings;
      error: string;
    };

export async function updateSyncRule(
  ruleId: string,
  proposed: Pick<DomainRule, "domain" | "includeSubdomains" | "action">,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<UpdateSyncRuleResult> {
  const currentSettings = await getSyncSettings(storageArea);
  const replacement = replaceRuleAtomically(currentSettings.rules, ruleId, proposed);

  if (!replacement.ok) {
    return {
      ok: false,
      settings: currentSettings,
      error: replacement.error
    };
  }

  const settings = await setSyncSettings(
    {
      ...currentSettings,
      rules: replacement.rules
    },
    storageArea
  );

  return {
    ok: true,
    settings,
    updatedRule: replacement.updatedRule
  };
}
