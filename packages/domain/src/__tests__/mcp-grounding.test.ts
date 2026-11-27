import { describe, expect, it } from "vitest";
import { z } from "zod";
import { specialistEnvelopeShape } from "../contracts.js";
import { checkGrounding, groundedOrTemplate } from "../grounding.js";
import { specialistOutputSchema, toolInputSchema } from "../mcp-schema.js";
import { ResultSchema } from "./fixtures.js";

describe("MCP outputSchema generation", () => {
  const s = specialistOutputSchema(ResultSchema) as { type: string; properties: Record<string, { type?: string; enum?: string[] }>; required: string[]; additionalProperties: boolean };

  it("describes an object and carries every envelope field", () => {
    expect(s.type).toBe("object");
    for (const k of ["specialist", "run_id", "idempotency_key", "status", "result", "findings", "confidence", "evidence", "handoff", "input_versions", "model_usage"]) expect(s.properties[k]).toBeDefined();
  });
  it("embeds the specialist's own result schema", () => {
    expect(s.properties.result).toMatchObject({ type: "object", properties: { summary: { type: "string" } } });
  });
  it("carries the enums and rejects extra keys", () => {
    expect(s.properties.status?.enum).toEqual(["OK", "PARTIAL", "ABSTAINED", "NEEDS_HUMAN", "ERROR"]);
    expect(s.additionalProperties).toBe(false);
  });
  it("has no $schema key and is plain JSON", () => {
    expect(s).not.toHaveProperty("$schema");
    expect(() => JSON.stringify(s)).not.toThrow();
    expect(JSON.stringify(s)).not.toContain("$ref");
  });
  it("exposes the raw shape for SDKs that take one", () => {
    expect(Object.keys(specialistEnvelopeShape(ResultSchema))).toContain("findings");
    expect(toolInputSchema(z.object({ configuration: z.string() })).required).toEqual(["configuration"]);
  });
});

describe("grounding validator", () => {
  const structured = {
    incident: "INC-0412",
    po_line: "POL-118",
    vendor: "Sandbox Pumps Ltd",
    usable_date: "2027-01-11",
    slip_days: 8,
    float_days: 4,
    exposure_usd: 12500,
    head_m: 36.1,
  };

  it("accepts prose whose facts all come from the structured result", () => {
    const prose = "INC-0412 on POL-118: Sandbox Pumps Ltd slipped 8 days. Usable 2027-01-11, head 36.1 m, exposure $12,500, float 4 days.";
    expect(checkGrounding(prose, structured, { vendors: ["Sandbox Pumps Ltd"] })).toEqual({ ok: true, ungrounded: [] });
  });
  it("catches an invented identifier, date, amount, number and vendor", () => {
    const prose = "INC-0999 is late: usable 2027-02-02, cost $99,000, head 41.7 m. Contact Rival Pumps Inc.";
    const r = checkGrounding(prose, structured, { vendors: ["Sandbox Pumps Ltd", "Rival Pumps Inc"] });
    expect(r.ok).toBe(false);
    expect(r.ungrounded.map((u) => u.kind).sort()).toEqual(["amount", "date", "identifier", "number", "vendor"]);
  });
  it("ignores small bare numbers but not numbers with units or decimals", () => {
    expect(checkGrounding("There are 2 options.", structured).ok).toBe(true);
    expect(checkGrounding("It slips 11 days.", structured).ok).toBe(false);
    expect(checkGrounding("Float is 4.5 days.", structured).ok).toBe(false);
  });
  it("lets standards through when allowed", () => {
    expect(checkGrounding("Tested to ISO-9906 grade 2B.", structured).ok).toBe(false);
    expect(checkGrounding("Tested to ISO-9906 grade 2B.", structured, { allow: [/^ISO-\d+$/] }).ok).toBe(true);
  });
  it("takes dates from ISO datetimes", () => expect(checkGrounding("Generated on 2026-11-27.", { at: "2026-11-27T10:00:00Z" }).ok).toBe(true));
  it("falls back to the template and records why", () => {
    const g = groundedOrTemplate({ prose: "INC-0999 is late.", structured, template: "Incident INC-0412 is late." });
    expect(g.provenance).toBe("template");
    expect(g.text).toBe("Incident INC-0412 is late.");
    expect(g.ungrounded[0]).toEqual({ kind: "identifier", text: "INC-0999" });
    expect(groundedOrTemplate({ prose: "INC-0412 is late.", structured, template: "t" }).provenance).toBe("model");
  });
});
