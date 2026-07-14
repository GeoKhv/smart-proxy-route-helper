import { sanitizeSyncSettings } from "./sanitize";
import { getRuleStableId, replaceRuleAtomically } from "../rules/ruleEditing";
import {
  checkRouteTargetAddition,
  findRouteTargetConflictForRule,
  findRouteTargetConflicts,
  resolveRouteTargetConflict
} from "../rules/routeTarget";
import type { DomainRule, RuleAction } from "../rules/ruleTypes";
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

function conflictRuleSnapshot(rules: readonly DomainRule[]): string {
  return JSON.stringify(
    rules.map((rule) => ({
      id: rule.id ?? null,
      domain: rule.domain,
      includeSubdomains: rule.includeSubdomains,
      action: rule.action,
      mode: rule.mode,
      source: rule.source,
      createdAt: rule.createdAt
    }))
  );
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
  const conflicts = findRouteTargetConflicts(sanitizedSettings.rules);

  if (conflicts.length > 0) {
    throw new Error("Conflicting route rules must be resolved explicitly before these synced settings can be saved.");
  }

  await storageArea.set(sanitizedSettings);

  return sanitizedSettings;
}

async function writeSyncSettings(
  settings: SyncSettings,
  storageArea: StorageAreaAdapter
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
  const nextSettings = sanitizeSyncSettings(resolveUpdate(currentSettings, update));
  const currentConflicts = findRouteTargetConflicts(currentSettings.rules);
  const nextConflicts = findRouteTargetConflicts(nextSettings.rules);
  const currentConflictKeys = new Set(currentConflicts.map((conflict) => conflict.key));
  const introducedConflict = nextConflicts.find((conflict) => !currentConflictKeys.has(conflict.key));

  if (introducedConflict) {
    throw new Error("A Proxy/Direct rule already exists for this hostname and scope. Edit the existing rule instead.");
  }

  for (const conflict of currentConflicts) {
    const nextConflict = nextConflicts.find((candidate) => candidate.key === conflict.key);

    if (!nextConflict || conflictRuleSnapshot(conflict.rules) !== conflictRuleSnapshot(nextConflict.rules)) {
      throw new Error("Use Keep Proxy or Keep Direct to resolve conflicting route rules explicitly.");
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

export async function addSyncRules(
  proposedRules: readonly DomainRule[],
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<AddSyncRulesResult> {
  const currentSettings = await getSyncSettings(storageArea);
  const nextRules = [...currentSettings.rules];
  const addedRules: DomainRule[] = [];
  const duplicateRules: DomainRule[] = [];

  for (const proposedRule of proposedRules) {
    const check = checkRouteTargetAddition(nextRules, proposedRule);

    if (check.status === "conflict") {
      return {
        ok: false,
        settings: currentSettings,
        reason: "conflict",
        existingRule: check.existingRule,
        proposedRule,
        error: `A ${check.existingRule.action === "proxy" ? "Proxy" : "Direct"} rule already exists for this hostname and scope. Edit existing rule instead.`
      };
    }

    if (check.status === "duplicate") {
      duplicateRules.push(check.existingRule);
      continue;
    }

    nextRules.push(proposedRule);
    addedRules.push(proposedRule);
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

export async function updateSyncRule(
  ruleId: string,
  proposed: Pick<DomainRule, "domain" | "includeSubdomains" | "action">,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<UpdateSyncRuleResult> {
  const currentSettings = await getSyncSettings(storageArea);
  const currentRule = currentSettings.rules.find((rule) => getRuleStableId(rule) === ruleId);

  if (currentRule && findRouteTargetConflictForRule(currentSettings.rules, currentRule)) {
    return {
      ok: false,
      settings: currentSettings,
      error: "Resolve this conflicting route target with Keep Proxy or Keep Direct before editing it."
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

export async function resolveSyncRouteTargetConflict(
  routeTargetKey: string,
  keepAction: RuleAction,
  storageArea: StorageAreaAdapter = getChromeSyncStorage()
): Promise<ResolveSyncRouteTargetConflictResult> {
  const currentSettings = await getSyncSettings(storageArea);
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
