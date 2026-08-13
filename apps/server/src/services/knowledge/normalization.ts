import type { ExtractedBlock, ExtractedBlockKind } from "./extraction-types.js";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HORIZONTAL_WHITESPACE = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000 ]+/g;

export function normalizeInlineText(value: string): string {
  return value
    .normalize("NFC")
    .replace(CONTROL_CHARACTERS, "")
    .replace(HORIZONTAL_WHITESPACE, " ")
    .trim();
}

export function normalizeMultilineText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARACTERS, "")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL_WHITESPACE, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface BlockSeed {
  kind: ExtractedBlockKind;
  text: string;
  pageNumber?: number;
  headingLevel?: number;
  listDepth?: number;
}

export function buildBlocks(seeds: BlockSeed[]): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  for (const seed of seeds) {
    const text = normalizeMultilineText(seed.text);
    if (!text) continue;
    const order = blocks.length;
    blocks.push({
      id: `block-${String(order + 1).padStart(6, "0")}`,
      order,
      kind: seed.kind,
      text,
      ...(seed.pageNumber === undefined ? {} : { pageNumber: seed.pageNumber }),
      ...(seed.headingLevel === undefined ? {} : { headingLevel: seed.headingLevel }),
      ...(seed.listDepth === undefined ? {} : { listDepth: seed.listDepth }),
    });
  }
  return blocks;
}

export function documentTextFromBlocks(blocks: ExtractedBlock[]): string {
  return normalizeMultilineText(blocks.map((block) => block.text).join("\n\n"));
}

export function paragraphSeeds(value: string): BlockSeed[] {
  const normalized = normalizeMultilineText(value);
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n/g)
    .map((text) => ({ kind: "paragraph" as const, text }));
}

export function decodeUtf8(content: Buffer | Uint8Array | string): string {
  if (typeof content === "string") return content;
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(content)
      .replace(/^\uFEFF/, "");
  } catch (error) {
    throw new Error("El contenido no es texto UTF-8 válido.", { cause: error });
  }
}
