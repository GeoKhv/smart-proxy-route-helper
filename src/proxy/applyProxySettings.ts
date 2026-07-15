import { getLocalSettings } from "../storage/localStore";
import { getMessage } from "../i18n/i18n";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../storage/storageTypes";
import { getSyncSettings } from "../storage/syncStore";
import { buildPacScript } from "./buildPac";

type StorageChanges = Record<string, chrome.storage.StorageChange>;
type StorageAreaName = chrome.storage.AreaName | string;

export type ProxySettingsAdapter = {
  applyPacScript(pacScript: string): Promise<void>;
  clearExtensionSettings(): Promise<void>;
};

export type ProxyApplyReason = "startup" | "storage-change" | "manual" | "diagnostic-restore";

export type ProxyClearReason =
  | "device-proxy-disabled"
  | "missing-local-proxy-config"
  | "invalid-local-proxy-config"
  | "empty-proxy-rules";

export type ProxyApplyPlan =
  | {
      action: "apply-pac";
      pacScript: string;
      proxyString: string;
      ruleCount: number;
      signature: string;
    }
  | {
      action: "clear";
      reason: ProxyClearReason;
      signature: string;
    };

export type ApplyProxySettingsResult =
  | {
      ok: true;
      status: "applied-pac";
      reason: ProxyApplyReason;
      signature: string;
      ruleCount: number;
      proxyString: string;
    }
  | {
      ok: true;
      status: "cleared";
      reason: ProxyApplyReason;
      signature: string;
      clearReason: ProxyClearReason;
    }
  | {
      ok: true;
      status: "unchanged";
      reason: ProxyApplyReason;
      signature: string;
    }
  | {
      ok: false;
      status: "failed";
      reason: ProxyApplyReason;
      attemptedAction: ProxyApplyPlan["action"] | "read-settings";
      errorMessage: string;
    };

export type ApplyProxySettingsOptions = {
  proxySettings: ProxySettingsAdapter;
  syncStorage?: StorageAreaAdapter;
  localStorage?: StorageAreaAdapter;
  lastAppliedSignature?: string | null;
  reason?: ProxyApplyReason;
};

export type ProxySettingsController = {
  apply(reason?: ProxyApplyReason, options?: { force?: boolean }): Promise<ApplyProxySettingsResult>;
  handleStorageChange(changes: StorageChanges, areaName: StorageAreaName): Promise<ApplyProxySettingsResult | null>;
};

export type ProxySettingsControllerOptions = {
  proxySettings?: ProxySettingsAdapter;
  syncStorage?: StorageAreaAdapter;
  localStorage?: StorageAreaAdapter;
  logger?: Pick<Console, "info" | "warn">;
};

const relevantStorageKeysByArea: Record<"sync" | "local", ReadonlySet<string>> = {
  sync: new Set(["rules"]),
  local: new Set(["deviceProxy"])
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return getMessage("proxyOperationFailed");
}

export function createChromeProxySettingsAdapter(): ProxySettingsAdapter {
  return {
    async applyPacScript(pacScript) {
      await chrome.proxy.settings.set({
        scope: "regular",
        value: {
          mode: "pac_script",
          pacScript: {
            data: pacScript,
            mandatory: false
          }
        }
      });
    },
    async clearExtensionSettings() {
      await chrome.proxy.settings.clear({
        scope: "regular"
      });
    }
  };
}

export function buildProxyApplyPlan(syncSettings: SyncSettings, localSettings: LocalSettings): ProxyApplyPlan {
  const { deviceProxy } = localSettings;

  if (!deviceProxy.enabled) {
    return {
      action: "clear",
      reason: "device-proxy-disabled",
      signature: "clear"
    };
  }

  if (deviceProxy.config === null) {
    return {
      action: "clear",
      reason: "missing-local-proxy-config",
      signature: "clear"
    };
  }

  const pacResult = buildPacScript({
    rules: syncSettings.rules,
    localProxyConfig: deviceProxy.config
  });

  if (!pacResult.ok) {
    return {
      action: "clear",
      reason: "invalid-local-proxy-config",
      signature: "clear"
    };
  }

  if (pacResult.rules.length === 0) {
    return {
      action: "clear",
      reason: "empty-proxy-rules",
      signature: "clear"
    };
  }

  return {
    action: "apply-pac",
    pacScript: pacResult.pacScript,
    proxyString: pacResult.proxyString,
    ruleCount: pacResult.rules.length,
    signature: `pac:${pacResult.pacScript}`
  };
}

export function hasRelevantStorageChange(changes: StorageChanges, areaName: StorageAreaName): boolean {
  if (areaName !== "sync" && areaName !== "local") {
    return false;
  }

  const relevantKeys = relevantStorageKeysByArea[areaName];

  return Object.keys(changes).some((key) => relevantKeys.has(key));
}

export async function applyProxySettings(options: ApplyProxySettingsOptions): Promise<ApplyProxySettingsResult> {
  const reason = options.reason ?? "manual";
  let plan: ProxyApplyPlan;

  try {
    const [syncSettings, localSettings] = await Promise.all([
      getSyncSettings(options.syncStorage),
      getLocalSettings(options.localStorage)
    ]);

    plan = buildProxyApplyPlan(syncSettings, localSettings);
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason,
      attemptedAction: "read-settings",
      errorMessage: errorMessage(error)
    };
  }

  if (plan.signature === options.lastAppliedSignature) {
    return {
      ok: true,
      status: "unchanged",
      reason,
      signature: plan.signature
    };
  }

  try {
    if (plan.action === "apply-pac") {
      await options.proxySettings.applyPacScript(plan.pacScript);

      return {
        ok: true,
        status: "applied-pac",
        reason,
        signature: plan.signature,
        ruleCount: plan.ruleCount,
        proxyString: plan.proxyString
      };
    }

    // Clearing releases this extension's proxy setting. It is safer than forcing
    // direct mode because it lets Chrome return to the user's/system proxy state.
    await options.proxySettings.clearExtensionSettings();

    return {
      ok: true,
      status: "cleared",
      reason,
      signature: plan.signature,
      clearReason: plan.reason
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason,
      attemptedAction: plan.action,
      errorMessage: errorMessage(error)
    };
  }
}

export function createProxySettingsController(options: ProxySettingsControllerOptions = {}): ProxySettingsController {
  const proxySettings = options.proxySettings ?? createChromeProxySettingsAdapter();
  const logger = options.logger ?? console;
  let lastAppliedSignature: string | null = null;
  let inFlight: Promise<ApplyProxySettingsResult> | null = null;
  let applyQueued = false;

  async function runApply(reason: ProxyApplyReason, force = false): Promise<ApplyProxySettingsResult> {
    const result = await applyProxySettings({
      proxySettings,
      syncStorage: options.syncStorage,
      localStorage: options.localStorage,
      lastAppliedSignature: force ? null : lastAppliedSignature,
      reason
    });

    if (result.ok) {
      lastAppliedSignature = result.signature;

      if (result.status === "applied-pac") {
        logger.info(`Applied local PAC proxy routing for ${result.ruleCount} rule(s).`);
      } else if (result.status === "cleared") {
        logger.info(`Cleared extension proxy routing: ${result.clearReason}.`);
      }
    } else {
      logger.warn(`Could not update proxy routing: ${result.errorMessage}`);
    }

    return result;
  }

  async function apply(
    reason: ProxyApplyReason = "manual",
    applyOptions: { force?: boolean } = {}
  ): Promise<ApplyProxySettingsResult> {
    if (inFlight) {
      applyQueued = true;
      return inFlight;
    }

    inFlight = (async () => {
      let result = await runApply(reason, applyOptions.force === true);

      while (applyQueued) {
        applyQueued = false;
        result = await runApply("storage-change");
      }

      return result;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  async function handleStorageChange(
    changes: StorageChanges,
    areaName: StorageAreaName
  ): Promise<ApplyProxySettingsResult | null> {
    if (!hasRelevantStorageChange(changes, areaName)) {
      return null;
    }

    return apply("storage-change");
  }

  return {
    apply,
    handleStorageChange
  };
}
