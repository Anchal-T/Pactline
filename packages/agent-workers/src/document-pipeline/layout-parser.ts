// Document layout parsing with page + bbox extraction
import type { DocumentLayout, DocumentMetadata, TextBlock, BBox } from "./document-store.js";

/**
 * Layout parser interface.
 * Implementation will use Docling or Marker for PDF parsing.
 */
export interface LayoutParser {
  /**
   * Parse document and extract layout with bounding boxes.
   * Results are cached by content hash.
   */
  parseDocument(doc_id: string, content: Buffer, metadata: DocumentMetadata): Promise<DocumentLayout>;
}

/**
 * Stub layout parser for testing.
 * Real implementation will integrate Docling or Marker.
 */
export class StubLayoutParser implements LayoutParser {
  async parseDocument(doc_id: string, content: Buffer, metadata: DocumentMetadata): Promise<DocumentLayout> {
    // Stub implementation: treat entire content as single block
    const text = content.toString("utf-8");

    const blocks: TextBlock[] = [
      {
        page: 1,
        bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
        text,
      },
    ];

    return {
      doc_id,
      metadata,
      blocks,
      full_text: text,
    };
  }
}

/**
 * Normalize whitespace in extracted text.
 * Used for excerpt matching in validator.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim();
}

/**
 * Find text excerpt in layout and return matching blocks.
 * Uses normalized whitespace matching.
 */
export function findExcerpt(layout: DocumentLayout, excerpt: string): TextBlock[] {
  const normalizedExcerpt = normalizeWhitespace(excerpt).toLowerCase();
  if (!normalizedExcerpt) return [];
  const matches: TextBlock[] = [];

  for (const block of layout.blocks) {
    const normalizedBlock = normalizeWhitespace(block.text).toLowerCase();

    if (normalizedBlock.includes(normalizedExcerpt)) {
      matches.push(block);
    }
  }

  return matches;
}

/**
 * Extract text from specific page and bbox.
 */
export function extractTextFromRegion(layout: DocumentLayout, page: number, bbox: BBox): string {
  const pageBlocks = layout.blocks.filter((b) => b.page === page);

  // Find blocks that overlap with the specified bbox
  const overlapping = pageBlocks.filter((block) => {
    const b = block.bbox;
    // Check for bbox intersection
    return !(b.x1 < bbox.x0 || b.x0 > bbox.x1 || b.y1 < bbox.y0 || b.y0 > bbox.y1);
  });

  return overlapping.map((b) => b.text).join(" ");
}

/**
 * Calculate overlap between two bounding boxes (0-1).
 */
export function calculateBBoxOverlap(a: BBox, b: BBox): number {
  const xOverlap = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const yOverlap = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  if (xOverlap === 0 || yOverlap === 0) return 0;

  const overlapArea = xOverlap * yOverlap;
  const aArea = (a.x1 - a.x0) * (a.y1 - a.y0);
  const bArea = (b.x1 - b.x0) * (b.y1 - b.y0);

  return overlapArea / Math.min(aArea, bArea);
}
