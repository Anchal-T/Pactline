import { describe, it, expect } from "vitest";
import { PostgresEventStore } from "@pactline/db";
import type { EventStore } from "./incident-runtime.js";

describe("PostgresEventStore contract", () => {
  it("structurally satisfies EventStore at compile time", () => {
    const typeCheck = (store: PostgresEventStore): EventStore => store;
    expect(typeof typeCheck).toBe("function");
  });
});
