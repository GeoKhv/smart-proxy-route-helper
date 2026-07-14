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
import { findEffectiveDomainRule, findRedundantDomainRules } from "../rules/domainMatcher";
import { normalizeDomain } from "../rules/normalizeDomain";
import {
  checkRouteTargetAddition,
  describeRouteTarget,
  findRouteTargetConflicts,
  getRouteTargetKey
} from "../rules/routeTarget";
import type { DomainRule, RuleAction } from "../rules/ruleTypes";
import {
  getRuleScopeOptions,
  getRuleStableId,
  planRuleEdit,
  type RuleEditPlan,
  type RuleScope
} from "../rules/ruleEditing";
import {
  applySettingsImportPreview,
  previewSettingsImport,
  serializeSettingsExport,
  type SettingsImportPreview
} from "../settingsBackup/settingsBackup";
import { getLocalSettings, updateLocalSettings } from "../storage/localStore";
import {
  addSyncRules,
  getSyncSettings,
  resolveSyncRouteTargetConflict,
  updateSyncRule,
  updateSyncSettings
} from "../storage/syncStore";
import type { DeviceProxySettings, LocalSettings, SyncSettings } from "../storage/storageTypes";

const suggestedLocalProxyConfig: LocalProxyConfig = {
  scheme: "socks5",
  host: "127.0.0.1",
  port: 10808
};

type ReadySettingsImportPreview = Extract<SettingsImportPreview, { ok: true }>;
type FieldErrors = Partial<Record<"scheme" | "host" | "port" | "domain", string>>;

let pendingImportPreview: ReadySettingsImportPreview | null = null;
let currentSyncSettingsSnapshot: SyncSettings | null = null;
let editingRuleId: string | null = null;
let pendingRuleEditPlan: Extract<RuleEditPlan, { ok: true }> | null = null;

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
      reason?: "conflict";
      existingRule?: DomainRule;
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
  createdAt: string = new Date().toISOString(),
  action: RuleAction = "proxy"
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

  const proposedRule: DomainRule = {
    domain: normalized.domain,
    includeSubdomains,
    action,
    mode: "proxy",
    source: "manual",
    createdAt
  };
  const targetCheck = checkRouteTargetAddition(currentRules, proposedRule);

  if (targetCheck.status === "conflict") {
    return {
      ok: false,
      reason: "conflict",
      existingRule: targetCheck.existingRule,
      error: `A ${displayAction(targetCheck.existingRule.action)} rule already exists for this hostname and scope. Edit existing rule instead.`
    };
  }

  if (targetCheck.status === "duplicate") {
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
      proposedRule
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
  const conflicts = findRouteTargetConflicts(settings.rules);
  const conflictKeys = new Set(conflicts.map((conflict) => conflict.key));
  const visibleRules = settings.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => !conflictKeys.has(getRouteTargetKey(rule)));

  currentSyncSettingsSnapshot = settings;
  renderRouteTargetConflicts(settings);
  list.replaceChildren();

  if (visibleRules.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent =
      conflicts.length > 0 ? "Resolve the conflicting route targets above to return to a normal rule list." : "No synced route rules yet.";
    list.append(empty);
    return;
  }

  visibleRules.forEach(({ rule, index }) => {
    const item = document.createElement("li");
    item.className = "rule-item";

    const summary = document.createElement("div");
    const domain = document.createElement("div");
    domain.className = "rule-domain";
    domain.textContent = rule.domain;

    const metadata = document.createElement("div");
    metadata.className = "metadata";
    metadata.textContent = [
      rule.action === "direct" ? "Direct route" : "Proxy route",
      `source: ${rule.source}`,
      rule.includeSubdomains ? "includes subdomains" : "exact domain only"
    ].join(" · ");

    const actions = document.createElement("div");
    const editButton = document.createElement("button");
    const removeButton = document.createElement("button");
    actions.className = "rule-item-actions";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.dataset.editRuleId = getRuleStableId(rule);
    editButton.setAttribute("aria-label", `Edit route rule for ${rule.domain}`);
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.dataset.ruleIndex = String(index);
    removeButton.setAttribute("aria-label", `Remove route rule for ${rule.domain}`);

    actions.append(editButton, removeButton);
    summary.append(domain, metadata);
    item.append(summary, actions);
    list.append(item);
  });
}

function renderRouteTargetConflicts(settings: SyncSettings): void {
  const container = getElement<HTMLElement>("#route-rule-conflicts");
  const list = getElement<HTMLUListElement>("#route-rule-conflict-list");
  const conflicts = findRouteTargetConflicts(settings.rules);

  list.replaceChildren();
  container.hidden = conflicts.length === 0;

  for (const conflict of conflicts) {
    const item = document.createElement("li");
    const summary = document.createElement("div");
    const heading = document.createElement("div");
    const detail = document.createElement("div");
    const actions = document.createElement("div");
    const keepProxy = document.createElement("button");
    const keepDirect = document.createElement("button");
    const effectiveRule = findEffectiveDomainRule(conflict.domain, conflict.rules)?.rule;

    item.className = "rule-item conflict-item";
    heading.className = "rule-domain";
    heading.textContent = describeRouteTarget(conflict);
    detail.className = "metadata";
    detail.textContent = `Both Proxy and Direct are configured. ${
      effectiveRule
        ? `${displayAction(effectiveRule.action)} is temporarily effective because the newest createdAt wins, then the later stored position breaks a tie.`
        : "The runtime still uses its deterministic tie-breaker."
    }`;
    actions.className = "rule-item-actions";

    keepProxy.type = "button";
    keepProxy.textContent = "Keep Proxy";
    keepProxy.dataset.conflictTargetKey = conflict.key;
    keepProxy.dataset.keepAction = "proxy";
    keepProxy.setAttribute("aria-label", `Keep Proxy for ${describeRouteTarget(conflict)} and remove the Direct sibling`);

    keepDirect.type = "button";
    keepDirect.textContent = "Keep Direct";
    keepDirect.dataset.conflictTargetKey = conflict.key;
    keepDirect.dataset.keepAction = "direct";
    keepDirect.setAttribute("aria-label", `Keep Direct for ${describeRouteTarget(conflict)} and remove the Proxy sibling`);

    summary.append(heading, detail);
    actions.append(keepProxy, keepDirect);
    item.append(summary, actions);
    list.append(item);
  }
}

function displayAction(action: RuleAction): string {
  return action === "proxy" ? "Proxy" : "Direct";
}

function displayScope(rule: Pick<DomainRule, "includeSubdomains">): string {
  return rule.includeSubdomains ? "This domain and all subdomains" : "Exact hostname only";
}

function resetRuleEditPreview(message = "Preview the edit before saving."): void {
  pendingRuleEditPlan = null;
  getElement<HTMLButtonElement>("#save-rule-edit").disabled = true;
  setStatus(getElement<HTMLElement>("#rule-edit-preview"), message, "neutral");
}

function closeRuleEditor(): void {
  editingRuleId = null;
  pendingRuleEditPlan = null;
  getElement<HTMLElement>("#rule-editor").hidden = true;
  getElement<HTMLButtonElement>("#save-rule-edit").disabled = true;
  getElement<HTMLElement>("#rule-edit-preview").replaceChildren();
  setError("#rule-edit-domain-error");
}

function renderRuleEditorScopeOptions(domainInput: string, preferredScope?: RuleScope): void {
  const select = getElement<HTMLSelectElement>("#rule-edit-scope");
  const denylist = currentSyncSettingsSnapshot?.denylist ?? [];
  const options = getRuleScopeOptions(domainInput, denylist);
  const currentValue = preferredScope ?? (select.value as RuleScope);

  select.replaceChildren(
    ...options.map((scopeOption) => {
      const option = document.createElement("option");
      option.value = scopeOption.scope;
      option.textContent = `${scopeOption.label} — ${scopeOption.coverage.join(", ")}`;
      option.selected = scopeOption.scope === currentValue;
      return option;
    })
  );

  if (options.length > 0 && !options.some((scopeOption) => scopeOption.scope === currentValue)) {
    select.value = options[0].scope;
  }
}

function openRuleEditor(rule: DomainRule, settings: SyncSettings): void {
  const editor = getElement<HTMLElement>("#rule-editor");
  const currentScope: RuleScope = rule.includeSubdomains ? "hostname-and-subdomains" : "exact";

  currentSyncSettingsSnapshot = settings;
  editingRuleId = getRuleStableId(rule);
  getElement<HTMLInputElement>("#rule-edit-domain").value = rule.domain;
  getElement<HTMLSelectElement>("#rule-edit-action").value = rule.action;
  renderRuleEditorScopeOptions(rule.domain, currentScope);
  editor.hidden = false;
  setError("#rule-edit-domain-error");
  resetRuleEditPreview();
  getElement<HTMLInputElement>("#rule-edit-domain").focus();
}

function appendRuleEditPreviewLine(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement("p");
  const heading = document.createElement("strong");

  heading.textContent = `${label}: `;
  row.append(heading, value);
  container.append(row);
}

function renderRuleEditPlan(plan: RuleEditPlan): void {
  const preview = getElement<HTMLElement>("#rule-edit-preview");
  const saveButton = getElement<HTMLButtonElement>("#save-rule-edit");

  preview.replaceChildren();
  pendingRuleEditPlan = null;
  saveButton.disabled = true;

  if (!plan.ok) {
    setStatus(preview, plan.error, plan.reason === "no-change" ? "neutral" : "error");
    return;
  }

  pendingRuleEditPlan = plan;
  preview.dataset.kind = "neutral";
  appendRuleEditPreviewLine(
    preview,
    "Current rule",
    `${plan.currentRule.domain} · ${displayScope(plan.currentRule)} · ${displayAction(plan.currentRule.action)}`
  );
  appendRuleEditPreviewLine(
    preview,
    "Proposed rule",
    `${plan.proposedRule.domain} · ${displayScope(plan.proposedRule)} · ${displayAction(plan.proposedRule.action)}`
  );

  if (plan.coverage.length > 0) {
    const coverageHeading = document.createElement("strong");
    const coverageList = document.createElement("ul");
    coverageHeading.textContent = "Coverage:";
    coverageList.className = "preview-list";
    plan.coverage.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      coverageList.append(item);
    });
    preview.append(coverageHeading, coverageList);
  }

  plan.warnings.forEach((warning) => {
    const note = document.createElement("p");
    note.className = "edit-warning";
    note.textContent = warning.message;
    preview.append(note);
  });
  saveButton.disabled = false;
}

function renderRuleCleanupSuggestions(settings: SyncSettings): void {
  const list = getElement<HTMLUListElement>("#rule-cleanup-list");
  const suggestions = findRedundantDomainRules(settings.rules);

  list.replaceChildren();

  if (suggestions.length === 0) {
    const empty = document.createElement("li");

    empty.className = "empty";
    empty.textContent = "No redundant route rules found.";
    list.append(empty);
    return;
  }

  suggestions.forEach((suggestion) => {
    const item = document.createElement("li");
    const summary = document.createElement("div");
    const domain = document.createElement("div");
    const metadata = document.createElement("div");
    const removeButton = document.createElement("button");

    item.className = "rule-item";
    domain.className = "rule-domain";
    metadata.className = "metadata";
    domain.textContent = `${suggestion.redundantRule.domain} (${suggestion.redundantRule.action})`;
    metadata.textContent = `${suggestion.reason} Covered by ${suggestion.coveringRule.domain}.`;
    removeButton.type = "button";
    removeButton.textContent = "Remove suggestion";
    removeButton.dataset.cleanupRuleIndex = String(suggestion.redundantRuleIndex);
    removeButton.setAttribute("aria-label", `Remove redundant rule for ${suggestion.redundantRule.domain}`);

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
  const includeSubdomains = getElement<HTMLSelectElement>("#rule-scope").value === "hostname-and-subdomains";
  const action = getElement<HTMLSelectElement>("#rule-action").value === "direct" ? "direct" : "proxy";
  const current = await getSyncSettings();
  const addResult = addDomainRule(current.rules, input.value, includeSubdomains, new Date().toISOString(), action);

  if (!addResult.ok) {
    const message = addResult.error;
    setError("#rule-domain-error", message);
    setStatus(status, message, "error");
    renderRules(current);
    renderStoredLists(current);
    renderClassificationOverrides(current);
    return;
  }

  if (addResult.status === "duplicate") {
    renderRules(current);
    renderStoredLists(current);
    renderClassificationOverrides(current);
    renderRuleCleanupSuggestions(current);
    setStatus(status, `${addResult.normalizedDomain} already has that synced route rule.`, "neutral");
    return;
  }

  const proposedRule = addResult.rules[current.rules.length];
  const finalAdd = await addSyncRules([proposedRule]);

  if (!finalAdd.ok) {
    renderRules(finalAdd.settings);
    renderStoredLists(finalAdd.settings);
    renderClassificationOverrides(finalAdd.settings);
    setError("#rule-domain-error", finalAdd.error);
    setStatus(status, finalAdd.error, "error");
    return;
  }

  const updated = finalAdd.settings;

  renderRules(updated);
  renderStoredLists(updated);
  renderClassificationOverrides(updated);
  renderRuleCleanupSuggestions(updated);

  if (finalAdd.addedRules.length === 0) {
    setStatus(status, `${addResult.normalizedDomain} already has that synced route rule.`, "neutral");
    return;
  }

  input.value = "";
  setStatus(status, `Added synced ${action} rule for ${addResult.normalizedDomain}.`, "success");
}

async function handleRouteTargetConflictClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
    "button[data-conflict-target-key][data-keep-action]"
  );

  if (!button?.dataset.conflictTargetKey) {
    return;
  }

  const keepAction = button.dataset.keepAction === "direct" ? "direct" : "proxy";
  const result = await resolveSyncRouteTargetConflict(button.dataset.conflictTargetKey, keepAction);
  const status = getElement<HTMLElement>("#route-rule-conflict-status");

  renderRules(result.settings);
  renderStoredLists(result.settings);
  renderClassificationOverrides(result.settings);
  renderRuleCleanupSuggestions(result.settings);

  if (!result.ok) {
    setStatus(status, result.error, "error");
    return;
  }

  setStatus(
    status,
    `${displayAction(result.keptRule.action)} will remain for ${describeRouteTarget(result.keptRule)}. ${result.removedRules.length} contradictory sibling rule${result.removedRules.length === 1 ? " was" : "s were"} removed in one synced write.`,
    "success"
  );
}

function handleRuleEditorInput(event: Event): void {
  setError("#rule-edit-domain-error");

  if ((event.target as HTMLElement | null)?.id === "rule-edit-domain") {
    renderRuleEditorScopeOptions(getElement<HTMLInputElement>("#rule-edit-domain").value);
  }

  resetRuleEditPreview("Changes are not saved yet. Preview the edit to continue.");
}

async function handleRuleEditPreview(): Promise<void> {
  if (!editingRuleId) {
    setStatus(getElement<HTMLElement>("#rule-edit-preview"), "Choose a rule to edit first.", "error");
    return;
  }

  const settings = await getSyncSettings();
  currentSyncSettingsSnapshot = settings;
  const plan = planRuleEdit(
    settings.rules,
    editingRuleId,
    {
      domain: getElement<HTMLInputElement>("#rule-edit-domain").value,
      action: getElement<HTMLSelectElement>("#rule-edit-action").value === "direct" ? "direct" : "proxy",
      scope: getElement<HTMLSelectElement>("#rule-edit-scope").value as RuleScope
    },
    settings.denylist
  );

  if (!plan.ok && plan.reason === "invalid-domain") {
    setError("#rule-edit-domain-error", plan.error);
  }

  renderRuleEditPlan(plan);
}

async function handleRuleEditSave(): Promise<void> {
  const plan = pendingRuleEditPlan;
  const status = getElement<HTMLElement>("#rule-status");

  if (!plan) {
    setStatus(status, "Preview a valid rule edit before saving.", "error");
    return;
  }

  const updateResult = await updateSyncRule(plan.ruleId, plan.proposedRule);

  if (!updateResult.ok) {
    currentSyncSettingsSnapshot = updateResult.settings;
    renderRuleEditPlan({
      ok: false,
      reason: "conflict",
      error: updateResult.error
    });
    setStatus(status, updateResult.error, "error");
    return;
  }

  renderRules(updateResult.settings);
  renderStoredLists(updateResult.settings);
  renderClassificationOverrides(updateResult.settings);
  renderRuleCleanupSuggestions(updateResult.settings);
  closeRuleEditor();
  setStatus(
    status,
    `Updated ${updateResult.updatedRule.domain} atomically. The existing rule identity and metadata were preserved.`,
    "success"
  );
}

async function handleRuleListClick(event: MouseEvent): Promise<void> {
  const editButton = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-edit-rule-id]");

  if (editButton?.dataset.editRuleId) {
    const settings = await getSyncSettings();
    const rule = settings.rules.find((candidate) => getRuleStableId(candidate) === editButton.dataset.editRuleId);

    if (!rule) {
      setStatus(getElement<HTMLElement>("#rule-status"), "That rule is no longer available. Refresh and try again.", "error");
      renderRules(settings);
      return;
    }

    openRuleEditor(rule, settings);
    setStatus(getElement<HTMLElement>("#rule-status"), `Editing ${rule.domain}. Nothing changes until Save changes.`, "neutral");
    return;
  }

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
  closeRuleEditor();
  setStatus(getElement<HTMLElement>("#rule-status"), "Synced rule removed.", "success");
  renderRuleCleanupSuggestions(updated);
}

async function handleRuleCleanupClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-cleanup-rule-index]");

  if (!button) {
    return;
  }

  const index = Number(button.dataset.cleanupRuleIndex);
  const updated = await updateSyncSettings((current) => ({
    ...current,
    rules: removeRuleAtIndex(current.rules, index)
  }));

  renderRules(updated);
  renderStoredLists(updated);
  renderClassificationOverrides(updated);
  renderRuleCleanupSuggestions(updated);
  setStatus(getElement<HTMLElement>("#rule-cleanup-status"), "Redundant rule removed after confirmation.", "success");
}

async function handleFindRedundantRulesClick(): Promise<void> {
  const settings = await getSyncSettings();

  renderRuleCleanupSuggestions(settings);
  setStatus(getElement<HTMLElement>("#rule-cleanup-status"), "Rule cleanup scan complete. Nothing was removed automatically.", "success");
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
    renderRuleCleanupSuggestions(result.syncSettings);

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
  setStatus(getElement<HTMLElement>("#rule-cleanup-status"), "Run a scan to find redundant route rules.", "neutral");
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
  getElement<HTMLUListElement>("#route-rule-conflict-list").addEventListener("click", (event) => {
    void handleRouteTargetConflictClick(event);
  });
  getElement<HTMLInputElement>("#rule-edit-domain").addEventListener("input", handleRuleEditorInput);
  getElement<HTMLSelectElement>("#rule-edit-action").addEventListener("change", handleRuleEditorInput);
  getElement<HTMLSelectElement>("#rule-edit-scope").addEventListener("change", handleRuleEditorInput);
  getElement<HTMLButtonElement>("#preview-rule-edit").addEventListener("click", () => {
    void handleRuleEditPreview().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#rule-edit-preview"),
        error instanceof Error ? error.message : "Could not preview the rule edit.",
        "error"
      );
    });
  });
  getElement<HTMLButtonElement>("#save-rule-edit").addEventListener("click", () => {
    void handleRuleEditSave().catch((error: unknown) => {
      setStatus(
        getElement<HTMLElement>("#rule-status"),
        error instanceof Error ? error.message : "Could not save the rule edit.",
        "error"
      );
    });
  });
  getElement<HTMLButtonElement>("#cancel-rule-edit").addEventListener("click", () => {
    closeRuleEditor();
    setStatus(getElement<HTMLElement>("#rule-status"), "Rule edit cancelled. No rule was changed.", "neutral");
  });
  getElement<HTMLButtonElement>("#find-redundant-rules").addEventListener("click", () => {
    void handleFindRedundantRulesClick();
  });
  getElement<HTMLUListElement>("#rule-cleanup-list").addEventListener("click", (event) => {
    void handleRuleCleanupClick(event);
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
