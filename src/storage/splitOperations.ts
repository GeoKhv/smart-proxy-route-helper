import type { DomainRule } from "../rules/ruleTypes";
import type { StorageAreaAdapter } from "./storageTypes";
import { createRulesGeneration, isRulesMeta, packRulesIntoChunks, reconstructRulesFromChunks, ruleChunkStorageKeys, RuleChunkStorageError, type RulesMeta } from "./ruleChunks";

// Only cross-list edits need a shared operation. Its immutable delta is reachable
// from EITHER pointer, so arrival of one pointer is sufficient to reconstruct it.
// Independent edits never publish the other list's pointer.
export const splitOperationPrefix = "splitOperationV2:";
export const splitOperationChunkPrefix = "splitOperationChunkV2:";
export type OperationReceipt = { splitProtocol?: 2; splitOperations?: string[] };
type Delta = { remove: RulesMeta; add: RulesMeta };
type Operation = { version: 1; parents: string[]; baseWorkGeneration: string | null; work: Delta; named: Delta };
const chunkKey = (key: string) => key.replace(/^rulesChunk:/, splitOperationChunkPrefix);
const exact = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value) === JSON.stringify(b, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

export function operationIds(meta: unknown): string[] {
  const ids = (meta as OperationReceipt | undefined)?.splitOperations;
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new RuleChunkStorageError("incomplete", "Invalid cross-list operation receipts.");
  }
  return ids;
}

export async function reconcileSplitOperations(storage: StorageAreaAdapter, workMeta: unknown, namedMeta: unknown, work: DomainRule[], named: DomainRule[]) {
  const workIds = operationIds(workMeta), namedIds = operationIds(namedMeta);
  const ids = [...new Set([...workIds, ...namedIds])];
  const ordered = new Map<string, Operation>();
  const visiting = new Set<string>();
  async function visit(id: string): Promise<void> {
    if (ordered.has(id)) return;
    if (visiting.has(id)) throw new RuleChunkStorageError("incomplete", "Cyclic cross-list operation.");
    visiting.add(id);
    const value = (await storage.get(splitOperationPrefix + id))[splitOperationPrefix + id] as Operation;
    if (!value || value.version !== 1 || !Array.isArray(value.parents) || value.parents.some(parent => typeof parent !== "string" || !/^[a-z0-9-]+$/.test(parent)) ||
        !(value.baseWorkGeneration === null || typeof value.baseWorkGeneration === "string") ||
        !isRulesMeta(value.work?.remove) || !isRulesMeta(value.work?.add) || !isRulesMeta(value.named?.remove) || !isRulesMeta(value.named?.add)) {
      throw new RuleChunkStorageError("incomplete", "Cross-list operation is still synchronizing.");
    }
    for (const parent of value.parents) await visit(parent);
    visiting.delete(id); ordered.set(id, value);
  }
  for (const id of ids) await visit(id);
  async function read(meta: RulesMeta): Promise<DomainRule[]> {
    const keys = ruleChunkStorageKeys(meta);
    const data = await storage.get(keys.map(chunkKey));
    return reconstructRulesFromChunks(meta, Object.fromEntries(keys.map(key => [key, data[chunkKey(key)]])));
  }
  function acknowledgements(receipts: string[]) {
    const acknowledged = new Set<string>();
    function accept(id: string) { if (acknowledged.has(id)) return; acknowledged.add(id); for (const parent of ordered.get(id)!.parents) accept(parent); }
    receipts.forEach(accept); return acknowledged;
  }
  const workAck = acknowledgements(workIds), namedAck = acknowledgements(namedIds);
  for (const [id, operation] of ordered) {
    // Verify ALL referenced data, even after acknowledgement. Never silently
    // activate half an operation if a chunk has not arrived (or was damaged).
    const [wr, wa, nr, na] = await Promise.all([read(operation.work.remove), read(operation.work.add), read(operation.named.remove), read(operation.named.add)]);
    const apply = (rules: DomainRule[], remove: DomainRule[], add: DomainRule[]) => [
      ...rules.filter(rule => !remove.some(old => exact(old, rule))),
      ...add.filter(rule => !rules.some(current => exact(current, rule)))
    ];
    // A 0.3.2 writer strips receipts. Its subsequent Work generation remains
    // authoritative; do not replay a historical Work deletion/addition over it.
    // An unchanged base generation, however, is simply delayed pointer delivery.
    const legacyWorkWrite = (workMeta as OperationReceipt | undefined)?.splitProtocol !== 2 && workIds.length === 0 && (workMeta as RulesMeta | undefined)?.generation !== operation.baseWorkGeneration && workMeta !== undefined;
    if (!workAck.has(id) && !legacyWorkWrite) work = apply(work, wr, wa);
    if (!namedAck.has(id)) named = apply(named, nr, na);
  }
  return { work, named, operations: [...ordered.keys()] };
}

export function stageSplitOperation(oldWork: DomainRule[], work: DomainRule[], oldNamed: DomainRule[], named: DomainRule[], parents: string[], baseWorkGeneration: string | null) {
  const id = createRulesGeneration();
  const staged: Record<string, unknown> = {};
  function pack(rules: DomainRule[]): RulesMeta {
    const packed = packRulesIntoChunks(rules);
    Object.assign(staged, Object.fromEntries(Object.entries(packed.chunks).map(([key, value]) => [chunkKey(key), value])));
    return packed.meta;
  }
  function delta(before: DomainRule[], after: DomainRule[]): Delta {
    return { remove: pack(before.filter(rule => !after.some(next => exact(rule, next)))), add: pack(after.filter(rule => !before.some(old => exact(rule, old)))) };
  }
  const operation: Operation = { version: 1, parents, baseWorkGeneration, work: delta(oldWork, work), named: delta(oldNamed, named) };
  staged[splitOperationPrefix + id] = operation;
  return { id, staged };
}
