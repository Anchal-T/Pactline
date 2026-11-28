// Document storage and retrieval interface

/**
 * Source reference kind (subset from domain contracts).
 */
export type SourceKind =
  | "spec_section"
  | "submittal"
  | "datasheet"
  | "curve"
  | "quote"
  | "po"
  | "email"
  | "public_registry"
  | "market_report"
  | "price_index"
  | "standard"
  | "photo"
  | "derived";

/**
 * Document metadata with layout information.
 */
export interface DocumentMetadata {
  /** Unique document ID */
  readonly doc_id: string;
  /** Document kind (spec, submittal, datasheet, etc.) */
  readonly kind: SourceKind;
  /** Original filename */
  readonly filename: string;
  /** Content hash (SHA-256) */
  readonly content_hash: string;
  /** Upload timestamp */
  readonly uploaded_at: string;
  /** Total page count */
  readonly page_count: number;
  /** File size in bytes */
  readonly size_bytes: number;
  /** MIME type */
  readonly mime_type: string;
}

/**
 * Bounding box coordinates (normalized 0-1).
 */
export interface BBox {
  /** Left edge (0 = left side of page) */
  readonly x0: number;
  /** Top edge (0 = top of page) */
  readonly y0: number;
  /** Right edge (1 = right side of page) */
  readonly x1: number;
  /** Bottom edge (1 = bottom of page) */
  readonly y1: number;
}

/**
 * Text block with position information.
 */
export interface TextBlock {
  /** Page number (1-indexed) */
  readonly page: number;
  /** Bounding box */
  readonly bbox: BBox;
  /** Extracted text content */
  readonly text: string;
  /** Font size (points, if available) */
  readonly font_size?: number;
  /** Font family (if available) */
  readonly font_family?: string;
  /** Whether this is likely a heading */
  readonly is_heading?: boolean;
}

/**
 * Parsed document layout with text blocks.
 */
export interface DocumentLayout {
  /** Document ID */
  readonly doc_id: string;
  /** Metadata */
  readonly metadata: DocumentMetadata;
  /** All text blocks in reading order */
  readonly blocks: readonly TextBlock[];
  /** Full text concatenation (for search) */
  readonly full_text: string;
}

/**
 * Document store interface.
 * Implementation will use file storage + database for metadata.
 */
export interface DocumentStore {
  /**
   * Store a document and return its ID.
   */
  storeDocument(
    filename: string,
    content: Buffer,
    kind: SourceKind,
    metadata?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Get document metadata by ID.
   */
  getDocumentMetadata(doc_id: string): Promise<DocumentMetadata | null>;

  /**
   * Get parsed layout for a document (cached by content hash).
   */
  getDocumentLayout(doc_id: string): Promise<DocumentLayout | null>;

  /**
   * Store parsed layout (cache for reuse).
   */
  storeDocumentLayout(doc_id: string, layout: DocumentLayout): Promise<void>;

  /**
   * Get raw document content.
   */
  getDocumentContent(doc_id: string): Promise<Buffer | null>;

  /**
   * Find text in document and return matching blocks with bbox.
   */
  searchDocument(doc_id: string, query: string): Promise<TextBlock[]>;

  /**
   * Get specific page as image (for vision models).
   */
  getPageImage(doc_id: string, page: number): Promise<Buffer | null>;
}

/**
 * In-memory document store for testing.
 */
export class InMemoryDocumentStore implements DocumentStore {
  private documents = new Map<string, { metadata: DocumentMetadata; content: Buffer }>();
  private layouts = new Map<string, DocumentLayout>();

  async storeDocument(
    filename: string,
    content: Buffer,
    kind: SourceKind,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const doc_id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const content_hash = this.hashContent(content);

    const docMetadata: DocumentMetadata = {
      doc_id,
      kind,
      filename,
      content_hash,
      uploaded_at: new Date().toISOString(),
      page_count: 1, // Placeholder
      size_bytes: content.length,
      mime_type: "application/pdf",
    };

    this.documents.set(doc_id, { metadata: docMetadata, content });
    return doc_id;
  }

  async getDocumentMetadata(doc_id: string): Promise<DocumentMetadata | null> {
    return this.documents.get(doc_id)?.metadata ?? null;
  }

  async getDocumentLayout(doc_id: string): Promise<DocumentLayout | null> {
    return this.layouts.get(doc_id) ?? null;
  }

  async storeDocumentLayout(doc_id: string, layout: DocumentLayout): Promise<void> {
    this.layouts.set(doc_id, layout);
  }

  async getDocumentContent(doc_id: string): Promise<Buffer | null> {
    return this.documents.get(doc_id)?.content ?? null;
  }

  async searchDocument(doc_id: string, query: string): Promise<TextBlock[]> {
    const layout = await this.getDocumentLayout(doc_id);
    if (!layout) return [];

    const lowerQuery = query.toLowerCase();
    return layout.blocks.filter((block) => block.text.toLowerCase().includes(lowerQuery));
  }

  async getPageImage(doc_id: string, page: number): Promise<Buffer | null> {
    // Not implemented in memory store
    return null;
  }

  private hashContent(content: Buffer): string {
    // Simple hash for testing (use crypto.createHash('sha256') in production)
    return `hash_${content.length}_${content.slice(0, 16).toString("hex")}`;
  }
}
