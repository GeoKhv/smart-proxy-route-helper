import { supportedLocalProxySchemes, validateLocalProxyConfig } from "../proxy/proxyConfig";
import type { LocalProxyConfig, LocalProxyScheme } from "../proxy/proxyConfig";
import {
  listUserClassificationOverrideEntries,
  removeUserClassificationOverride
} from "../domainClassification/userClassificationOverrides";
import type {
  UserClassificationGlobalOverride,
  UserClassificationOverrideEntry,
  UserClassificationOverrideTarget,
  UserClassificationSiteOverride
} from "../domainClassification/userClassificationOverrides";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";
import type { DomainRule } from "../rules/ruleTypes";
import {
  applySettingsImportPreview,
  previewSettingsImport,
  serializeSettingsExport,
  type SettingsImportPreview
} from "../settingsBackup/settingsBackup";
import { getLocalSettings, updateLocalSettings } from "../storage/localStore";
import { getSyncSettings, updateSyncSettings } from "../storage/syncStore";
import type { DeviceProxySettings, LocalSettings, SyncSettings } from "../storage/storageTypes";

const suggestedLocalProxyConfig: LocalProxyConfig = {
  scheme: "socks5",
  host: "127.0.0.1",
  port: 10808
};

type ReadySettingsImportPreview = Extract<SettingsImportPreview, { ok: true }>;
type FieldErrors = Partial<Record<"scheme" | "host" | "port" | "domain", string>>;

let pendingImportPreview: ReadySettingsImportPreview | null = null;

export type LocalProxyFormInput = {
  enabled: boolean;
  scheme: string;
  host: string;
  port: string;
};

export type LocalProxyFormResult =
  | {
      ok: true;
      deviceProxy: DeviceProxySettings;
    }
  | {
      ok: false;
      errors: FieldErrors;
    };

export type AddRuleResult =
  | {
      ok: true;
      rules: DomainRule[];
      normalizedDomain: string;
      status: "added" | "duplicate";
    }
  | {
      ok: false;
      error: string;
    };

function isLocalProxyScheme(input: string): input is LocalProxyScheme {
  return supportedLocalProxySchemes.includes(input as LocalProxyScheme);
}

function hasBlankProxyConfig(input: LocalProxyFormInput): boolean {
  return input.scheme.trim() === "" && input.host.trim() === "" && input.port.trim() === "";
}

function proxyValidationErrorField(errorCode: string): keyof FieldErrors {
  if (errorCode === "invalid-scheme") {
    return "scheme";
  }

  if (errorCode === "invalid-port") {
    return "port";
  }

  return "host";
}

export function parseLocalProxyForm(input: LocalProxyFormInput): LocalProxyFormResult {
  if (!input.enabled && hasBlankProxyConfig(input)) {
    return {
      ok: true,
      deviceProxy: {
        enabled: false,
        config: null
      }
    };
  }

  const port = Number(input.port);
  const validation = validateLocalProxyConfig({
    scheme: isLocalProxyScheme(input.scheme) ? input.scheme : input.scheme.trim(),
    host: input.host,
    port
  });

  if (!validation.ok) {
    return {
      ok: false,
      errors: {
        [proxyValidationErrorField(validation.error.code)]: validation.error.message
      }
    };
  }

  return {
    ok: true,
    deviceProxy: {
      enabled: input.enabled,
      config: validation.config
    }
  };
}

function denylistMessage(reason: string): string {
  const messages: Record<string, string> = {
    "internal-scheme": "Internal browser pages cannot be routed.",
    localhost: "Localhost cannot be routed.",
    "loopback-ip": "Loopback addresses cannot be routed.",
    "private-ip": "Private network addresses cannot be routed.",
    "internal-suffix": "Internal local domains cannot be routed.",
    "single-label-host": "Enter a public domain with a dot.",
    "invalid-host": "Enter a valid domain or URL."
  };

  return messages[reason] ?? "This domain cannot be routed.";
}

export function addDomainRule(
  currentRules: readonly DomainRule[],
  input: string,
  includeSubdomains: boolean,
  createdAt: string = new Date().toISOString()
): AddRuleResult {
  const normalized = normalizeDomain(input);

  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error.message
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      error: denylistMessage(denylist.reason)
    };
  }

  const duplicate = currentRules.some(
    (rule) => rule.domain === normalized.domain && rule.includeSubdomains === includeSubdomains
  );

  if (duplicate) {
    return {
      ok: true,
      rules: [...currentRules],
      normalizedDomain: normalized.domain,
      status: "duplicate"
    };
  }

  return {
    ok: true,
    rules: [
      ...currentRules,
      {
        domain: normalized.domain,
        includeSubdomains,
        mode: "proxy",
        source: "manual",
        createdAt
      }
    ],
    normalizedDomain: normalized.domain,
    status: "added"
  };
}

export function removeRuleAtIndex(currentRules: readonly DomainRule[], index: number): DomainRule[] {
  if (!Number.isInteger(index) || index < 0 || index >= currentRules.length) {
    return [...currentRules];
  }

  return currentRules.filter((_, ruleIndex) => ruleIndex !== index);
}

function getElement<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing options page element: ${selector}`);
  }

  return element;
}

function setStatus(element: HTMLElement, message: string, kind: "success" | "error" | "neutral" = "neutral"): void {
  element.textContent = message;
  element.dataset.kind = kind;
}

function setError(selector: string, message = ""): void {
  getElement<HTMLElement>(selector).textContent = message;
}

function clearProxyErrors(): void {
  setError("#proxy-scheme-error");
  setError("#proxy-host-error");
  setError("#proxy-port-error");
}

function renderLocalSettings(settings: LocalSettings): void {
  const config = settings.deviceProxy.config ?? suggestedLocalProxyConfig;

  getElement<HTMLInputElement>("#proxy-enabled").checked = settings.deviceProxy.enabled;
  getElement<HTMLSelectElement>("#proxy-scheme").value = config.scheme;
  getElement<HTMLInputElement>("#proxy-host").value = config.host;
  getElement<HTMLInputElement>("#proxy-port").value = String(config.port);
}

function localProxyFormInput(): LocalProxyFormInput {
  return {
    enabled: getElement<HTMLInputElement>("#proxy-enabled").checked,
    scheme: getElement<HTMLSelectElement>("#proxy-scheme").value,
    host: getElement<HTMLInputElement>("#proxy-host").value,
    port: getElement<HTMLInputElement>("#proxy-port").value
  };
}

function renderRules(settings: SyncSettings): void {
  const list = getElement<HTMLUListElement>("#rule-list");
  list.replaceChildren();

  if (settings.rules.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No synced proxy rules yet.";
    list.append(empty);
    return;
  }

  settings.rules.forEach((rule, index) => {
    const item = document.createElement("li");
    item.className = "rule-item";

    const summary = document.createElement("div");
    const domain = document.createElement("div");
    domain.className = "rule-domain";
    domain.textContent = rule.domain;

    const metadata = document.createElement("div");
    metadata.className = "metadata";
    metadata.textContent = [
      `mode: ${rule.mode}`,
      `source: ${rule.source}`,
      rule.includeSubdomains ? "includes subdomains" : "exact domain only"
    ].join(" · ");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.dataset.ruleIndex = String(index);
    removeButton.setAttribute("aria-label", `Remove ${rule.domain}`);

    summary.append(domain, metadata);
    item.append(summary, removeButton);
    list.append(item);
  });
}

function renderStoredLists(settings: SyncSettings): void {
  const summary = getElement<HTMLElement>("#denylist-summary");
  const denylistText =
    settings.denylist.length > 0 ? `Denylist: ${settings.denylist.join(", ")}` : "Denylist: no stored entries.";
  const ignoredText =
    settings.ignoredDomains.length > 0
      ? `Ignored domains: ${settings.ignoredDomains.join(", ")}`
      : "Ignored domains: no stored entries.";

  summary.textContent = `${denylistText} ${ignoredText}`;
}

function classificationOverrideActionText(
  action: UserClassificationGlobalOverride | UserClassificationSiteOverride
): string {
  const labels: Record<UserClassificationGlobalOverride | UserClassificationSiteOverride, string> = {
    ignored: "ignored",
    review: "manual review",
    suggested: "suggested"
  };

  return labels[action];
}

function classificationOverrideMetadata(entry: UserClassificationOverrideEntry): string {
  if (entry.scope === "global") {
    return `global override · ${classificationOverrideActionText(entry.action)}`;
  }

  return `site override for ${entry.siteDomain} · ${classificationOverrideActionText(entry.action)}`;
}

function overrideTargetFromButton(button: HTMLButtonElement): UserClassificationOverrideTarget | null {
  const scope = button.dataset.overrideScope;
  const domain = button.dataset.overrideDomain;

  if (scope === "global" && domain) {
    return {
      scope,
      domain
    };
  }

  const siteDomain = button.dataset.overrideSiteDomain;

  if (scope === "site" && siteDomain && domain) {
    return {
      scope,
      siteDomain,
      domain
    };
  }

  return null;
}

function renderClassificationOverrides(settings: SyncSettings): void {
  const list = getElement<HTMLUListElement>("#classification-overrides-list");
  const entries = listUserClassificationOverrideEntries(settings.classificationOverrides);

  list.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No synced classification overrides yet.";
    list.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "rule-item";

    const summary = document.createElement("div");
    const domain = document.createElement("div");
    domain.className = "rule-domain";
    domain.textContent = entry.domain;

    const metadata = document.createElement("div");
    metadata.className = "metadata";
    metadata.textContent = classificationOverrideMetadata(entry);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.dataset.overrideScope = entry.scope;
    removeButton.dataset.overrideDomain = entry.domain;

    if (entry.scope === "site") {
      removeButton.dataset.overrideSiteDomain = entry.siteDomain;
      removeButton.setAttribute("aria-label", `Remove override for ${entry.domain} on ${entry.siteDomain}`);
    } else {
      removeButton.setAttribute("aria-label", `Remove global override for ${entry.domain}`);
    }

    summary.append(domain, metadata);
    item.append(summary, removeButton);
    list.append(item);
  });
}

function plural(value: number, singular: string, pluralValue = `${singular}s`): string {
  return value === 1 ? singular : pluralValue;
}

function appendPreviewItem(list: HTMLUListElement, message: string, className?: string): void {
  const item = document.createElement("li");
  item.textContent = message;

  if (className) {
    item.className = className;
  }

  list.append(item);
}

function renderImportPreview(preview: SettingsImportPreview): void {
  const container = getElement<HTMLElement>("#import-preview");
  const list = document.createElement("ul");
  list.className = "preview-list";
  container.replaceChildren();

  if (!preview.ok) {
    preview.errors.forEach((error) => appendPreviewItem(list, error, "error"));
    preview.warnings.forEach((warning) => appendPreviewItem(list, warning));
    container.append(list);
    return;
  }

  const { summary } = preview;

  appendPreviewItem(
    list,
    `Route rules: ${summary.routeRules.importable} ${plural(
      summary.routeRules.importable,
      "rule"
    )} importable, ${summary.routeRules.added} new, ${summary.routeRules.duplicates} duplicate ${plural(
      summary.routeRules.duplicates,
      "match",
      "matches"
    )}, ${summary.routeRules.skipped} skipped.`
  );
  appendPreviewItem(
    list,
    `Classification overrides: ${summary.classificationOverrides.importable} importable, ${summary.classificationOverrides.addedOrUpdated} added or updated, ${summary.classificationOverrides.skipped} skipped.`
  );
  appendPreviewItem(
    list,
    `Ignored domains: ${summary.ignoredDomains.importable} importable, ${summary.ignoredDomains.added} new, ${summary.ignoredDomains.duplicates} duplicate, ${summary.ignoredDomains.skipped} skipped.`
  );
  appendPreviewItem(
    list,
    `Denylist: ${summary.denylist.importable} importable, ${summary.denylist.added} new, ${summary.denylist.duplicates} duplicate, ${summary.denylist.skipped} skipped.`
  );
  appendPreviewItem(
    list,
    summary.localProxyWillBeApplied
      ? "Local proxy config: included and will be applied after confirmation."
      : "Local proxy config: not included."
  );

  if (preview.warnings.length === 0) {
    appendPreviewItem(list, "Warnings: none.");
  } else {
    preview.warnings.forEach((warning) => appendPreviewItem(list, warning));
  }

  container.append(list);
}

async function refreshSyncView(): Promise<SyncSettings> {
  const settings = await getSyncSettings();
  renderRules(settings);
  renderStoredLists(settings);
  renderClassificationOverrides(settings);
  return settings;
}

async function handleLocalProxySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  clearProxyErrors();

  const status = getElement<HTMLElement>("#local-proxy-status");
  const parsed = parseLocalProxyForm(localProxyFormInput());

  if (!parsed.ok) {
    setError("#proxy-scheme-error", parsed.errors.scheme);
    setError("#proxy-host-error", parsed.errors.host);
    setError("#proxy-port-error", parsed.errors.port);
    setStatus(status, "Fix the highlighted local proxy setting before saving.", "error");
    return;
  }

  await updateLocalSettings((current) => ({
    ...current,
    deviceProxy: parsed.deviceProxy
  }));

  setStatus(status, "Local proxy settings saved on this device.", "success");
}

async function handleRuleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  setError("#rule-domain-error");

  const status = getElement<HTMLElement>("#rule-status");
  const input = getElement<HTMLInputElement>("#rule-domain");
  const includeSubdomains = getElement<HTMLInputElement>("#rule-subdomains").checked;
  const current = await getSyncSettings();
  const addResult = addDomainRule(current.rules, input.value, includeSubdomains);

  if (!addResult.ok) {
    const message = addResult.error;
    setError("#rule-domain-error", message);
    setStatus(status, message, "error");
    renderRules(current);
    renderStoredLists(current);
    return;
  }

  const updated =
    addResult.status === "duplicate"
      ? current
      : await updateSyncSettings({
          rules: addResult.rules
        });

  renderRules(updated);
  renderStoredLists(updated);
  renderClassificationOverrides(updated);

  if (addResult.status === "duplicate") {
    setStatus(status, `${addResult.normalizedDomain} is already in synced rules.`, "neutral");
    return;
  }

  input.value = "";
  setStatus(status, `Added synced rule for ${addResult.normalizedDomain}.`, "success");
}

async function handleRuleListClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-rule-index]");

  if (!button) {
    return;
  }

  const index = Number(button.dataset.ruleIndex);
  const updated = await updateSyncSettings((current) => ({
    ...current,
    rules: removeRuleAtIndex(current.rules, index)
  }));

  renderRules(updated);
  renderStoredLists(updated);
  renderClassificationOverrides(updated);
  setStatus(getElement<HTMLElement>("#rule-status"), "Synced rule removed.", "success");
}

async function handleClassificationOverrideListClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-override-scope]");

  if (!button) {
    return;
  }

  const target = overrideTargetFromButton(button);
  const status = getElement<HTMLElement>("#classification-overrides-status");

  if (!target) {
    setStatus(status, "Could not identify the classification override to remove.", "error");
    return;
  }

  const current = await getSyncSettings();
  const updated = await updateSyncSettings({
    classificationOverrides: removeUserClassificationOverride(current.classificationOverrides, target)
  });

  renderRules(updated);
  renderStoredLists(updated);
  renderClassificationOverrides(updated);
  setStatus(status, "Classification override removed.", "success");
}

async function handleSettingsExportClick(): Promise<void> {
  const status = getElement<HTMLElement>("#export-settings-status");

  try {
    const [syncSettings, localSettings] = await Promise.all([getSyncSettings(), getLocalSettings()]);
    const includeLocalProxyConfig = getElement<HTMLInputElement>("#backup-include-local-proxy").checked;
    const exportText = serializeSettingsExport(syncSettings, localSettings, {
      includeLocalProxyConfig
    });

    getElement<HTMLTextAreaElement>("#export-settings-output").value = exportText;
    setStatus(
      status,
      includeLocalProxyConfig
        ? "Export JSON generated with local proxy config included."
        : "Export JSON generated without local proxy config.",
      "success"
    );
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : "Could not export settings.", "error");
  }
}

async function handleImportPreviewClick(): Promise<void> {
  const status = getElement<HTMLElement>("#import-settings-status");
  const applyButton = getElement<HTMLButtonElement>("#apply-import-button");

  try {
    const [currentSyncSettings, currentLocalSettings] = await Promise.all([getSyncSettings(), getLocalSettings()]);
    const preview = previewSettingsImport(
      getElement<HTMLTextAreaElement>("#import-settings-input").value,
      currentSyncSettings,
      currentLocalSettings
    );

    renderImportPreview(preview);

    if (!preview.ok) {
      pendingImportPreview = null;
      applyButton.disabled = true;
      setStatus(status, "Fix the import JSON before applying changes.", "error");
      return;
    }

    pendingImportPreview = preview;
    applyButton.disabled = false;
    setStatus(status, "Import preview ready. Review it before applying changes.", "success");
  } catch (error) {
    pendingImportPreview = null;
    applyButton.disabled = true;
    setStatus(status, error instanceof Error ? error.message : "Could not preview import.", "error");
  }
}

async function handleApplyImportClick(): Promise<void> {
  const status = getElement<HTMLElement>("#import-settings-status");
  const applyButton = getElement<HTMLButtonElement>("#apply-import-button");

  if (!pendingImportPreview) {
    applyButton.disabled = true;
    setStatus(status, "Preview a valid import before applying it.", "error");
    return;
  }

  try {
    const result = await applySettingsImportPreview(pendingImportPreview);

    renderRules(result.syncSettings);
    renderStoredLists(result.syncSettings);
    renderClassificationOverrides(result.syncSettings);

    if (result.localSettings) {
      renderLocalSettings(result.localSettings);
      setStatus(getElement<HTMLElement>("#local-proxy-status"), "Local proxy settings restored on this device.", "success");
    }

    pendingImportPreview = null;
    applyButton.disabled = true;
    setStatus(status, "Import applied after explicit confirmation.", "success");
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : "Could not apply import.", "error");
  }
}

function clearPendingImportPreview(): void {
  pendingImportPreview = null;
  getElement<HTMLButtonElement>("#apply-import-button").disabled = true;
  getElement<HTMLElement>("#import-preview").textContent = "No import preview yet.";
  setStatus(getElement<HTMLElement>("#import-settings-status"), "Import preview cleared.", "neutral");
}

async function initOptionsPage(): Promise<void> {
  const [localSettings] = await Promise.all([getLocalSettings(), refreshSyncView()]);
  renderLocalSettings(localSettings);
  setStatus(getElement<HTMLElement>("#local-proxy-status"), "Loaded local settings.", "neutral");
  setStatus(getElement<HTMLElement>("#rule-status"), "Loaded synced rules.", "neutral");
  setStatus(getElement<HTMLElement>("#classification-overrides-status"), "Loaded classification overrides.", "neutral");
  setStatus(getElement<HTMLElement>("#export-settings-status"), "Backup export ready.", "neutral");
  setStatus(getElement<HTMLElement>("#import-settings-status"), "Paste export JSON to preview import.", "neutral");

  getElement<HTMLFormElement>("#local-proxy-form").addEventListener("submit", (event) => {
    void handleLocalProxySubmit(event);
  });
  getElement<HTMLFormElement>("#rule-form").addEventListener("submit", (event) => {
    void handleRuleSubmit(event);
  });
  getElement<HTMLUListElement>("#rule-list").addEventListener("click", (event) => {
    void handleRuleListClick(event);
  });
  getElement<HTMLUListElement>("#classification-overrides-list").addEventListener("click", (event) => {
    void handleClassificationOverrideListClick(event);
  });
  getElement<HTMLButtonElement>("#export-settings-button").addEventListener("click", () => {
    void handleSettingsExportClick();
  });
  getElement<HTMLButtonElement>("#preview-import-button").addEventListener("click", () => {
    void handleImportPreviewClick();
  });
  getElement<HTMLButtonElement>("#apply-import-button").addEventListener("click", () => {
    void handleApplyImportClick();
  });
  getElement<HTMLTextAreaElement>("#import-settings-input").addEventListener("input", () => {
    clearPendingImportPreview();
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    void initOptionsPage().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#local-proxy-status"),
        error instanceof Error ? error.message : "Could not load options.",
        "error"
      );
    });
  });
}
