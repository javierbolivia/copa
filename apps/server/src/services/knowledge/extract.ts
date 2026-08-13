import { extractDocx } from "./docx-extractor.js";
import { extractHtml } from "./html-extractor.js";
import { decodeUtf8, normalizeInlineText } from "./normalization.js";
import { extractPdf } from "./pdf-extractor.js";
import { extractMarkdown, extractPlainText } from "./text-extractors.js";
import { KnowledgeExtractionError, type ExtractedDocument, type KnowledgeExtractionInput, type KnowledgeExtractionLimits } from "./extraction-types.js";

const DEFAULT_LIMITS = {
  maxPdfBytes: 50 * 1024 * 1024,
  maxDocxBytes: 25 * 1024 * 1024,
  maxTextBytes: 5 * 1024 * 1024,
  maxPdfPages: 1_000,
} as const;

function byteLength(content: Buffer | Uint8Array | string): number {
  return typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
}

function assertWithinLimit(actual: number, limit: number, label: string): void {
  if (actual > limit) throw new KnowledgeExtractionError("source_too_large", `${label} supera el límite de ${limit} bytes.`);
}

function binaryContent(content: Buffer | Uint8Array | string, label: string): Buffer | Uint8Array {
  if (typeof content === "string") throw new KnowledgeExtractionError("invalid_content", `${label} requiere contenido binario.`);
  if (content.byteLength === 0) throw new KnowledgeExtractionError("invalid_content", `${label} está vacío.`);
  return content;
}

export async function extractKnowledgeDocument(
  input: KnowledgeExtractionInput,
  limits: KnowledgeExtractionLimits = {},
): Promise<ExtractedDocument> {
  const effective = { ...DEFAULT_LIMITS, ...limits };
  const title = normalizeInlineText(input.title ?? input.fileName ?? "");
  const bytes = byteLength(input.content);
  switch (input.sourceKind) {
    case "pdf":
      assertWithinLimit(bytes, effective.maxPdfBytes, "El PDF");
      return extractPdf(binaryContent(input.content, "El PDF"), { title, maxPages: effective.maxPdfPages });
    case "docx":
      assertWithinLimit(bytes, effective.maxDocxBytes, "El DOCX");
      return extractDocx(binaryContent(input.content, "El DOCX"), title);
    case "html":
      assertWithinLimit(bytes, effective.maxTextBytes, "El HTML");
      return extractHtml(decodeUtf8(input.content), title);
    case "md":
      assertWithinLimit(bytes, effective.maxTextBytes, "El Markdown");
      return extractMarkdown(decodeUtf8(input.content), title);
    case "txt":
    case "manual":
      assertWithinLimit(bytes, effective.maxTextBytes, "El texto");
      return extractPlainText(input.sourceKind, decodeUtf8(input.content), title);
    default: {
      const exhaustive: never = input.sourceKind;
      throw new KnowledgeExtractionError("unsupported_source_kind", `Tipo no soportado: ${String(exhaustive)}`);
    }
  }
}
