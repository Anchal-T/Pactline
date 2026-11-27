import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";
import type { SpecialistResult } from "./contracts.js";

/** sha256(specialist@version + canonical inputs), so a new specialist version never replays an old answer. */
export function idempotencyKey(args: { specialist: string; version: string; input: unknown }): string {
  const material = `${args.specialist}@${args.version}\n${canonicalJson(args.input)}`;
  return `sha256:${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface ResultCache {
  get(key: string): Promise<SpecialistResult | undefined>;
  set(key: string, value: SpecialistResult): Promise<void>;
}

export class MemoryResultCache implements ResultCache {
  private readonly store = new Map<string, SpecialistResult>();
  async get(key: string) {
    const hit = this.store.get(key);
    return hit && structuredClone(hit);
  }
  async set(key: string, value: SpecialistResult) {
    this.store.set(key, structuredClone(value));
  }
  get size() {
    return this.store.size;
  }
}

export interface Replayable<T> {
  envelope: SpecialistResult<T>;
  /** True when served from cache. A replay carries no model usage: it cost nothing. */
  replayed: boolean;
}

/**
 * Same key, same answer, zero model cost. Concurrent calls with one key share a single run.
 * ERROR results are never cached, so a transient failure can be retried.
 */
export function createIdempotentRunner(cache: ResultCache) {
  const inflight = new Map<string, Promise<Replayable<unknown>>>();

  return async function run<T>(key: string, produce: () => Promise<SpecialistResult<T>>): Promise<Replayable<T>> {
    const hit = await cache.get(key);
    if (hit) return { envelope: { ...hit, model_usage: [] } as SpecialistResult<T>, replayed: true };

    const pending = inflight.get(key);
    if (pending) {
      const shared = await pending;
      return { envelope: { ...shared.envelope, model_usage: [] } as SpecialistResult<T>, replayed: true };
    }

    const started = (async (): Promise<Replayable<unknown>> => {
      const envelope = await produce();
      if (envelope.idempotency_key !== key) throw new Error(`idempotency_key mismatch: result carries ${envelope.idempotency_key}, run was keyed ${key}`);
      if (envelope.status !== "ERROR") await cache.set(key, envelope as SpecialistResult);
      return { envelope, replayed: false };
    })();
    inflight.set(key, started);
    try {
      return (await started) as Replayable<T>;
    } finally {
      inflight.delete(key);
    }
  };
}
