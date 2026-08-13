import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api.d.ts";
import { buildBlocks, documentTextFromBlocks, normalizeInlineText, normalizeMultilineText, type BlockSeed } from "./normalization.js";
import { KnowledgeExtractionError, type ExtractedDocument, type ExtractedPage, type KnowledgeMetadataValue } from "./extraction-types.js";

const require = createRequire(import.meta.url);
const STANDARD_FONT_DATA_URL = `${join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts").replaceAll("\\", "/")}/`;

function isTextItem(value: unknown): value is TextItem {
  return typeof value === "object" && value !== null && "str" in value && typeof value.str === "string";
}

function safeMetadata(input: unknown): Record<string, KnowledgeMetadataValue> {
  if (typeof input !== "object" || input === null) return {};
  const output: Record<string, KnowledgeMetadataValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") output[key] = normalizeInlineText(value).slice(0, 2_000);
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "boolean" || value === null) output[key] = value;
  }
  return output;
}

function pageSeeds(items: TextItem[], pageNumber: number): BlockSeed[] {
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const text = normalizeInlineText(item.str);
    if (text) current += `${current ? " " : ""}${text}`;
    if (item.hasEOL) {
      if (current) lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.length === 0 ? [] : [{ kind: "paragraph", text: lines.join("\n"), pageNumber }];
}

export async function extractPdf(
  content: Buffer | Uint8Array,
  options: { title?: string; maxPages: number },
): Promise<ExtractedDocument> {
  const loadingTask = getDocument({
    data: new Uint8Array(content),
    useWorkerFetch: false,
    useWasm: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    stopAtErrors: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    enableXfa: false,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > options.maxPages) {
      throw new KnowledgeExtractionError("too_many_pages", `El PDF supera el límite de ${options.maxPages} páginas.`);
    }
    const seeds: BlockSeed[] = [];
    const pages: ExtractedPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const contentResult = await page.getTextContent({ disableNormalization: false });
      const items = contentResult.items.filter(isTextItem);
      const pageBlockSeeds = pageSeeds(items, pageNumber);
      const pageBlocks = buildBlocks(pageBlockSeeds);
      const text = normalizeMultilineText(pageBlocks.map((block) => block.text).join("\n\n"));
      const start = seeds.length;
      seeds.push(...pageBlockSeeds);
      pages.push({
        pageNumber,
        status: text.length === 0 ? "NEEDS_OCR" : "READY",
        text,
        characterCount: text.length,
        blockIds: pageBlocks.map((_, index) => `block-${String(start + index + 1).padStart(6, "0")}`),
      });
      page.cleanup();
    }
    const metadataResult = await document.getMetadata().catch(() => undefined);
    const info = safeMetadata(metadataResult?.info);
    const metadataTitle = typeof info.Title === "string" ? info.Title : "";
    const title = normalizeInlineText(options.title || metadataTitle);
    const blocks = buildBlocks(seeds);
    const needsOcrPages = pages.filter((page) => page.status === "NEEDS_OCR").length;
    return {
      sourceKind: "pdf",
      status: pages.length > 0 && needsOcrPages === pages.length ? "NEEDS_OCR" : "READY",
      ...(title ? { title } : {}),
      text: documentTextFromBlocks(blocks),
      blocks,
      pages,
      metadata: {
        ...info,
        pageCount: document.numPages,
        needsOcrPages,
        hasStructTree: Boolean(metadataResult && "hasStructTree" in metadataResult && metadataResult.hasStructTree === true),
      },
      warnings: needsOcrPages > 0 ? [`${needsOcrPages} página(s) no contienen texto extraíble y requieren OCR.`] : [],
    };
  } catch (error) {
    if (error instanceof KnowledgeExtractionError) throw error;
    throw new KnowledgeExtractionError("extraction_failed", "No se pudo extraer el documento PDF.", { cause: error });
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
