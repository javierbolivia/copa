import { buildBlocks, documentTextFromBlocks, normalizeInlineText, normalizeMultilineText, paragraphSeeds, type BlockSeed } from "./normalization.js";
import { stripHtmlToPlainText } from "./html-extractor.js";
import type { ExtractedDocument, KnowledgeSourceKind } from "./extraction-types.js";

function stripInlineMarkdown(value: string): string {
  return normalizeInlineText(stripHtmlToPlainText(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[^\\])[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1$2")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1"));
}

export function markdownToBlockSeeds(markdown: string): BlockSeed[] {
  const source = normalizeMultilineText(markdown);
  if (!source) return [];
  const seeds: BlockSeed[] = [];
  const paragraph: string[] = [];
  let fence: { marker: string; lines: string[] } | undefined;

  const flushParagraph = (): void => {
    const text = stripInlineMarkdown(paragraph.join(" "));
    if (text) seeds.push({ kind: "paragraph", text });
    paragraph.length = 0;
  };

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (fenceMatch?.[1]?.startsWith(fence.marker[0] ?? "`")) {
        const text = normalizeMultilineText(fence.lines.join("\n"));
        if (text) seeds.push({ kind: "code", text });
        fence = undefined;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    if (fenceMatch?.[1]) {
      flushParagraph();
      fence = { marker: fenceMatch[1], lines: [] };
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);
    if (heading?.[1] && heading[2]) {
      flushParagraph();
      seeds.push({ kind: "heading", headingLevel: heading[1].length, text: stripInlineMarkdown(heading[2]) });
      continue;
    }
    const nextLine = lines[index + 1];
    if (line.trim() && nextLine && /^\s*(=+|-+)\s*$/.test(nextLine)) {
      flushParagraph();
      seeds.push({ kind: "heading", headingLevel: nextLine.trim()[0] === "=" ? 1 : 2, text: stripInlineMarkdown(line) });
      index += 1;
      continue;
    }
    const list = line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (list?.[2]) {
      flushParagraph();
      seeds.push({ kind: "list_item", listDepth: Math.floor((list[1]?.length ?? 0) / 2), text: stripInlineMarkdown(list[2]) });
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      const text = stripInlineMarkdown(quote[1] ?? "");
      if (text) seeds.push({ kind: "quote", text });
      continue;
    }
    if (!line.trim()) flushParagraph();
    else paragraph.push(line);
  }
  flushParagraph();
  if (fence) {
    const text = normalizeMultilineText(fence.lines.join("\n"));
    if (text) seeds.push({ kind: "code", text });
  }
  return seeds;
}

export function extractPlainText(
  sourceKind: Extract<KnowledgeSourceKind, "txt" | "manual">,
  text: string,
  inputTitle?: string,
): ExtractedDocument {
  const blocks = buildBlocks(paragraphSeeds(text));
  const title = normalizeInlineText(inputTitle ?? "");
  return {
    sourceKind,
    status: "READY",
    ...(title ? { title } : {}),
    text: documentTextFromBlocks(blocks),
    blocks,
    metadata: {},
    warnings: [],
  };
}

export function extractMarkdown(markdown: string, inputTitle?: string): ExtractedDocument {
  const blocks = buildBlocks(markdownToBlockSeeds(markdown));
  const firstHeading = blocks.find((block) => block.kind === "heading")?.text;
  const title = normalizeInlineText(inputTitle || firstHeading || "");
  return {
    sourceKind: "md",
    status: "READY",
    ...(title ? { title } : {}),
    text: documentTextFromBlocks(blocks),
    blocks,
    metadata: { activeContentRemoved: true },
    warnings: [],
  };
}
