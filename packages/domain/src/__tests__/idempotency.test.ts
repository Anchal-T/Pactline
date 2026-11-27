import { describe, expect, it, vi } from "vitest";
import { canonicalJson } from "../canonical.js";
import { createIdempotentRunner, idempotencyKey, MemoryResultCache, sha256Hex } from "../idempotency.js";
import { envelope } from "./fixtures.js";

const input = { configuration: "candidate-a", requirement_set: "RS-PUMP-04", rev: "C" };

describe("canonicalJson", () => {
  it("sorts keys at every depth", () => expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}'));
  it("drops undefined properties but never silently stringifies other things", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => canonicalJson({ a: new Date() })).toThrow(/non-plain/);
    expect(() => canonicalJson({ a: NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ a: () => 1 })).toThrow(/unsupported/);
    expect(() => canonicalJson({ a: 10n })).toThrow(/unsupported/);
  });
  it("treats -0 as 0 and NFC-normalises text", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson("é")).toBe(canonicalJson("é"));
  });
});

describe("idempotencyKey", () => {
  it("is stable across key order and has the sha256 form", () => {
    const a = idempotencyKey({ specialist: "spec_compliance", version: "1.0.0", input });
    const b = idempotencyKey({ specialist: "spec_compliance", version: "1.0.0", input: { rev: "C", requirement_set: "RS-PUMP-04", configuration: "candidate-a" } });
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("changes with the input, the version and the specialist", () => {
    const base = idempotencyKey({ specialist: "spec_compliance", version: "1.0.0", input });
    expect(idempotencyKey({ specialist: "spec_compliance", version: "1.0.1", input })).not.toBe(base);
    expect(idempotencyKey({ specialist: "product_discovery", version: "1.0.0", input })).not.toBe(base);
    expect(idempotencyKey({ specialist: "spec_compliance", version: "1.0.0", input: { ...input, rev: "D" } })).not.toBe(base);
  });
  it("matches a known SHA-256 vector", () => expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
});

describe("createIdempotentRunner", () => {
  const key = idempotencyKey({ specialist: "spec_compliance", version: "1.0.0", input });
  const make = (over = {}) => envelope({ idempotency_key: key, ...over });

  it("replays a cached result with zero model usage and does not run twice", async () => {
    const run = createIdempotentRunner(new MemoryResultCache());
    const produce = vi.fn(async () => make());
    const first = await run(key, produce);
    const second = await run(key, produce);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(first.replayed).toBe(false);
    expect(first.envelope.model_usage).toHaveLength(1);
    expect(second.replayed).toBe(true);
    expect(second.envelope.model_usage).toEqual([]);
    expect(second.envelope.run_id).toBe(first.envelope.run_id);
  });
  it("shares one run between concurrent callers", async () => {
    const run = createIdempotentRunner(new MemoryResultCache());
    let calls = 0;
    const produce = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 15));
      return make();
    };
    const [a, b, c] = await Promise.all([run(key, produce), run(key, produce), run(key, produce)]);
    expect(calls).toBe(1);
    expect([a.replayed, b.replayed, c.replayed].filter(Boolean)).toHaveLength(2);
  });
  it("does not cache ERROR results, so a retry runs again", async () => {
    const cache = new MemoryResultCache();
    const run = createIdempotentRunner(cache);
    const produce = vi.fn(async () => make({ status: "ERROR" }));
    await run(key, produce);
    await run(key, produce);
    expect(produce).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });
  it("refuses a result keyed differently from the run", async () => {
    const run = createIdempotentRunner(new MemoryResultCache());
    await expect(run(key, async () => envelope())).rejects.toThrow(/mismatch/);
  });
  it("lets a failed run be retried instead of poisoning the key", async () => {
    const run = createIdempotentRunner(new MemoryResultCache());
    await expect(run(key, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect((await run(key, async () => make())).replayed).toBe(false);
  });
  it("does not let a caller mutate the cache", async () => {
    const cache = new MemoryResultCache();
    const run = createIdempotentRunner(cache);
    const first = await run(key, async () => make());
    first.envelope.result.summary = "tampered";
    expect((await run(key, async () => make())).envelope.result.summary).toBe("Candidate A meets head at duty");
  });
});

describe("review fixes", () => {
  const key = idempotencyKey({ specialist: "spec_compliance", version: "1.0.0", input });
  const make = () => envelope({ idempotency_key: key });

  it("never runs twice when an async cache serves overlapping reads", async () => {
    const store = new Map<string, ReturnType<typeof make>>();
    let reads = 0;
    const slowCache = {
      async get(k: string) {
        const n = ++reads;
        await new Promise((r) => setTimeout(r, n === 1 ? 5 : 40));
        return store.get(k);
      },
      async set(k: string, v: ReturnType<typeof make>) {
        store.set(k, v);
      },
    };
    const run = createIdempotentRunner(slowCache);
    let calls = 0;
    const produce = async () => (calls++, make());
    await Promise.all([run(key, produce), new Promise((r) => setTimeout(r, 1)).then(() => run(key, produce))]);
    expect(calls).toBe(1);
  });
  it("gives concurrent callers independent copies", async () => {
    const run = createIdempotentRunner(new MemoryResultCache());
    const produce = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return make();
    };
    const [a, b] = await Promise.all([run(key, produce), run(key, produce)]);
    a.envelope.result.summary = "tampered";
    a.envelope.findings.length = 0;
    expect(b.envelope.result.summary).toBe("Candidate A meets head at duty");
    expect(b.envelope.findings).toHaveLength(1);
  });
  it("rejects sparse arrays so they cannot collide with real ones", () => {
    expect(() => canonicalJson(new Array(1))).toThrow(/empty array slot/);
    expect(() => canonicalJson([1, , 3])).toThrow(/empty array slot/);
    expect(canonicalJson([])).toBe("[]");
  });
  it("normalises keys before sorting and rejects keys that collide", () => {
    expect(canonicalJson({ "e\u0301": 1, z: 2 })).toBe(canonicalJson({ "\u00e9": 1, z: 2 }));
    expect(() => canonicalJson({ "e\u0301": 1, "\u00e9": 2 })).toThrow(/duplicate key/);
  });
});
