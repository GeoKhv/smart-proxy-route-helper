import type { LocalProxyConfig } from "../proxy/proxyConfig";
import type { DomainRule } from "../rules/ruleTypes";
import type { UserClassificationOverrides } from "../domainClassification/userClassificationOverrides";

export type LanguagePreference = "auto" | "en" | "ru";

export type SyncSettings = {
  rules: DomainRule[];
  ignoredDomains: string[];
  denylist: string[];
  classificationOverrides: UserClassificationOverrides;
};

export type DeviceProxySettings = {
  enabled: boolean;
  config: LocalProxyConfig | null;
};

export type DiagnosticsSettings = {
  enabled: boolean;
};

export type LocalSettings = {
  deviceProxy: DeviceProxySettings;
  diagnostics: DiagnosticsSettings;
  language?: LanguagePreference;
};

export type StorageAreaAdapter = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type SettingsUpdate<TSettings extends object> =
  | Partial<TSettings>
  | ((current: TSettings) => Partial<TSettings> | TSettings);
