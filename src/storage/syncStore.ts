import { withSettingsLock } from "./settingsLock";
import { ruleRouteId } from "../rules/routes";
import { ensurePreRouteSettingsBackup } from "./routeMigration";
import { sanitizeSyncSettings } from "./sanitize";
import { getMessage } from "../i18n/i18n";
import { canonicalizeHostname } from "../rules/canonicalizeHostname";
import { getRuleStableId, replaceRuleAtomically } from "../rules/ruleEditing";
import {
  checkRouteTargetAddition,
  findRouteTargetConflictForRule,
  findRouteTargetConflicts,
  resolveRouteTargetConflict
} from "../rules/routeTarget";
import type { DomainRule, RuleAction } from "../rules/ruleTypes";
import {
  RuleChunkStorageError,
  isRuleChunkStorageKey,
  isRulesMeta,
  legacyRulesStorageKey,
  packRulesIntoChunks,
  reconstructRulesFromChunks,
  ruleChunkStorageKeys,
  rulesMatchExactly,
  rulesMetaStorageKey,
  type RulesMeta
} from "./ruleChunks";
import type { SettingsUpdate, StorageAreaAdapter, SyncSettings } from "./storageTypes";

const syncStorageKeys = [legacyRulesStorageKey, "ignoredDomains", "denylist", "classificationOverrides", "routes"] as const;
const legacyMigrationByStorage = new WeakMap<object, Promise<void>>();

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

function syncSettingsWithoutRules(settings: SyncSettings): Omit<SyncSettings, "rules"> {
  return {
    ...(settings.routes ? { routes: settings.routes } : {}),
    ignoredDomains: settings.ignoredDomains,
    denylist: settings.denylist,
    classificationOverrides: settings.classificationOverrides
  };
}

function isSyncQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /quota|quota_bytes|max_write_operations/i.test(message);
}

function controlledRuleStorageError(
  code: ConstructorParameters<typeof RuleChunkStorageError>[0],
  cause?: unknown
): RuleChunkStorageError {
  if (cause) {
    console.warn("Smart Proxy Route Helper Sync rule storage error:", cause);
  }

  const message =
    code === "quota-exceeded" || code === "rule-too-large"
      ? getMessage("syncStorageFull")
      : code === "incomplete"
        ? getMessage("syncRulesUpdating")
        : code === "verification-failed"
          ? getMessage("syncRulesVerificationFailed")
          : getMessage("syncRulesSaveFailed");

  return new RuleChunkStorageError(code, message, cause);
}

function asControlledRuleStorageError(error: unknown): RuleChunkStorageError {
  if (error instanceof RuleChunkStorageError) {
    return controlledRuleStorageError(error.code, error.cause ?? error);
  }

  return controlledRuleStorageError(isSyncQuotaError(error) ? "quota-exceeded" : "write-failed", error);
}

function canRemoveStorageKeys(storageArea: StorageAreaAdapter): storageArea is StorageAreaAdapter & Required<Pick<StorageAreaAdapter, "remove">> {
  return typeof storageArea.remove === "function";
}

async function readPackedRules(storageArea: StorageAreaAdapter, meta: RulesMeta): Promise<DomainRule[]> {
  const chunks = await storageArea.get(ruleChunkStorageKeys(meta));

  return reconstructRulesFromChunks(meta, chunks);
}

async function cleanupObsoleteRuleStorage(
  storageArea: StorageAreaAdapter,
  activeMeta: RulesMeta,
  previousMeta: RulesMeta | null,
  removeLegacyRules: boolean
): Promise<void> {
  if (!canRemoveStorageKeys(storageArea)) {
    return;
  }

  try {
    const activeChunkKeys = new Set(ruleChunkStorageKeys(activeMeta));
    const staleChunkKeys = (previousMeta ? ruleChunkStorageKeys(previousMeta) : []).filter(
      (key) => !activeChunkKeys.has(key)
    );
    const stored = removeLegacyRules ? await storageArea.get(legacyRulesStorageKey) : {};
    const keys = [
      ...staleChunkKeys,
      ...(removeLegacyRules && Array.isArray(stored[legacyRulesStorageKey]) ? [legacyRulesStorageKey] : [])
    ];

    if (keys.length > 0) {
      await storageArea.remove(keys);
    }
  } catch (error) {
    // The active metadata has already been verified. Leaving stale data is safer
    // than ever removing the active generation after a cleanup error.
    console.warn("Smart Proxy Route Helper could not clean obsolete Sync rule chunks:", error);
  }
}

async function removeStagedRuleChunks(storageArea: StorageAreaAdapter, meta: RulesMeta): Promise<void> {
  if (!canRemoveStorageKeys(storageArea)) {
    return;
  }

  try {
    const keys = ruleChunkStorageKeys(meta);

    if (keys.length > 0) {
      await storageArea.remove(keys);
    }
  } catch (error) {
    console.warn("Smart Proxy Route Helper could not remove unactivated Sync rule chunks:", error);
  }
}

async function commitRuleChunks(
  rules: readonly DomainRule[],
  activationSettings: Record<string, unknown>,
  storageArea: StorageAreaAdapter,
  removeLegacyRules: boolean
): Promise<void> {
  let packed;
  let previousMeta: RulesMeta | null = null;
  let activated = false;
  let previousActivation: Record<string, unknown> = {};

  try {
    const previous = await storageArea.get(rulesMetaStorageKey);
    previousMeta = isRulesMeta(previous[rulesMetaStorageKey]) ? previous[rulesMetaStorageKey] : null;
    previousActivation = await storageArea.get([...Object.keys(activationSettings), "routes"]);
    packed = packRulesIntoChunks(rules);
  } catch (error) {
    throw asControlledRuleStorageError(error);
  }

  try {
    if (Object.keys(packed.chunks).length > 0) {
      await storageArea.set(packed.chunks);
    }

    const verifiedBeforeActivation = await readPackedRules(storageArea, packed.meta);

    if (!rulesMatchExactly(rules, verifiedBeforeActivation)) {
      throw new RuleChunkStorageError("verification-failed", "The staged Sync rule chunks did not match their source.");
    }

    activated = true;
    await storageArea.set({
      ...activationSettings,
      [rulesMetaStorageKey]: packed.meta
    });
    if (Object.keys(activationSettings).length > 0 && !("routes" in activationSettings) && previousActivation.routes !== undefined && storageArea.remove) await storageArea.remove("routes");

    const verifiedAfterActivation = await readPackedRules(storageArea, packed.meta);

    if (!rulesMatchExactly(rules, verifiedAfterActivation)) {
      throw new RuleChunkStorageError("verification-failed", "The active Sync rule chunks did not match their source.");
    }
  } catch (error) {
    if (activated) {
      try {
        const present = Object.fromEntries(Object.entries(previousActivation).filter(([, value]) => value !== undefined));
        await storageArea.set({ ...present, ...(previousMeta ? { [rulesMetaStorageKey]: previousMeta } : {}) });
        const absent = [...Object.keys(activationSettings), "routes"].filter(key => previousActivation[key] === undefined);
        if (!previousMeta) absent.push(rulesMetaStorageKey);
        if (absent.length) {
          if (!storageArea.remove) throw new Error("Rollback requires storage key removal.");
          await storageArea.remove(absent);
        }
        const restored = await storageArea.get(rulesMetaStorageKey);
        if (previousMeta ? !isRulesMeta(restored[rulesMetaStorageKey]) || (restored[rulesMetaStorageKey] as RulesMeta).generation !== previousMeta.generation : restored[rulesMetaStorageKey] !== undefined) throw new Error("Rollback verification failed.");
      } catch (rollbackError) {
        // The active generation is uncertain. Keep both generations and the
        // recovery copy; never delete chunks that metadata may still reference.
        throw controlledRuleStorageError("write-failed", rollbackError);
      }
    }

    await removeStagedRuleChunks(storageArea, packed.meta);
    throw asControlledRuleStorageError(error);
  }

  await cleanupObsoleteRuleStorage(storageArea, packed.meta, previousMeta, removeLegacyRules);
}

async function migrateLegacyRules(legacyRules: DomainRule[], storageArea: StorageAreaAdapter): Promise<void> {
  const existingMigration = legacyMigrationByStorage.get(storageArea);

  if (existingMigration) {
    return existingMigration;
  }

  const migration = commitRuleChunks(legacyRules, {}, storageArea, true);
  legacyMigrationByStorage.set(storageArea, migration);

  try {
    await migration;
  } finally {
    legacyMigrationByStorage.delete(storageArea);
  }
}

async function effectiveRulesFromStorage(
  storedSettings: Record<string, unknown>,
  storageArea: StorageAreaAdapter
): Promise<unknown> {
  const legacyRules = storedSettings[legacyRulesStorageKey];
  const storedMeta = storedSettings[rulesMetaStorageKey];

  if (isRulesMeta(storedMeta)) {
    try {
      const rules = await readPackedRules(storageArea, storedMeta);

      if (Array.isArray(legacyRules)) {
        await cleanupObsoleteRuleStorage(storageArea, storedMeta, null, true);
      }

      return rules;
    } catch (error) {
      if (!Array.isArray(legacyRules)) {
        throw controlledRuleStorageError("incomplete", error);
      }
    }
  } else if (storedMeta !== undefined && !Array.isArray(legacyRules)) {
    throw controlledRuleStorageError("incomplete");
  }

  if (!Array.isArray(legacyRules)) {
    return [];
  }

  if (canRemoveStorageKeys(storageArea)) {
    await migrateLegacyRules(legacyRules as DomainRule[], storageArea);
  }

  return legacyRules;
}

export function hasSyncRulesStorageChange(changes: Record<string, unknown>): boolean {
  return Object.keys(changes).some(
    (key) => key === "routes" || key === legacyRulesStorageKey || key === rulesMetaStorageKey || isRuleChunkStorageKey(key)
  );
}

function conflictRuleSnapshot(rules: readonly DomainRule[]): string {
  return JSON.stringify(
    rules.map((rule) => ({
      id: rule.id ?? null,
      routeId: rule.routeId ?? null,
      domain: rule.domain,
      includeSubdomains: rule.includeSubdomains,
      action: rule.action,
      mode: rule.mode,
      source: rule.source,
      createdAt: rule.createdAt
    }))
  );
}

export async function getSyncSettingsUnlocked(storageArea: StorageAreaAdapter = getChromeSyncStorage()): Promise<SyncSettings> {
  if (storageArea === globalThis.chrome?.storage?.sync) await ensurePreRouteSettingsBackup();
  const storedSettings = await storageArea.get([...syncStorageKeys, rulesMetaStorageKey]);
  const rules = await effectiveRulesFromStorage(storedSettings, storageArea);

  return sanitizeSyncSettings({
    ...storedSettings,
    rules
  });
}

export async function setSyncSettingsUnlocked(
  settings: SyncSettings,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<SyncSettings> {
  const sanitizedSettings = sanitizeSyncSettings(settings);
  const conflicts = findRouteTargetConflicts(sanitizedSettings.rules);

  if (conflicts.length > 0) {
    throw new Error(getMessage("ruleConflictSaveBlocked"));
  }

  return writeSyncSettings(sanitizedSettings, storageArea);
}

async function writeSyncSettings(
  settings: SyncSettings,
  storageArea: StorageAreaAdapter
): Promise<SyncSettings> {
  const sanitizedSettings = sanitizeSyncSettings(settings);
  if (storageArea === globalThis.chrome?.storage?.sync) await ensurePreRouteSettingsBackup();

  await commitRuleChunks(
    sanitizedSettings.rules,
    syncSettingsWithoutRules(sanitizedSettings),
    storageArea,
    true
  );

  return sanitizedSettings;
}

async function updateSyncSettingsUnlocked(
  update: SettingsUpdate<SyncSettings>,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<SyncSettings> {
  const currentSettings = await getSyncSettingsUnlocked(storageArea);
  const nextSettings = sanitizeSyncSettings(resolveUpdate(currentSettings, update));
  const currentConflicts = findRouteTargetConflicts(currentSettings.rules);
  const nextConflicts = findRouteTargetConflicts(nextSettings.rules);
  const currentConflictKeys = new Set(currentConflicts.map((conflict) => conflict.key));
  const introducedConflict = nextConflicts.find((conflict) => !currentConflictKeys.has(conflict.key));

  if (introducedConflict) {
    throw new Error(getMessage("ruleProxyDirectExists"));
  }

  for (const conflict of currentConflicts) {
    const nextConflict = nextConflicts.find((candidate) => candidate.key === conflict.key);

    if (!nextConflict || conflictRuleSnapshot(conflict.rules) !== conflictRuleSnapshot(nextConflict.rules)) {
      throw new Error(getMessage("ruleConflictUseKeep"));
    }
  }

  return writeSyncSettings(nextSettings, storageArea);
}

export type AddSyncRulesResult =
  | {
      ok: true;
      settings: SyncSettings;
      addedRules: DomainRule[];
      duplicateRules: DomainRule[];
    }
  | {
      ok: false;
      settings: SyncSettings;
      error: string;
      reason: "conflict";
      existingRule: DomainRule;
      proposedRule: DomainRule;
    };

async function addSyncRulesUnlocked(
  proposedRules: readonly DomainRule[],
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<AddSyncRulesResult> {
  const currentSettings = await getSyncSettingsUnlocked(storageArea);
  const nextRules = [...currentSettings.rules];
  const addedRules: DomainRule[] = [];
  const duplicateRules: DomainRule[] = [];

  for (const proposedRule of proposedRules) {
    const canonical = canonicalizeHostname(proposedRule.domain);
    const rule = canonical.ok
      ? {
          ...proposedRule,
          domain: canonical.domain
        }
      : proposedRule;
    const check = checkRouteTargetAddition(nextRules, rule);

    if (check.status === "conflict") {
      return {
        ok: false,
        settings: currentSettings,
        reason: "conflict",
        existingRule: check.existingRule,
        proposedRule: rule,
        error: ruleRouteId(check.existingRule) !== ruleRouteId(rule) ? getMessage("routesConflict") : getMessage("ruleActionExistsForScope", [
          check.existingRule.action === "proxy" ? getMessage("commonProxy") : getMessage("commonDirect")
        ])
      };
    }

    if (check.status === "duplicate") {
      duplicateRules.push(check.existingRule);
      continue;
    }

    nextRules.push(rule);
    addedRules.push(rule);
  }

  if (addedRules.length === 0) {
    return {
      ok: true,
      settings: currentSettings,
      addedRules,
      duplicateRules
    };
  }

  const settings = await writeSyncSettings(
    {
      ...currentSettings,
      rules: nextRules
    },
    storageArea
  );

  return {
    ok: true,
    settings,
    addedRules,
    duplicateRules
  };
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

export type SyncRuleChange = {
  ruleId: string;
  proposed: Pick<DomainRule, "domain" | "includeSubdomains" | "action" | "routeId">;
};

export type ApplySyncRuleChangesResult =
  | {
      ok: true;
      settings: SyncSettings;
      addedRules: DomainRule[];
      expandedRules: DomainRule[];
      duplicateRules: DomainRule[];
    }
  | {
      ok: false;
      settings: SyncSettings;
      error: string;
    };

async function applySyncRuleChangesUnlocked(
  changes: readonly SyncRuleChange[],
  proposedRules: readonly DomainRule[],
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<ApplySyncRuleChangesResult> {
  const currentSettings = await getSyncSettingsUnlocked(storageArea);
  let rules = [...currentSettings.rules];
  const expandedRules: DomainRule[] = [];

  for (const change of changes) {
    const currentRule = rules.find((rule) => getRuleStableId(rule) === change.ruleId);

    if (currentRule && findRouteTargetConflictForRule(rules, currentRule)) {
      return {
        ok: false,
        settings: currentSettings,
        error: getMessage("ruleConflictResolveBeforeEdit")
      };
    }

    const replacement = replaceRuleAtomically(rules, change.ruleId, change.proposed);

    if (!replacement.ok) {
      return {
        ok: false,
        settings: currentSettings,
        error: replacement.error
      };
    }

    rules = replacement.rules;
    expandedRules.push(replacement.updatedRule);
  }

  const addedRules: DomainRule[] = [];
  const duplicateRules: DomainRule[] = [];

  for (const proposedRule of proposedRules) {
    const canonical = canonicalizeHostname(proposedRule.domain);
    const rule = canonical.ok ? { ...proposedRule, domain: canonical.domain } : proposedRule;
    const check = checkRouteTargetAddition(rules, rule);

    if (check.status === "conflict") {
      return {
        ok: false,
        settings: currentSettings,
        error: getMessage("ruleActionExistsForDomainScope", [
          check.existingRule.action === "proxy" ? getMessage("commonProxy") : getMessage("commonDirect"),
          rule.domain
        ])
      };
    }

    if (check.status === "duplicate") {
      duplicateRules.push(check.existingRule);
      continue;
    }

    rules.push(rule);
    addedRules.push(rule);
  }

  if (addedRules.length === 0 && expandedRules.length === 0) {
    return {
      ok: true,
      settings: currentSettings,
      addedRules,
      expandedRules,
      duplicateRules
    };
  }

  const settings = await writeSyncSettings({ ...currentSettings, rules }, storageArea);

  return {
    ok: true,
    settings,
    addedRules,
    expandedRules,
    duplicateRules
  };
}

async function updateSyncRuleUnlocked(
  ruleId: string,
  proposed: Pick<DomainRule, "domain" | "includeSubdomains" | "action" | "routeId">,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<UpdateSyncRuleResult> {
  const currentSettings = await getSyncSettingsUnlocked(storageArea);
  const currentRule = currentSettings.rules.find((rule) => getRuleStableId(rule) === ruleId);

  if (currentRule && findRouteTargetConflictForRule(currentSettings.rules, currentRule)) {
    return {
      ok: false,
      settings: currentSettings,
      error: getMessage("ruleConflictResolveBeforeEdit")
    };
  }

  const replacement = replaceRuleAtomically(currentSettings.rules, ruleId, proposed);

  if (!replacement.ok) {
    return {
      ok: false,
      settings: currentSettings,
      error: replacement.error
    };
  }

  const settings = await writeSyncSettings(
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

export type ResolveSyncRouteTargetConflictResult =
  | {
      ok: true;
      settings: SyncSettings;
      keptRule: DomainRule;
      removedRules: DomainRule[];
    }
  | {
      ok: false;
      settings: SyncSettings;
      error: string;
    };

async function resolveSyncRouteTargetConflictUnlocked(
  routeTargetKey: string,
  keepAction: RuleAction | `route:${string}`,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<ResolveSyncRouteTargetConflictResult> {
  const currentSettings = await getSyncSettingsUnlocked(storageArea);
  const resolution = resolveRouteTargetConflict(currentSettings.rules, routeTargetKey, keepAction);

  if (!resolution.ok) {
    return {
      ok: false,
      settings: currentSettings,
      error: resolution.error
    };
  }

  const settings = await writeSyncSettings(
    {
      ...currentSettings,
      rules: resolution.rules
    },
    storageArea
  );

  return {
    ok: true,
    settings,
    keptRule: resolution.keptRule,
    removedRules: resolution.removedRules
  };
}

export function setSyncSettings(...args: Parameters<typeof setSyncSettingsUnlocked>): ReturnType<typeof setSyncSettingsUnlocked> {
  return withSettingsLock("sync", () => setSyncSettingsUnlocked(...args));
}

export function updateSyncSettings(...args: Parameters<typeof updateSyncSettingsUnlocked>): ReturnType<typeof updateSyncSettingsUnlocked> {
  return withSettingsLock("sync", () => updateSyncSettingsUnlocked(...args));
}

export function addSyncRules(...args: Parameters<typeof addSyncRulesUnlocked>): ReturnType<typeof addSyncRulesUnlocked> {
  return withSettingsLock("sync", () => addSyncRulesUnlocked(...args));
}

export function applySyncRuleChanges(...args: Parameters<typeof applySyncRuleChangesUnlocked>): ReturnType<typeof applySyncRuleChangesUnlocked> {
  return withSettingsLock("sync", () => applySyncRuleChangesUnlocked(...args));
}

export function updateSyncRule(...args: Parameters<typeof updateSyncRuleUnlocked>): ReturnType<typeof updateSyncRuleUnlocked> {
  return withSettingsLock("sync", () => updateSyncRuleUnlocked(...args));
}

export function resolveSyncRouteTargetConflict(...args: Parameters<typeof resolveSyncRouteTargetConflictUnlocked>): ReturnType<typeof resolveSyncRouteTargetConflictUnlocked> {
  return withSettingsLock("sync", () => resolveSyncRouteTargetConflictUnlocked(...args));
}

export function getSyncSettings(...args: Parameters<typeof getSyncSettingsUnlocked>): ReturnType<typeof getSyncSettingsUnlocked> {
  return withSettingsLock("sync", () => getSyncSettingsUnlocked(...args));
}
