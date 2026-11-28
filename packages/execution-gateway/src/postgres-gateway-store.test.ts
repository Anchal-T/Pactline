import { describe, it, expect } from "vitest";
import { PostgresGatewayStore } from "@pactline/db";
import type { GatewayStore } from "./execution-gateway.js";

describe("PostgresGatewayStore contract", () => {
  it("structurally satisfies GatewayStore at compile time", () => {
    const typeCheck = (store: PostgresGatewayStore): GatewayStore => store;
    expect(typeof typeCheck).toBe("function");
  });
});
