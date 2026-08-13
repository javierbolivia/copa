import { createHash } from "node:crypto";
import { normalizeMultilineText } from "./normalization.js";
import type { ExtractedBlock, ExtractedDocument, StructuralChunk, StructuralChunkOptions } from "./extraction-types.js";

interface BlockPiece {
  block: ExtractedBlock;
  text: string;
}

function splitLongText(text: string, maxCharacters: number): string[] {
  const result: string[] = [];
  let remaining = normalizeMultilineText(text);
  while (remaining.length > maxCharacters) {
    const candidate = remaining.slice(0, maxCharacters + 1);
    const sentence = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "), candidate.lastIndexOf("\n"));
    const whitespace = candidate.lastIndexOf(" ");
    const cut = sentence >= Math.floor(maxCharacters * 0.55) ? sentence + 1 : whitespace >= Math.floor(maxCharacters * 0.55) ? whitespace : maxCharacters;
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function pageRange(pieces: BlockPiece[]): { pageStart?: number; pageEnd?: number } {
  const pages = pieces.map((piece) => piece.block.pageNumber).filter((page): page is number => page !== undefined);
  if (pages.length === 0) return {};
  return { pageStart: Math.min(...pages), pageEnd: Math.max(...pages) };
}

export function chunkExtractedDocument(
  document: ExtractedDocument,
  options: StructuralChunkOptions = {},
): StructuralChunk[] {
  const maxCharacters = options.maxCharacters ?? 1_600;
  const minBoundary = options.minCharactersBeforeBoundary ?? 500;
  const splitOnPageBoundary = options.splitOnPageBoundary ?? true;
  if (!Number.isInteger(maxCharacters) || maxCharacters < 100) throw new RangeError("maxCharacters debe ser un entero de al menos 100.");
  if (!Number.isInteger(minBoundary) || minBoundary < 0 || minBoundary > maxCharacters) throw new RangeError("minCharactersBeforeBoundary no es válido.");

  const pieces: BlockPiece[] = document.blocks.flatMap((block) => splitLongText(block.text, maxCharacters).map((text) => ({ block, text })));
  const chunks: StructuralChunk[] = [];
  const headings: string[] = [];
  let pending: BlockPiece[] = [];

  const flush = (): void => {
    if (pending.length === 0) return;
    const text = normalizeMultilineText(pending.map((piece) => piece.text).join("\n\n"));
    const ordinal = chunks.length;
    const range = pageRange(pending);
    const digest = createHash("sha256")
      .update(`${document.sourceKind}\u0000${document.title ?? ""}\u0000${ordinal}\u0000${text}`)
      .digest("hex")
      .slice(0, 24);
    chunks.push({
      id: `chunk-${digest}`,
      ordinal,
      text,
      characterCount: text.length,
      estimatedTokens: Math.ceil(text.length / 4),
      blockIds: [...new Set(pending.map((piece) => piece.block.id))],
      headingPath: [...headings],
      ...range,
    });
    pending = [];
  };

  for (const piece of pieces) {
    const pendingLength = pending.reduce((sum, entry) => sum + entry.text.length, 0) + Math.max(0, pending.length - 1) * 2;
    const lastPage = pending.at(-1)?.block.pageNumber;
    const pageChanged = splitOnPageBoundary && lastPage !== undefined && piece.block.pageNumber !== undefined && lastPage !== piece.block.pageNumber;
    const headingBoundary = piece.block.kind === "heading" && pendingLength >= minBoundary;
    const sizeBoundary = pending.length > 0 && pendingLength + 2 + piece.text.length > maxCharacters;
    if (pageChanged || headingBoundary || sizeBoundary) flush();

    if (piece.block.kind === "heading") {
      const level = Math.min(6, Math.max(1, piece.block.headingLevel ?? 1));
      headings.splice(level - 1);
      headings[level - 1] = piece.text;
    }
    pending.push(piece);
  }
  flush();
  return chunks;
}
