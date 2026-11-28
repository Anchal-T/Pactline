import { describe, expect, it } from "vitest";
import { PostgresIncidentQueue, PostgresReceiptReader, PostgresTaskQueue } from "@pactline/db";
import type { IncidentQueue, ReceiptReader, TaskQueue } from "./ports.js";

describe("Postgres scheduler store contract", () => {
  it("structurally satisfies the scheduler ports at compile time", () => {
    const ports = (i: PostgresIncidentQueue, t: PostgresTaskQueue, r: PostgresReceiptReader): [IncidentQueue, TaskQueue, ReceiptReader] => [i, t, r];
    expect(typeof ports).toBe("function");
  });
});
