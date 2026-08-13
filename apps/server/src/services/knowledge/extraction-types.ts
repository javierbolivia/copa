export type KnowledgeSourceKind = "pdf" | "docx" | "txt" | "md" | "html" | "manual";

export type ExtractionStatus = "READY" | "NEEDS_OCR";

export type ExtractedBlockKind =
  | "heading"
  | "paragraph"
  | "list_item"
  | "quote"
  | "code";

export interface ExtractedBlock {
  id: string;
  order: number;
  kind: ExtractedBlockKind;
  text: string;
  pageNumber?: number;
  headingLevel?: number;
  listDepth?: number;
}

export interface ExtractedPage {
  pageNumber: number;
  status: ExtractionStatus;
  text: string;
  characterCount: number;
  blockIds: string[];
}

export type KnowledgeMetadataValue = string | number | boolean | null;

export interface ExtractedDocument {
  sourceKind: KnowledgeSourceKind;
  status: ExtractionStatus;
  title?: string;
  text: string;
  blocks: ExtractedBlock[];
  pages?: ExtractedPage[];
  metadata: Record<string, KnowledgeMetadataValue>;
  warnings: string[];
}

export interface KnowledgeExtractionInput {
  sourceKind: KnowledgeSourceKind;
  content: Buffer | Uint8Array | string;
  fileName?: string;
  title?: string;
}

export interface KnowledgeExtractionLimits {
  maxPdfBytes?: number;
  maxDocxBytes?: number;
  maxTextBytes?: number;
  maxPdfPages?: number;
}

export interface StructuralChunk {
  id: string;
  ordinal: number;
  text: string;
  characterCount: number;
  estimatedTokens: number;
  blockIds: string[];
  headingPath: string[];
  pageStart?: number;
  pageEnd?: number;
}

export interface StructuralChunkOptions {
  maxCharacters?: number;
  minCharactersBeforeBoundary?: number;
  splitOnPageBoundary?: boolean;
}

export class KnowledgeExtractionError extends Error {
  constructor(
    public readonly code:
      | "unsupported_source_kind"
      | "invalid_content"
      | "source_too_large"
      | "too_many_pages"
      | "extraction_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "KnowledgeExtractionError";
  }
}
