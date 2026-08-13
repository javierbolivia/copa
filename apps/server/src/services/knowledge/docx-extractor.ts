import mammoth from "mammoth";
import { htmlToBlockSeeds } from "./html-extractor.js";
import { buildBlocks, documentTextFromBlocks, normalizeInlineText } from "./normalization.js";
import { KnowledgeExtractionError, type ExtractedDocument } from "./extraction-types.js";

export async function extractDocx(content: Buffer | Uint8Array, inputTitle?: string): Promise<ExtractedDocument> {
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(content) },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        includeDefaultStyleMap: true,
        ignoreEmptyParagraphs: true,
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
      },
    );
    const blocks = buildBlocks(htmlToBlockSeeds(result.value));
    const firstHeading = blocks.find((block) => block.kind === "heading")?.text;
    const title = normalizeInlineText(inputTitle || firstHeading || "");
    return {
      sourceKind: "docx",
      status: "READY",
      ...(title ? { title } : {}),
      text: documentTextFromBlocks(blocks),
      blocks,
      metadata: { externalFileAccess: false, activeContentRemoved: true },
      warnings: result.messages.map((message) => normalizeInlineText(message.message)).filter(Boolean),
    };
  } catch (error) {
    throw new KnowledgeExtractionError("extraction_failed", "No se pudo extraer el documento DOCX.", { cause: error });
  }
}
