import type { DomainRule } from "../rules/ruleTypes";

export const legacyRulesStorageKey = "rules";
export const rulesMetaStorageKey = "rulesMeta";
export const rulesChunkStorageKeyPrefix = "rulesChunk:";
export const rulesChunkSchemaVersion = 1;

// Chrome sync allows up to 8192 bytes per item, including the storage key.
// Keep a deliberate margin for future rule fields and generation/key growth.
export const rulesChunkTargetBytes = 6500;

export type RulesMeta = {
  schemaVersion: typeof rulesChunkSchemaVersion;
  generation: string;
  chunkCount: number;
  ruleCount: number;
};

export type PackedRules = {
  meta: RulesMeta;
  chunks: Record<string, DomainRule[]>;
};

export type RuleChunkStorageErrorCode =
  | "quota-exceeded"
  | "rule-too-large"
  | "incomplete"
  | "verification-failed"
  | "write-failed";

export class RuleChunkStorageError extends Error {
  readonly name = "RuleChunkStorageError";

  constructor(
    readonly code: RuleChunkStorageErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function isRulesMeta(input: unknown): input is RulesMeta {
  return (
    isRecord(input) &&
    input.schemaVersion === rulesChunkSchemaVersion &&
    typeof input.generation === "string" &&
    input.generation.length > 0 &&
    typeof input.chunkCount === "number" &&
    Number.isSafeInteger(input.chunkCount) &&
    input.chunkCount >= 0 &&
    typeof input.ruleCount === "number" &&
    Number.isSafeInteger(input.ruleCount) &&
    input.ruleCount >= 0
  );
}

export function ruleChunkStorageKey(generation: string, index: number): string {
  return `${rulesChunkStorageKeyPrefix}${generation}:${index}`;
}

export function ruleChunkStorageKeys(meta: Pick<RulesMeta, "generation" | "chunkCount">): string[] {
  return Array.from({ length: meta.chunkCount }, (_, index) => ruleChunkStorageKey(meta.generation, index));
}

export function isRuleChunkStorageKey(key: string): boolean {
  return key.startsWith(rulesChunkStorageKeyPrefix);
}

export function estimateStorageItemBytes(key: string, value: unknown): number {
  return new TextEncoder().encode(key).byteLength + new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function createRulesGeneration(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const nonce = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${Date.now().toString(36)}-${nonce}`;
}

export function packRulesIntoChunks(
  rules: readonly DomainRule[],
  generation: string = createRulesGeneration()
): PackedRules {
  const chunks: DomainRule[][] = [];
  let currentChunk: DomainRule[] = [];

  for (const rule of rules) {
    const key = ruleChunkStorageKey(generation, chunks.length);
    const candidateChunk = [...currentChunk, rule];

    if (estimateStorageItemBytes(key, candidateChunk) <= rulesChunkTargetBytes) {
      currentChunk = candidateChunk;
      continue;
    }

    if (currentChunk.length === 0) {
      throw new RuleChunkStorageError(
        "rule-too-large",
        "A single route rule cannot fit in the safe Chrome Sync storage item size."
      );
    }

    chunks.push(currentChunk);
    currentChunk = [rule];

    if (estimateStorageItemBytes(ruleChunkStorageKey(generation, chunks.length), currentChunk) > rulesChunkTargetBytes) {
      throw new RuleChunkStorageError(
        "rule-too-large",
        "A single route rule cannot fit in the safe Chrome Sync storage item size."
      );
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const meta: RulesMeta = {
    schemaVersion: rulesChunkSchemaVersion,
    generation,
    chunkCount: chunks.length,
    ruleCount: rules.length
  };
  const storageChunks = Object.fromEntries(
    chunks.map((chunk, index) => [ruleChunkStorageKey(generation, index), chunk])
  );

  return {
    meta,
    chunks: storageChunks
  };
}

export function reconstructRulesFromChunks(
  meta: RulesMeta,
  storedChunks: Record<string, unknown>
): DomainRule[] {
  const rules: DomainRule[] = [];

  for (const key of ruleChunkStorageKeys(meta)) {
    const chunk = storedChunks[key];

    if (!Array.isArray(chunk)) {
      throw new RuleChunkStorageError("incomplete", "The active synced route-rule chunks are incomplete.");
    }

    rules.push(...(chunk as DomainRule[]));
  }

  if (rules.length !== meta.ruleCount) {
    throw new RuleChunkStorageError("incomplete", "The active synced route-rule chunk count does not match metadata.");
  }

  return rules;
}

export function rulesMatchExactly(left: readonly DomainRule[], right: readonly DomainRule[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const rule = left[index];
    const candidate = right[index];

    if (
      rule !== undefined &&
      candidate !== undefined &&
      rule.id === candidate.id &&
      rule.domain === candidate.domain &&
      rule.includeSubdomains === candidate.includeSubdomains &&
      rule.action === candidate.action &&
      rule.mode === candidate.mode &&
      rule.source === candidate.source &&
      rule.createdAt === candidate.createdAt
    ) {
      continue;
    }

    return false;
  }

  return true;
}
