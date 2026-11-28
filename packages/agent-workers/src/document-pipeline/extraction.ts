// Extraction helpers for spec compilation and submittal parsing
import { z } from "zod";
import type { ChatOpenAI } from "@langchain/openai";
import type { ModelUsage } from "../framework/agent-runner.js";
import { extractWithAgreement, quarantineExtraction } from "../framework/langchain-adapter.js";
import type { DocumentLayout, TextBlock } from "./document-store.js";
import { findExcerpt } from "./layout-parser.js";

/**
 * Source reference (simplified version for document pipeline).
 */
export interface SourceRef {
  readonly ref_id: string;
  readonly kind: string;
  readonly uri: string;
  readonly title: string;
  readonly publisher: string;
  readonly retrieved_at: string;
  readonly content_hash: string;
  readonly locator?: {
    page?: number;
    bbox?: [number, number, number, number];
    section?: string;
  };
  readonly excerpt: string;
  readonly trust_tier: "primary" | "secondary" | "vendor_claim" | "derived" | "synthetic";
}

/**
 * Requirement from spec compilation.
 */
export interface Requirement {
  /** Unique requirement ID */
  readonly requirement_id: string;
  /** Category (e.g., "PERFORMANCE", "ELECTRICAL", "MATERIALS") */
  readonly category: string;
  /** Field name (e.g., "head_m", "voltage_v", "material") */
  readonly field: string;
  /** Required value or constraint */
  readonly required: string;
  /** Unit of measurement */
  readonly unit?: string;
  /** Tolerance (e.g., "±5%", "ISO 9906 Grade 2B") */
  readonly tolerance?: string;
  /** Whether this is mandatory for acceptance */
  readonly mandatory: boolean;
  /** Applicability condition (e.g., "if flow > 50 m³/h") */
  readonly condition?: string;
  /** Source reference with page and bbox */
  readonly source: SourceRef;
}

/**
 * Spec compiler: CSI-structured spec → typed Requirements.
 */
export class SpecCompiler {
  constructor(private readonly model: ChatOpenAI) {}

  /**
   * Compile spec document into structured requirements.
   * This is done once and human-approved, then reused for all submittals.
   */
  async compileSpec(layout: DocumentLayout): Promise<{
    requirements: Requirement[];
    model_usage: ModelUsage[];
  }> {
    // Extract requirements using model
    const schema = z.object({
      requirements: z.array(
        z.object({
          category: z.string(),
          field: z.string(),
          required: z.string(),
          unit: z.string().optional(),
          tolerance: z.string().optional(),
          mandatory: z.boolean(),
          condition: z.string().optional(),
          excerpt: z.string(), // Verbatim quote from spec
        }),
      ),
    });

    const prompt = `Extract all technical requirements from this specification document.
For each requirement, provide:
- category: Performance, Electrical, Materials, Physical, etc.
- field: The property being specified
- required: The required value or constraint
- unit: Unit of measurement if applicable
- tolerance: Tolerance or acceptance criteria
- mandatory: Whether this is a must-have requirement
- condition: Any applicability conditions
- excerpt: Verbatim quote from the document (exact text)

Document text:
${layout.full_text}`;

    const { output, usage } = await extractWithAgreement(this.model, schema, prompt, 2);

    // Convert to requirements with source refs
    const requirements: Requirement[] = [];

    for (const req of output.requirements ?? []) {
      // Find excerpt in layout to get page + bbox
      const matches = findExcerpt(layout, req.excerpt ?? "");

      if (matches.length === 0) {
        // Skip if excerpt not found (likely hallucinated)
        continue;
      }

      const block = matches[0]!;

      requirements.push({
        requirement_id: `req_${requirements.length + 1}`,
        category: req.category ?? "UNKNOWN",
        field: req.field ?? "unknown",
        required: req.required ?? "",
        unit: req.unit,
        tolerance: req.tolerance,
        mandatory: req.mandatory ?? false,
        condition: req.condition,
        source: {
          ref_id: `spec_${layout.doc_id}_${block.page}`,
          kind: "spec_section",
          uri: `doc://${layout.doc_id}`,
          title: layout.metadata.filename,
          publisher: "Project",
          retrieved_at: layout.metadata.uploaded_at,
          content_hash: layout.metadata.content_hash,
          locator: {
            page: block.page,
            bbox: [block.bbox.x0, block.bbox.y0, block.bbox.x1, block.bbox.y1],
          },
          excerpt: req.excerpt ?? "",
          trust_tier: "primary",
        },
      });
    }

    return { requirements, model_usage: usage };
  }
}

/**
 * Submittal value extracted with location.
 */
export interface SubmittalValue {
  /** Field name (matches requirement field) */
  readonly field: string;
  /** Extracted value */
  readonly value: string;
  /** Unit */
  readonly unit?: string;
  /** Source reference with page and bbox */
  readonly source: SourceRef;
}

/**
 * Submittal extractor: pump datasheet → typed values.
 */
export class SubmittalExtractor {
  constructor(private readonly model: ChatOpenAI) {}

  /**
   * Extract values from submittal document.
   * Runs extraction twice and returns only agreed fields (dual extraction).
   */
  async extractSubmittal(
    layout: DocumentLayout,
    fields: string[],
  ): Promise<{
    values: SubmittalValue[];
    model_usage: ModelUsage[];
    conflicts: Array<{ field: string; values: string[] }>;
  }> {
    const schema = z.object({
      values: z.record(
        z.string(),
        z.object({
          value: z.string(),
          unit: z.string().optional(),
          excerpt: z.string(), // Verbatim quote
        }),
      ),
    });

    const prompt = `Extract the following field values from this submittal document.
For each field, provide the value, unit (if applicable), and verbatim excerpt from the document.

Fields to extract:
${fields.map((f) => `- ${f}`).join("\n")}

Document text:
${layout.full_text}

Return only the fields you can find. Do not guess or infer values.`;

    // Dual extraction with agreement check
    const { output, usage, agreement } = await extractWithAgreement(this.model, schema, prompt, 2);

    const values: SubmittalValue[] = [];
    const conflicts: Array<{ field: string; values: string[] }> = [];

    // Convert agreed fields to submittal values
    for (const field of fields) {
      const extracted = output.values?.[field];

      if (!extracted) {
        // Field not found or not agreed
        continue;
      }

      // Find excerpt in layout
      const matches = findExcerpt(layout, extracted.excerpt ?? "");

      if (matches.length === 0) {
        // Excerpt not found — likely hallucinated
        continue;
      }

      const block = matches[0]!;

      values.push({
        field,
        value: extracted.value ?? "",
        unit: extracted.unit,
        source: {
          ref_id: `submittal_${layout.doc_id}_${block.page}`,
          kind: "submittal",
          uri: `doc://${layout.doc_id}`,
          title: layout.metadata.filename,
          publisher: "Vendor",
          retrieved_at: layout.metadata.uploaded_at,
          content_hash: layout.metadata.content_hash,
          locator: {
            page: block.page,
            bbox: [block.bbox.x0, block.bbox.y0, block.bbox.x1, block.bbox.y1],
          },
          excerpt: extracted.excerpt ?? "",
          trust_tier: "vendor_claim",
        },
      });
    }

    return { values, model_usage: usage, conflicts };
  }
}

/**
 * Detect conflicting extractions between runs.
 */
export function detectConflicts<T extends Record<string, unknown>>(
  extractions: T[],
): Array<{ field: string; values: unknown[] }> {
  const conflicts: Array<{ field: string; values: unknown[] }> = [];

  if (extractions.length < 2) return conflicts;

  const fields = Object.keys(extractions[0]!) as Array<keyof T>;

  for (const field of fields) {
    const values = extractions.map((e) => e[field]);
    const uniqueValues = Array.from(new Set(values.map((v) => JSON.stringify(v))));

    if (uniqueValues.length > 1) {
      conflicts.push({
        field: String(field),
        values: uniqueValues.map((v) => JSON.parse(v)),
      });
    }
  }

  return conflicts;
}
