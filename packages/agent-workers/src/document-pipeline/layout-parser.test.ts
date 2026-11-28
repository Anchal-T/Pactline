import { describe, expect, it } from "vitest";
import {
  normalizeWhitespace,
  findExcerpt,
  extractTextFromRegion,
  calculateBBoxOverlap,
  StubLayoutParser,
} from "./layout-parser.js";
import type { DocumentLayout, BBox } from "./document-store.js";

describe("normalizeWhitespace", () => {
  it("collapses multiple spaces", () => {
    expect(normalizeWhitespace("hello    world")).toBe("hello world");
  });

  it("replaces newlines with spaces", () => {
    expect(normalizeWhitespace("hello\nworld\ntest")).toBe("hello world test");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  hello world  ")).toBe("hello world");
  });

  it("handles mixed whitespace", () => {
    expect(normalizeWhitespace("hello\n   \n  world\t\ttest")).toBe("hello world test");
  });
});

describe("findExcerpt", () => {
  const layout: DocumentLayout = {
    doc_id: "doc_001",
    metadata: {
      doc_id: "doc_001",
      kind: "spec_section",
      filename: "test.pdf",
      content_hash: "hash123",
      uploaded_at: "2024-01-01T00:00:00Z",
      page_count: 2,
      size_bytes: 1000,
      mime_type: "application/pdf",
    },
    blocks: [
      {
        page: 1,
        bbox: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.3 },
        text: "The pump shall provide 100 m³/h at 35 m head.",
      },
      {
        page: 1,
        bbox: { x0: 0.1, y0: 0.4, x1: 0.9, y1: 0.6 },
        text: "Motor: 400 V / 3 ph / 50 Hz / IE3",
      },
      {
        page: 2,
        bbox: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.3 },
        text: "Materials: Cast iron body, stainless steel impeller.",
      },
    ],
    full_text: "The pump shall provide 100 m³/h at 35 m head. Motor: 400 V / 3 ph / 50 Hz / IE3 Materials: Cast iron body, stainless steel impeller.",
  };

  it("finds exact excerpt", () => {
    const matches = findExcerpt(layout, "400 V / 3 ph / 50 Hz / IE3");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.page).toBe(1);
    expect(matches[0]?.text).toContain("Motor:");
  });

  it("finds excerpt with different whitespace", () => {
    const matches = findExcerpt(layout, "pump shall   provide   100 m³/h");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.page).toBe(1);
  });

  it("is case insensitive", () => {
    const matches = findExcerpt(layout, "CAST IRON BODY");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.page).toBe(2);
  });

  it("returns empty array for non-existent excerpt", () => {
    const matches = findExcerpt(layout, "this text does not exist");
    expect(matches).toHaveLength(0);
  });

  it("finds partial matches across blocks", () => {
    const matches = findExcerpt(layout, "35 m head");
    expect(matches).toHaveLength(1);
  });
});

describe("extractTextFromRegion", () => {
  const layout: DocumentLayout = {
    doc_id: "doc_001",
    metadata: {
      doc_id: "doc_001",
      kind: "spec_section",
      filename: "test.pdf",
      content_hash: "hash123",
      uploaded_at: "2024-01-01T00:00:00Z",
      page_count: 1,
      size_bytes: 1000,
      mime_type: "application/pdf",
    },
    blocks: [
      {
        page: 1,
        bbox: { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.3 },
        text: "Top left",
      },
      {
        page: 1,
        bbox: { x0: 0.5, y0: 0.1, x1: 0.9, y1: 0.3 },
        text: "Top right",
      },
      {
        page: 1,
        bbox: { x0: 0.1, y0: 0.4, x1: 0.5, y1: 0.6 },
        text: "Bottom left",
      },
    ],
    full_text: "Top left Top right Bottom left",
  };

  it("extracts text from specific region", () => {
    const region: BBox = { x0: 0.4, y0: 0.0, x1: 1.0, y1: 0.4 };
    const text = extractTextFromRegion(layout, 1, region);
    expect(text).toContain("Top right");
  });

  it("extracts multiple overlapping blocks", () => {
    const region: BBox = { x0: 0.0, y0: 0.0, x1: 1.0, y1: 0.4 };
    const text = extractTextFromRegion(layout, 1, region);
    expect(text).toContain("Top left");
    expect(text).toContain("Top right");
  });

  it("returns empty string for non-overlapping region", () => {
    const region: BBox = { x0: 0.0, y0: 0.8, x1: 1.0, y1: 1.0 };
    const text = extractTextFromRegion(layout, 1, region);
    expect(text).toBe("");
  });
});

describe("calculateBBoxOverlap", () => {
  it("calculates full overlap", () => {
    const a: BBox = { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 };
    const b: BBox = { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 };
    expect(calculateBBoxOverlap(a, b)).toBe(1.0);
  });

  it("calculates partial overlap", () => {
    const a: BBox = { x0: 0.0, y0: 0.0, x1: 0.5, y1: 0.5 };
    const b: BBox = { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 };
    const overlap = calculateBBoxOverlap(a, b);
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThan(1);
  });

  it("returns 0 for non-overlapping boxes", () => {
    const a: BBox = { x0: 0.0, y0: 0.0, x1: 0.3, y1: 0.3 };
    const b: BBox = { x0: 0.5, y0: 0.5, x1: 0.8, y1: 0.8 };
    expect(calculateBBoxOverlap(a, b)).toBe(0);
  });

  it("handles edge-touching boxes", () => {
    const a: BBox = { x0: 0.0, y0: 0.0, x1: 0.5, y1: 0.5 };
    const b: BBox = { x0: 0.5, y0: 0.0, x1: 1.0, y1: 0.5 };
    expect(calculateBBoxOverlap(a, b)).toBe(0);
  });
});

describe("StubLayoutParser", () => {
  it("parses document into single block", async () => {
    const parser = new StubLayoutParser();
    const content = Buffer.from("Test document content");
    const metadata = {
      doc_id: "doc_001",
      kind: "spec_section" as const,
      filename: "test.txt",
      content_hash: "hash123",
      uploaded_at: "2024-01-01T00:00:00Z",
      page_count: 1,
      size_bytes: content.length,
      mime_type: "text/plain",
    };

    const layout = await parser.parseDocument("doc_001", content, metadata);

    expect(layout.doc_id).toBe("doc_001");
    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0]?.text).toBe("Test document content");
    expect(layout.full_text).toBe("Test document content");
  });
});
