import { sanitizeUserClassificationOverrides } from "../domainClassification/userClassificationOverrides";
import { getMessage } from "../i18n/i18n";
import type { UserClassificationOverrides } from "../domainClassification/userClassificationOverrides";
import { validateLocalProxyConfig } from "../proxy/proxyConfig";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";
import { findRouteTargetConflicts, getRouteTargetKey } from "../rules/routeTarget";
import type { DomainRule, RuleAction } from "../rules/ruleTypes";
import { updateLocalSettings } from "../storage/localStore";
import { sanitizeLocalSettings, sanitizeSyncSettings } from "../storage/sanitize";
import { getSyncSettings, setSyncSettings } from "../storage/syncStore";
import type {
  DeviceProxySettings,
  LocalSettings,
  StorageAreaAdapter,
  SyncSettings
} from "../storage/storageTypes";

export const settingsExportFormat = "smart-proxy-route-helper-settings";
export const settingsExportVersion = 1;

export type SettingsExportDocument = {
  format: typeof settingsExportFormat;
  version: typeof settingsExportVersion;
  exportedAt: string;
  data: {
    syncSettings: SyncSettings;
    localSettings?: {
      deviceProxy: DeviceProxySettings;
    };
  };
};

export type SettingsExportOptions = {
  includeLocalProxyConfig?: boolean;
  exportedAt?: string;
};

export type SettingsImportSummary = {
  routeRules: {
    importable: number;
    added: number;
    duplicates: number;
    skipped: number;
  };
  ignoredDomains: {
    importable: number;
    added: number;
    duplicates: number;
    skipped: number;
  };
  denylist: {
    importable: number;
    added: number;
    duplicates: number;
    skipped: number;
  };
  classificationOverrides: {
    importable: number;
    addedOrUpdated: number;
    skipped: number;
  };
  localProxyIncluded: boolean;
  localProxyWillBeApplied: boolean;
};

export type SettingsImportPreview =
  | {
      ok: true;
      summary: SettingsImportSummary;
      warnings: string[];
      errors: [];
      importedSyncSettings: SyncSettings;
      nextSyncSettings: SyncSettings;
      nextLocalSettings: LocalSettings | null;
    }
  | {
      ok: false;
      summary: SettingsImportSummary;
      warnings: string[];
      errors: string[];
    };

type SanitizedDomainList = {
  domains: string[];
  skipped: number;
};

type SanitizedRuleList = {
  rules: DomainRule[];
  skipped: number;
  duplicates: number;
};

type ImportableDeviceProxyResult =
  | {
      ok: true;
      deviceProxy: DeviceProxySettings;
    }
  | {
      ok: false;
      skipped: boolean;
      warning?: string;
    };

type SettingsImportStorageAdapters = {
  syncStorage?: StorageAreaAdapter;
  localStorage?: StorageAreaAdapter;
};

function emptySummary(): SettingsImportSummary {
  return {
    routeRules: {
      importable: 0,
      added: 0,
      duplicates: 0,
      skipped: 0
    },
    ignoredDomains: {
      importable: 0,
      added: 0,
      duplicates: 0,
      skipped: 0
    },
    denylist: {
      importable: 0,
      added: 0,
      duplicates: 0,
      skipped: 0
    },
    classificationOverrides: {
      importable: 0,
      addedOrUpdated: 0,
      skipped: 0
    },
    localProxyIncluded: false,
    localProxyWillBeApplied: false
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasValidCreatedAt(input: unknown): input is string {
  return typeof input === "string" && input.length > 0 && !Number.isNaN(Date.parse(input));
}

function sanitizeRuleAction(input: unknown): RuleAction | null {
  if (input === undefined) {
    return "proxy";
  }

  return input === "proxy" || input === "direct" ? input : null;
}

function safeDomain(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = normalizeDomain(input);

  if (!normalized.ok || checkDenylistedHost(normalized.domain).denied) {
    return null;
  }

  return normalized.domain;
}

function sanitizeDomainListForBackup(input: unknown): SanitizedDomainList {
  if (!Array.isArray(input)) {
    return {
      domains: [],
      skipped: input === undefined ? 0 : 1
    };
  }

  const domains: string[] = [];
  const seenDomains = new Set<string>();
  let skipped = 0;

  for (const value of input) {
    const domain = safeDomain(value);

    if (!domain || seenDomains.has(domain)) {
      skipped += 1;
      continue;
    }

    seenDomains.add(domain);
    domains.push(domain);
  }

  return {
    domains,
    skipped
  };
}

function sanitizeExportSyncSettings(settings: SyncSettings): SyncSettings {
  const sanitized = sanitizeSyncSettings(settings);

  return {
    ...sanitized,
    ignoredDomains: sanitizeDomainListForBackup(sanitized.ignoredDomains).domains,
    denylist: sanitizeDomainListForBackup(sanitized.denylist).domains,
    classificationOverrides: sanitizeUserClassificationOverrides(sanitized.classificationOverrides)
  };
}

function sanitizeImportRule(input: unknown, importedAt: string): DomainRule | null {
  if (!isRecord(input) || typeof input.includeSubdomains !== "boolean") {
    return null;
  }

  if (input.mode !== undefined && input.mode !== "proxy") {
    return null;
  }

  const action = sanitizeRuleAction(input.action);

  if (!action) {
    return null;
  }

  const domain = safeDomain(input.domain);

  if (!domain) {
    return null;
  }

  return {
    domain,
    includeSubdomains: input.includeSubdomains,
    action,
    mode: "proxy",
    source: "import",
    createdAt: hasValidCreatedAt(input.createdAt) ? input.createdAt : importedAt
  };
}

function sanitizeImportRules(input: unknown, importedAt: string): SanitizedRuleList {
  if (!Array.isArray(input)) {
    return {
      rules: [],
      skipped: input === undefined ? 0 : 1,
      duplicates: 0
    };
  }

  const rules: DomainRule[] = [];
  const seenRules = new Set<string>();
  let skipped = 0;
  let duplicates = 0;

  for (const value of input) {
    const rule = sanitizeImportRule(value, importedAt);

    if (!rule) {
      skipped += 1;
      continue;
    }

    const key = ruleKey(rule);

    if (seenRules.has(key)) {
      duplicates += 1;
      continue;
    }

    seenRules.add(key);
    rules.push(rule);
  }

  return {
    rules,
    skipped,
    duplicates
  };
}

function countRawClassificationOverrides(input: unknown): number {
  if (!isRecord(input)) {
    return input === undefined ? 0 : 1;
  }

  let count = 0;

  if (isRecord(input.global)) {
    count += Object.keys(input.global).length;
  } else if (input.global !== undefined) {
    count += 1;
  }

  if (isRecord(input.site)) {
    for (const value of Object.values(input.site)) {
      count += isRecord(value) ? Object.keys(value).length : 1;
    }
  } else if (input.site !== undefined) {
    count += 1;
  }

  return count;
}

function countClassificationOverrides(overrides: UserClassificationOverrides): number {
  return (
    Object.keys(overrides.global).length +
    Object.values(overrides.site).reduce((total, siteOverrides) => total + Object.keys(siteOverrides).length, 0)
  );
}

function parseImportableDeviceProxy(input: unknown): ImportableDeviceProxyResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      skipped: true,
      warning: getMessage("backupProxyShapeSkipped")
    };
  }

  if (input.config === null) {
    return {
      ok: true,
      deviceProxy: {
        enabled: false,
        config: null
      }
    };
  }

  const validation = validateLocalProxyConfig(input.config);

  if (!validation.ok || validation.config.host.includes("@")) {
    return {
      ok: false,
      skipped: true,
      warning: getMessage("backupProxyInvalidSkipped")
    };
  }

  return {
    ok: true,
    deviceProxy: {
      enabled: input.enabled === true,
      config: validation.config
    }
  };
}

function sanitizeImportedSyncSettings(
  rawSyncSettings: Record<string, unknown>,
  importedAt: string
): {
  settings: SyncSettings;
  summary: Pick<
    SettingsImportSummary,
    "routeRules" | "ignoredDomains" | "denylist" | "classificationOverrides"
  >;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rules = sanitizeImportRules(rawSyncSettings.rules, importedAt);
  const ignoredDomains = sanitizeDomainListForBackup(rawSyncSettings.ignoredDomains);
  const denylist = sanitizeDomainListForBackup(rawSyncSettings.denylist);
  const rawClassificationCount = countRawClassificationOverrides(rawSyncSettings.classificationOverrides);
  const classificationOverrides = sanitizeUserClassificationOverrides(rawSyncSettings.classificationOverrides);
  const sanitizedClassificationCount = countClassificationOverrides(classificationOverrides);
  const classificationSkipped = Math.max(0, rawClassificationCount - sanitizedClassificationCount);

  if (rules.skipped > 0) {
    warnings.push(getMessage("backupRulesSkipped", [rules.skipped]));
  }

  if (rules.duplicates > 0) {
    warnings.push(getMessage("backupRuleDuplicates", [rules.duplicates]));
  }

  for (const conflict of findRouteTargetConflicts(rules.rules)) {
    errors.push(
      getMessage("backupImportedConflict", [
        conflict.domain,
        conflict.includeSubdomains
          ? getMessage("backupScopeIncludeSubdomains")
          : getMessage("backupScopeExact")
      ])
    );
  }

  if (ignoredDomains.skipped > 0) {
    warnings.push(getMessage("backupIgnoredSkipped", [ignoredDomains.skipped]));
  }

  if (denylist.skipped > 0) {
    warnings.push(getMessage("backupDenylistSkipped", [denylist.skipped]));
  }

  if (classificationSkipped > 0) {
    warnings.push(
      getMessage("backupOverridesSkipped", [classificationSkipped])
    );
  }

  return {
    settings: {
      rules: rules.rules,
      ignoredDomains: ignoredDomains.domains,
      denylist: denylist.domains,
      classificationOverrides
    },
    summary: {
      routeRules: {
        importable: rules.rules.length,
        added: 0,
        duplicates: rules.duplicates,
        skipped: rules.skipped
      },
      ignoredDomains: {
        importable: ignoredDomains.domains.length,
        added: 0,
        duplicates: 0,
        skipped: ignoredDomains.skipped
      },
      denylist: {
        importable: denylist.domains.length,
        added: 0,
        duplicates: 0,
        skipped: denylist.skipped
      },
      classificationOverrides: {
        importable: sanitizedClassificationCount,
        addedOrUpdated: 0,
        skipped: classificationSkipped
      }
    },
    warnings,
    errors
  };
}

function ruleKey(rule: Pick<DomainRule, "domain" | "includeSubdomains" | "action">): string {
  return `${getRouteTargetKey(rule)}:${rule.action}`;
}

function mergeRules(
  currentRules: readonly DomainRule[],
  importedRules: readonly DomainRule[]
): {
  rules: DomainRule[];
  added: number;
  duplicates: number;
  conflicts: string[];
} {
  const nextRules = [...currentRules];
  const seenRules = new Set(currentRules.map(ruleKey));
  let added = 0;
  let duplicates = 0;
  const conflicts: string[] = [];

  for (const rule of importedRules) {
    const key = ruleKey(rule);
    const targetKey = getRouteTargetKey(rule);
    const existingTargetRules = nextRules.filter((candidate) => getRouteTargetKey(candidate) === targetKey);
    const oppositeRule = existingTargetRules.find((candidate) => candidate.action !== rule.action);

    if (oppositeRule) {
      conflicts.push(
        getMessage("backupRuleConflictExisting", [
          rule.action === "proxy" ? getMessage("commonProxy") : getMessage("commonDirect"),
          oppositeRule.action === "proxy" ? getMessage("commonProxy") : getMessage("commonDirect"),
          rule.domain,
          rule.includeSubdomains ? getMessage("backupScopeIncludeSubdomains") : getMessage("backupScopeExact")
        ])
      );
      continue;
    }

    if (seenRules.has(key)) {
      duplicates += 1;
      continue;
    }

    seenRules.add(key);
    nextRules.push(rule);
    added += 1;
  }

  return {
    rules: nextRules,
    added,
    duplicates,
    conflicts
  };
}

function mergeDomainLists(
  currentDomains: readonly string[],
  importedDomains: readonly string[]
): {
  domains: string[];
  added: number;
  duplicates: number;
} {
  const nextDomains = [...currentDomains];
  const seenDomains = new Set(currentDomains);
  let added = 0;
  let duplicates = 0;

  for (const domain of importedDomains) {
    if (seenDomains.has(domain)) {
      duplicates += 1;
      continue;
    }

    seenDomains.add(domain);
    nextDomains.push(domain);
    added += 1;
  }

  return {
    domains: nextDomains,
    added,
    duplicates
  };
}

function mergeClassificationOverrides(
  currentOverrides: UserClassificationOverrides,
  importedOverrides: UserClassificationOverrides
): {
  classificationOverrides: UserClassificationOverrides;
  addedOrUpdated: number;
} {
  const sanitizedCurrent = sanitizeUserClassificationOverrides(currentOverrides);
  const sanitizedImported = sanitizeUserClassificationOverrides(importedOverrides);
  const global = { ...sanitizedCurrent.global };
  const site: UserClassificationOverrides["site"] = Object.fromEntries(
    Object.entries(sanitizedCurrent.site).map(([siteDomain, overrides]) => [siteDomain, { ...overrides }])
  );
  let addedOrUpdated = 0;

  for (const [domain, action] of Object.entries(sanitizedImported.global)) {
    if (global[domain] !== action) {
      addedOrUpdated += 1;
    }

    global[domain] = action;
  }

  for (const [siteDomain, importedSiteOverrides] of Object.entries(sanitizedImported.site)) {
    const nextSiteOverrides = site[siteDomain] ? { ...site[siteDomain] } : {};

    for (const [domain, action] of Object.entries(importedSiteOverrides)) {
      if (nextSiteOverrides[domain] !== action) {
        addedOrUpdated += 1;
      }

      nextSiteOverrides[domain] = action;
    }

    site[siteDomain] = nextSiteOverrides;
  }

  return {
    classificationOverrides: sanitizeUserClassificationOverrides({
      global,
      site
    }),
    addedOrUpdated
  };
}

export function buildSettingsExportDocument(
  syncSettings: SyncSettings,
  localSettings: LocalSettings,
  options: SettingsExportOptions = {}
): SettingsExportDocument {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const sanitizedSyncSettings = sanitizeExportSyncSettings(syncSettings);

  if (findRouteTargetConflicts(sanitizedSyncSettings.rules).length > 0) {
    throw new Error(getMessage("backupResolveConflictsExport"));
  }

  const document: SettingsExportDocument = {
    format: settingsExportFormat,
    version: settingsExportVersion,
    exportedAt,
    data: {
      syncSettings: sanitizedSyncSettings
    }
  };

  if (options.includeLocalProxyConfig === true) {
    document.data.localSettings = {
      deviceProxy: sanitizeLocalSettings(localSettings).deviceProxy
    };
  }

  return document;
}

export function serializeSettingsExport(
  syncSettings: SyncSettings,
  localSettings: LocalSettings,
  options: SettingsExportOptions = {}
): string {
  return `${JSON.stringify(buildSettingsExportDocument(syncSettings, localSettings, options), null, 2)}\n`;
}

export function previewSettingsImport(
  rawJson: string,
  currentSyncSettings: SyncSettings,
  currentLocalSettings: LocalSettings,
  importedAt = new Date().toISOString()
): SettingsImportPreview {
  const summary = emptySummary();
  const errors: string[] = [];

  if (rawJson.trim().length === 0) {
    return {
      ok: false,
      summary,
      warnings: [],
      errors: [getMessage("backupPasteJson")]
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      summary,
      warnings: [],
      errors: [getMessage("backupJsonParseFailed")]
    };
  }

  if (!isRecord(parsed)) {
    errors.push(getMessage("backupJsonObjectRequired"));
  } else {
    if (parsed.format !== settingsExportFormat) {
      errors.push(getMessage("backupWrongFormat"));
    }

    if (parsed.version !== settingsExportVersion) {
      errors.push(getMessage("backupUnsupportedVersion"));
    }
  }

  if (errors.length > 0 || !isRecord(parsed)) {
    return {
      ok: false,
      summary,
      warnings: [],
      errors
    };
  }

  if (!isRecord(parsed.data) || !isRecord(parsed.data.syncSettings)) {
    return {
      ok: false,
      summary,
      warnings: [],
      errors: [getMessage("backupMissingSyncData")]
    };
  }

  const importedSync = sanitizeImportedSyncSettings(parsed.data.syncSettings, importedAt);
  const currentSync = sanitizeSyncSettings(currentSyncSettings);
  const currentLocal = sanitizeLocalSettings(currentLocalSettings);
  const mergedRules = mergeRules(currentSync.rules, importedSync.settings.rules);
  const mergedIgnoredDomains = mergeDomainLists(currentSync.ignoredDomains, importedSync.settings.ignoredDomains);
  const mergedDenylist = mergeDomainLists(currentSync.denylist, importedSync.settings.denylist);
  const mergedClassificationOverrides = mergeClassificationOverrides(
    currentSync.classificationOverrides,
    importedSync.settings.classificationOverrides
  );
  const warnings = [...importedSync.warnings];
  const importErrors = [...importedSync.errors];
  const currentConflicts = findRouteTargetConflicts(currentSync.rules);

  if (currentConflicts.length > 0) {
    importErrors.push(getMessage("backupResolveConflictsImport"));
  }

  importErrors.push(...mergedRules.conflicts);
  let nextLocalSettings: LocalSettings | null = null;

  if ("localSettings" in parsed.data) {
    if (!isRecord(parsed.data.localSettings)) {
      warnings.push(getMessage("backupProxyShapeSkipped"));
    } else {
      const deviceProxy = parseImportableDeviceProxy(parsed.data.localSettings.deviceProxy);

      if (deviceProxy.ok) {
        nextLocalSettings = {
          ...currentLocal,
          deviceProxy: deviceProxy.deviceProxy
        };
        summary.localProxyIncluded = true;
        summary.localProxyWillBeApplied = true;
      } else if (deviceProxy.warning) {
        warnings.push(deviceProxy.warning);
      }
    }
  }

  summary.routeRules = {
    ...importedSync.summary.routeRules,
    added: mergedRules.added,
    duplicates: importedSync.summary.routeRules.duplicates + mergedRules.duplicates
  };
  summary.ignoredDomains = {
    ...importedSync.summary.ignoredDomains,
    added: mergedIgnoredDomains.added,
    duplicates: mergedIgnoredDomains.duplicates
  };
  summary.denylist = {
    ...importedSync.summary.denylist,
    added: mergedDenylist.added,
    duplicates: mergedDenylist.duplicates
  };
  summary.classificationOverrides = {
    ...importedSync.summary.classificationOverrides,
    addedOrUpdated: mergedClassificationOverrides.addedOrUpdated
  };

  if (importErrors.length > 0) {
    return {
      ok: false,
      summary,
      warnings,
      errors: [...new Set(importErrors)]
    };
  }

  return {
    ok: true,
    summary,
    warnings,
    errors: [],
    importedSyncSettings: importedSync.settings,
    nextSyncSettings: sanitizeSyncSettings({
      rules: mergedRules.rules,
      ignoredDomains: mergedIgnoredDomains.domains,
      denylist: mergedDenylist.domains,
      classificationOverrides: mergedClassificationOverrides.classificationOverrides
    }),
    nextLocalSettings
  };
}

export async function applySettingsImportPreview(
  preview: SettingsImportPreview,
  adapters: SettingsImportStorageAdapters = {}
): Promise<{
  syncSettings: SyncSettings;
  localSettings: LocalSettings | null;
}> {
  if (!preview.ok) {
    throw new Error(getMessage("backupPreviewValid"));
  }

  const currentSyncSettings = await getSyncSettings(adapters.syncStorage);
  const currentConflicts = findRouteTargetConflicts(currentSyncSettings.rules);

  if (currentConflicts.length > 0) {
    throw new Error(getMessage("backupResolveThenPreview"));
  }

  const mergedRules = mergeRules(currentSyncSettings.rules, preview.importedSyncSettings.rules);

  if (mergedRules.conflicts.length > 0) {
    throw new Error(getMessage("backupRulesChanged"));
  }

  const mergedIgnoredDomains = mergeDomainLists(
    currentSyncSettings.ignoredDomains,
    preview.importedSyncSettings.ignoredDomains
  );
  const mergedDenylist = mergeDomainLists(currentSyncSettings.denylist, preview.importedSyncSettings.denylist);
  const mergedClassificationOverrides = mergeClassificationOverrides(
    currentSyncSettings.classificationOverrides,
    preview.importedSyncSettings.classificationOverrides
  );
  const finalSyncSettings = sanitizeSyncSettings({
    rules: mergedRules.rules,
    ignoredDomains: mergedIgnoredDomains.domains,
    denylist: mergedDenylist.domains,
    classificationOverrides: mergedClassificationOverrides.classificationOverrides
  });

  if (JSON.stringify(finalSyncSettings) !== JSON.stringify(preview.nextSyncSettings)) {
    throw new Error(getMessage("backupSettingsChanged"));
  }

  const syncSettings = await setSyncSettings(finalSyncSettings, adapters.syncStorage);
  const localSettings =
    preview.nextLocalSettings === null
      ? null
      : await updateLocalSettings(
          {
            deviceProxy: preview.nextLocalSettings.deviceProxy
          },
          adapters.localStorage
        );

  return {
    syncSettings,
    localSettings
  };
}
