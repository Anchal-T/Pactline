import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { specialistResultSchema } from "./contracts.js";

type JsonSchema = Record<string, unknown>;

/**
 * JSON Schema for a specialist's MCP `outputSchema`, generated from the same Zod the validator uses,
 * so the contract Amber reads can never drift from the contract we enforce.
 */
export function specialistOutputSchema(resultSchema: z.ZodTypeAny): JsonSchema {
  const schema = zodToJsonSchema(specialistResultSchema(resultSchema), { target: "jsonSchema7", $refStrategy: "none" }) as JsonSchema;
  delete schema.$schema;
  if (schema.type !== "object") throw new Error("MCP outputSchema must describe an object");
  return schema;
}

/** JSON Schema for a tool's input, with the same rules. */
export function toolInputSchema(inputSchema: z.ZodTypeAny): JsonSchema {
  const schema = zodToJsonSchema(inputSchema, { target: "jsonSchema7", $refStrategy: "none" }) as JsonSchema;
  delete schema.$schema;
  if (schema.type !== "object") throw new Error("MCP inputSchema must describe an object");
  return schema;
}
