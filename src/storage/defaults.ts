import { createDefaultUserClassificationOverrides } from "../domainClassification/userClassificationOverrides";
import type { LocalSettings, SyncSettings } from "./storageTypes";

export const defaultSyncSettings: Readonly<SyncSettings> = {
  rules: [],
  ignoredDomains: [],
  denylist: [],
  classificationOverrides: createDefaultUserClassificationOverrides()
};

export const defaultLocalSettings: Readonly<LocalSettings> = {
  deviceProxy: {
    enabled: false,
    config: null
  },
  diagnostics: {
    enabled: false
  },
  language: "auto"
};

export function createDefaultSyncSettings(): SyncSettings {
  return {
    rules: [...defaultSyncSettings.rules],
    ignoredDomains: [...defaultSyncSettings.ignoredDomains],
    denylist: [...defaultSyncSettings.denylist],
    classificationOverrides: createDefaultUserClassificationOverrides()
  };
}

export function createDefaultLocalSettings(): LocalSettings {
  return {
    deviceProxy: {
      enabled: defaultLocalSettings.deviceProxy.enabled,
      config: defaultLocalSettings.deviceProxy.config
    },
    diagnostics: {
      enabled: defaultLocalSettings.diagnostics.enabled
    },
    language: defaultLocalSettings.language
  };
}
