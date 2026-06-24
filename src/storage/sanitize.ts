import { validateLocalProxyConfig } from "../proxy/proxyConfig";
import type { DomainRule, RuleSource } from "../rules/ruleTypes";
import { isDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";
import { createDefaultLocalSettings, createDefaultSyncSettings } from "./defaults";
import type { DeviceProxySettings, DiagnosticsSettings, LocalSettings, SyncSettings } from "./storageTypes";

const validRuleSources = new Set<RuleSource>(["manual", "diagnostic", "import"]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function hasValidCreatedAt(input: unknown): input is string {
  return typeof input === "string" && input.length > 0 && !Number.isNaN(Date.parse(input));
}

function sanitizeDomainList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const domains: string[] = [];
  const seenDomains = new Set<string>();

  for (const value of input) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeDomain(value);

    if (!normalized.ok || seenDomains.has(normalized.domain)) {
      continue;
    }

    seenDomains.add(normalized.domain);
    domains.push(normalized.domain);
  }

  return domains;
}

function sanitizeDomainRule(input: unknown): DomainRule | null {
  if (!isRecord(input)) {
    return null;
  }

  if (input.mode !== "proxy" || typeof input.includeSubdomains !== "boolean") {
    return null;
  }

  if (typeof input.source !== "string" || !validRuleSources.has(input.source as RuleSource)) {
    return null;
  }

  if (!hasValidCreatedAt(input.createdAt)) {
    return null;
  }

  if (typeof input.domain !== "string") {
    return null;
  }

  const normalized = normalizeDomain(input.domain);

  if (!normalized.ok || isDenylistedHost(normalized.domain)) {
    return null;
  }

  return {
    domain: normalized.domain,
    includeSubdomains: input.includeSubdomains,
    mode: "proxy",
    source: input.source as RuleSource,
    createdAt: input.createdAt
  };
}

function sanitizeRules(input: unknown): DomainRule[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const rules: DomainRule[] = [];
  const seenRules = new Set<string>();

  for (const value of input) {
    const rule = sanitizeDomainRule(value);

    if (!rule) {
      continue;
    }

    const key = `${rule.domain}:${String(rule.includeSubdomains)}`;

    if (seenRules.has(key)) {
      continue;
    }

    seenRules.add(key);
    rules.push(rule);
  }

  return rules;
}

function sanitizeDeviceProxy(input: unknown): DeviceProxySettings {
  if (!isRecord(input)) {
    return createDefaultLocalSettings().deviceProxy;
  }

  const proxyConfig = validateLocalProxyConfig(input.config);
  const config = proxyConfig.ok && !proxyConfig.config.host.includes("@") ? proxyConfig.config : null;

  return {
    enabled: input.enabled === true && config !== null,
    config
  };
}

function sanitizeDiagnostics(input: unknown): DiagnosticsSettings {
  if (!isRecord(input)) {
    return createDefaultLocalSettings().diagnostics;
  }

  return {
    enabled: input.enabled === true
  };
}

export function sanitizeSyncSettings(input: unknown): SyncSettings {
  if (!isRecord(input)) {
    return createDefaultSyncSettings();
  }

  return {
    rules: sanitizeRules(input.rules),
    ignoredDomains: sanitizeDomainList(input.ignoredDomains),
    denylist: sanitizeDomainList(input.denylist)
  };
}

export function sanitizeLocalSettings(input: unknown): LocalSettings {
  if (!isRecord(input)) {
    return createDefaultLocalSettings();
  }

  return {
    deviceProxy: sanitizeDeviceProxy(input.deviceProxy),
    diagnostics: sanitizeDiagnostics(input.diagnostics)
  };
}
