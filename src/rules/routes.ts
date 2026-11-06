import type { DomainRule } from "./ruleTypes";
import type { LocalSettings, SyncSettings } from "../storage/storageTypes";
import { buildPacProxyString, validateLocalProxyConfig, type LocalProxyConfig } from "../proxy/proxyConfig";

export type NamedRoute = { id: string; name: string };
export type RouteConnection = { type: "direct" } | { type: "proxy"; config: LocalProxyConfig | null };
export const defaultRoutes: readonly NamedRoute[] = [{ id: "work", name: "Work" }, { id: "life", name: "Life" }];
export const ruleRouteId = (rule: { routeId?: string }): string => rule.routeId ?? "work";
export const ruleDestination = (rule: Pick<DomainRule, "action" | "routeId">): string =>
  rule.action === "direct" ? "direct" : `proxy:${ruleRouteId(rule)}`;
export function routeList(settings: Pick<SyncSettings, "routes"> & Partial<Pick<SyncSettings, "rules">>): NamedRoute[] {
  const routes = (settings.routes ?? defaultRoutes).map(route => ({ ...route }));
  // A route catalog may arrive after its chunks through Sync. Keep orphaned
  // rules visible and blocked, rather than dropping them or routing directly.
  for (const rule of settings.rules ?? []) {
    const id = ruleRouteId(rule);
    if (!routes.some(route => route.id === id)) routes.push({ id, name: id });
  }
  return routes;
}
export const routeName = (settings: Pick<SyncSettings, "routes">, id: string): string =>
  routeList(settings).find(r => r.id === id)?.name ?? id;
export const routingEnabled = (settings: LocalSettings): boolean => settings.routingEnabled ?? settings.deviceProxy.enabled;
export function routeConnection(settings: LocalSettings, id: string): RouteConnection {
  return settings.routeConnections?.[id] ?? (id === "work"
    ? { type: "proxy", config: settings.deviceProxy.config }
    : id === "life" ? { type: "direct" } : { type: "proxy", config: null });
}
export function routeProxyString(settings: LocalSettings, id: string): string | null {
  const connection = routeConnection(settings, id);
  if (connection.type === "direct") return "DIRECT";
  const result = buildPacProxyString(connection.config);
  return result.ok ? result.proxyString : null;
}
export function sanitizeRoutes(input: unknown): NamedRoute[] {
  if (!Array.isArray(input) || input.length > 32) throw new Error("Invalid route catalog (maximum 32 routes).");
  const ids = new Set<string>();
  const routes = input.map(value => {
    if (!value || typeof value !== "object" || typeof value.id !== "string" ||
        !/^[a-z][a-z0-9-]{0,47}$/.test(value.id) || ["constructor", "prototype"].includes(value.id) ||
        typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 48 || ids.has(value.id)) {
      throw new Error("Invalid route name or duplicate route ID.");
    }
    ids.add(value.id);
    return { id: value.id, name: value.name.trim() };
  });
  if (!ids.has("work") || !ids.has("life")) throw new Error("Work and Life route IDs must be preserved.");
  return routes;
}
export function sanitizeConnections(input: unknown): Record<string, RouteConnection> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid local route connections.");
  const result: Record<string, RouteConnection> = {};
  for (const [id, value] of Object.entries(input)) {
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(id) || ["constructor", "prototype"].includes(id) || !value || typeof value !== "object") throw new Error("Invalid route connection.");
    if (value.type === "direct") result[id] = { type: "direct" };
    else if (value.type === "proxy" && value.config === null) result[id] = { type: "proxy", config: null };
    else if (value.type === "proxy") {
      const validation = validateLocalProxyConfig(value.config);
      if (!validation.ok || validation.config.host.includes("@")) throw new Error("Invalid route proxy configuration.");
      result[id] = { type: "proxy", config: validation.config };
    } else throw new Error("Invalid route connection type.");
  }
  return result;
}
