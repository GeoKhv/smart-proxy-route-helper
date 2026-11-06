import { getMessage } from "../i18n/i18n";
import { buildProxyApplyPlan } from "./applyProxySettings";
import type { LocalSettings, SyncSettings } from "../storage/storageTypes";

export type BrowserProxyState = { levelOfControl?: string; value?: { mode?: string; pacScript?: { data?: string } } };
export function describeProxyControl(actual: BrowserProxyState, sync: SyncSettings, local: LocalSettings): { ok: boolean; message: string; diagnostic?: boolean } {
  const plan = buildProxyApplyPlan(sync, local);
  if (["not_controllable", "controlled_by_other_extensions"].includes(actual.levelOfControl ?? "")) {
    return { ok: false, message: getMessage("routesControlLost") };
  }
  if (actual.levelOfControl === "controlled_by_this_extension" && actual.value?.pacScript?.data?.startsWith("// Smart Proxy diagnostic override\n")) return { ok: true, diagnostic: true, message: getMessage("routesTestActive") };
  if (plan.action === "clear") return { ok: true, message: getMessage("routesReleased") };
  const applied = actual.levelOfControl === "controlled_by_this_extension" && actual.value?.mode === "pac_script" && actual.value.pacScript?.data === plan.pacScript;
  return { ok: applied, message: getMessage(applied ? "routesPacApplied" : "routesPacMissing") };
}

export async function renderProxyHealth(element: HTMLElement, sync: SyncSettings, local: LocalSettings, compact = false): Promise<void> {
  try {
    const actual = await chrome.proxy.settings.get({ incognito: false });
    const health = describeProxyControl(actual, sync, local);
    const plan = buildProxyApplyPlan(sync, local);
    element.textContent = compact && health.ok && !health.diagnostic ? getMessage(plan.action === "clear" ? "routesReleasedShort" : "routesPacShort") : health.message;
    element.dataset.kind = health.ok ? "neutral" : "error";
  } catch {
    element.textContent = getMessage("routesControlUnknown");
    element.dataset.kind = "error";
  }
}
