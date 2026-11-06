import type { DomainRule } from "../rules/ruleTypes";
import { ruleRouteId, sanitizeRoutes, type NamedRoute } from "../rules/routes";
import type { StorageAreaAdapter } from "./storageTypes";
import { RuleChunkStorageError, isRulesMeta, packRulesIntoChunks, reconstructRulesFromChunks,
  ruleChunkStorageKeys, rulesMatchExactly, rulesMetaStorageKey, type RulesMeta } from "./ruleChunks";

// Never use the legacy prefix: installed 0.3.x readers must not see these rules.
export const namedRulesMetaKey = "namedRoutesV1";
export const namedRulesChunkPrefix = "namedRulesChunkV1:";
const namedKey = (key: string) => key.replace(/^rulesChunk:/, namedRulesChunkPrefix);
export type NamedRulesMeta = { version: 1; rules: RulesMeta; routes?: NamedRoute[]; workTransition?: { from: string | null; to: string } };

export function verifySplitActivation(workMeta: unknown, namedMeta: unknown): void {
  const work = workMeta as (RulesMeta & { namedEpoch?: string }) | undefined;
  const named = namedMeta as NamedRulesMeta | undefined;
  if ((work?.namedEpoch !== undefined && work.namedEpoch !== named?.workTransition?.to) ||
      (named?.workTransition && (work?.generation ?? null) === named.workTransition.from)) {
    throw new RuleChunkStorageError("incomplete", "Work and named route activation are still synchronizing.");
  }
}

type OrderedNamedRule = DomainRule & { workPredecessor?: string | null };
const workIdentity = (rule: DomainRule): string => rule.id ?? JSON.stringify([rule.domain, rule.includeSubdomains, rule.action, rule.source, rule.createdAt]);

// Keep the original cross-list order for timestamp ties without copying Work
// rules into the protected namespace. Old writers may strip routeId: "work",
// so the anchor deliberately does not include that optional field.
export function mergeNamedRules(work: DomainRule[], named: DomainRule[]): DomainRule[] {
  const merged = [...work];
  for (const rule of [...named].reverse() as OrderedNamedRule[]) {
    const predecessor = rule.workPredecessor;
    const index = predecessor === null ? -1 : work.findIndex(candidate => workIdentity(candidate) === predecessor);
    const anchor = index >= 0 ? merged.indexOf(work[index]) : predecessor === null ? -1 : work.length ? merged.indexOf(work[work.length - 1]) : -1;
    const { workPredecessor: _anchor, ...clean } = rule;
    merged.splice(anchor + 1, 0, clean);
  }
  return merged;
}

export async function readNamedRules(storage: StorageAreaAdapter, value: unknown): Promise<{ rules: DomainRule[]; routes?: NamedRoute[] }> {
  if (value === undefined) return { rules: [] };
  const meta = value as NamedRulesMeta;
  if (!meta || meta.version !== 1 || !isRulesMeta(meta.rules)) {
    throw new RuleChunkStorageError("incomplete", "Named route metadata is incomplete or unsupported.");
  }
  const keys = ruleChunkStorageKeys(meta.rules);
  const stored = await storage.get(keys.map(namedKey));
  const rules = reconstructRulesFromChunks(meta.rules, Object.fromEntries(keys.map(key => [key, stored[namedKey(key)]])));
  if (rules.some(rule => ruleRouteId(rule) === "work")) {
    throw new RuleChunkStorageError("incomplete", "Named route storage unexpectedly contains Work rules.");
  }
  return { rules, ...(meta.routes !== undefined ? { routes: sanitizeRoutes(meta.routes) } : {}) };
}

function equal(a: unknown, b: unknown): boolean {
  const stable = (value: unknown): string => JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  return stable(a) === stable(b);
}

// A single local activation publishes both pointers. Independent edits only
// advance their own pointer, so editing Life never rewrites a received Work list.
// Sync itself is not a distributed transaction: incomplete generations throw,
// letting the controller retain its last verified PAC rather than use half a list.
export async function commitSplitRules(
  storage: StorageAreaAdapter,
  work: DomainRule[],
  named: DomainRule[],
  routes: NamedRoute[] | undefined,
  otherSettings: Record<string, unknown>,
  orderedRules: DomainRule[]
): Promise<void> {
  let predecessor: string | null = null;
  const orderedNamed: OrderedNamedRule[] = [];
  for (const rule of orderedRules) {
    if (ruleRouteId(rule) === "work") predecessor = workIdentity(rule);
    else orderedNamed.push({ ...rule, workPredecessor: predecessor });
  }
  named = orderedNamed;
  const before = await storage.get(["rules", rulesMetaStorageKey, namedRulesMetaKey, "routes", ...Object.keys(otherSettings)]);
  const oldWorkMeta = isRulesMeta(before[rulesMetaStorageKey]) ? before[rulesMetaStorageKey] : undefined;
  let oldWork: DomainRule[];
  if (oldWorkMeta) oldWork = reconstructRulesFromChunks(oldWorkMeta, await storage.get(ruleChunkStorageKeys(oldWorkMeta)));
  else if (before[rulesMetaStorageKey] !== undefined) throw new RuleChunkStorageError("incomplete", "Work metadata is unsupported.");
  else oldWork = Array.isArray(before.rules) ? before.rules as DomainRule[] : [];
  const oldNamed = await readNamedRules(storage, before[namedRulesMetaKey]);
  const workChanged = !rulesMatchExactly(work, oldWork);
  const namedChanged = before[namedRulesMetaKey] === undefined || !equal(named, oldNamed.rules) || !equal(routes, oldNamed.routes);
  const workPack = workChanged ? packRulesIntoChunks(work) : undefined;
  const namedPack = namedChanged ? packRulesIntoChunks(named) : undefined;
  const previousNamedMeta = before[namedRulesMetaKey] as NamedRulesMeta | undefined;
  const transition = workPack ? { from: oldWorkMeta?.generation ?? null, to: workPack.meta.generation } : previousNamedMeta?.workTransition;
  const namedMeta: NamedRulesMeta | undefined = namedPack || workPack
    ? { version: 1, rules: namedPack?.meta ?? previousNamedMeta!.rules, ...(routes ? { routes } : {}), ...(transition ? { workTransition: transition } : {}) }
    : undefined;
  const chunks = {
    ...workPack?.chunks,
    ...(namedPack ? Object.fromEntries(Object.entries(namedPack.chunks).map(([key, value]) => [namedKey(key), value])) : {})
  };
  const activation: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(otherSettings).filter(([key, value]) => !equal(before[key], value))),
    ...(workPack ? { [rulesMetaStorageKey]: { ...workPack.meta, namedEpoch: workPack.meta.generation } } : {}),
    ...(namedMeta ? { [namedRulesMetaKey]: namedMeta } : {})
  };
  let activated = false;
  try {
    if (Object.keys(chunks).length) await storage.set(chunks);
    if (workPack && !rulesMatchExactly(work, reconstructRulesFromChunks(workPack.meta, await storage.get(ruleChunkStorageKeys(workPack.meta))))) {
      throw new RuleChunkStorageError("verification-failed", "Work staging verification failed.");
    }
    if (namedMeta && !equal(named, (await readNamedRules(storage, namedMeta)).rules)) {
      throw new RuleChunkStorageError("verification-failed", "Named staging verification failed.");
    }
    // Detect a local storage event during staging; never knowingly overwrite it.
    const current = await storage.get(Object.keys(activation));
    if (Object.keys(activation).some(key => !equal(current[key], before[key]))) {
      throw new RuleChunkStorageError("write-failed", "Sync settings changed while saving. Please retry.");
    }
    if (Object.keys(activation).length) {
      activated = true;
      await storage.set(activation);
    }
    const committed = await storage.get(Object.keys(activation));
    if (!equal(committed, activation)) throw new RuleChunkStorageError("verification-failed", "Sync activation verification failed.");
    if (workPack && !rulesMatchExactly(work, reconstructRulesFromChunks(workPack.meta, await storage.get(ruleChunkStorageKeys(workPack.meta))))) {
      throw new RuleChunkStorageError("verification-failed", "Work verification failed.");
    }
    if (namedMeta && !equal(named, (await readNamedRules(storage, namedMeta)).rules)) {
      throw new RuleChunkStorageError("verification-failed", "Named verification failed.");
    }
  } catch (error) {
    if (activated) {
      // Do not roll back over a different writer. Keep both generations if the
      // active pointer is uncertain; they can still be referenced by Sync.
      const current = await storage.get(Object.keys(activation));
      if (!equal(current, activation)) throw error;
      const present = Object.fromEntries(Object.keys(activation).filter(key => before[key] !== undefined).map(key => [key, before[key]]));
      const absent = Object.keys(activation).filter(key => before[key] === undefined);
      if (Object.keys(present).length) await storage.set(present);
      if (absent.length) {
        if (!storage.remove) throw error;
        await storage.remove(absent);
      }
      const restored = await storage.get(Object.keys(activation));
      if (Object.keys(activation).some(key => !equal(restored[key], before[key]))) throw error;
    }
    if (storage.remove && Object.keys(chunks).length) await storage.remove(Object.keys(chunks));
    throw error;
  }
  // No foreign namespace scanning or deletion. In particular, old clients only
  // clean rulesChunk:<their previous generation>, never namedRulesChunkV1:*.
  const obsolete = [
    ...(workPack && oldWorkMeta ? ruleChunkStorageKeys(oldWorkMeta) : []),
    ...(namedPack && before[namedRulesMetaKey] ? ruleChunkStorageKeys((before[namedRulesMetaKey] as NamedRulesMeta).rules).map(namedKey) : []),
    ...(workPack && Array.isArray(before.rules) ? ["rules"] : []),
    ...(before.routes !== undefined ? ["routes"] : [])
  ];
  if (storage.remove && obsolete.length) {
    try { await storage.remove(obsolete); }
    catch (error) { console.warn("Could not clean obsolete rule data", error); }
  }
}
