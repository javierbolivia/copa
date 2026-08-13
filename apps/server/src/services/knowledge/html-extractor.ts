import { buildBlocks, documentTextFromBlocks, normalizeInlineText, type BlockSeed } from "./normalization.js";
import type { ExtractedDocument } from "./extraction-types.js";

const BLOCKED_ELEMENTS = new Set([
  "script", "style", "noscript", "template", "iframe", "object", "embed",
  "svg", "math", "canvas", "form", "input", "button", "select", "textarea",
  "option", "head", "title", "base", "link", "meta",
]);
const BLOCK_ELEMENTS = new Set([
  "p", "div", "section", "article", "main", "aside", "header", "footer",
  "nav", "figure", "figcaption", "pre", "blockquote", "tr", "table", "hr",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, (entity, name: string) => {
    if (name[0] === "#") {
      const hexadecimal = name[1]?.toLowerCase() === "x";
      const point = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff) return "";
      try { return String.fromCodePoint(point); } catch { return ""; }
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? " ";
  });
}

interface ParsedTag {
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
}

function readTag(html: string, start: number): ParsedTag | undefined {
  if (html.startsWith("<!--", start)) {
    const close = html.indexOf("-->", start + 4);
    return { end: close === -1 ? html.length : close + 3, name: "!comment", closing: false, selfClosing: true };
  }
  const close = html.indexOf(">", start + 1);
  if (close === -1) return undefined;
  const raw = html.slice(start + 1, close).trim();
  if (!raw || raw.startsWith("!") || raw.startsWith("?")) {
    return { end: close + 1, name: "!declaration", closing: false, selfClosing: true };
  }
  const closing = raw.startsWith("/");
  const nameMatch = raw.slice(closing ? 1 : 0).match(/^([a-z][a-z0-9:-]*)/i);
  if (!nameMatch?.[1]) return undefined;
  return {
    end: close + 1,
    name: nameMatch[1].toLowerCase(),
    closing,
    selfClosing: /\/\s*$/.test(raw),
  };
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!match?.[1]) return undefined;
  const value = normalizeInlineText(decodeEntities(match[1].replace(/<[^>]*>/g, " ")));
  return value || undefined;
}

export function htmlToBlockSeeds(html: string): BlockSeed[] {
  const seeds: BlockSeed[] = [];
  const blockedStack: string[] = [];
  let buffer = "";
  let current: BlockSeed = { kind: "paragraph", text: "" };

  const flush = (): void => {
    const text = normalizeInlineText(decodeEntities(buffer));
    if (text) seeds.push({ ...current, text });
    buffer = "";
    current = { kind: "paragraph", text: "" };
  };

  for (let index = 0; index < html.length;) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      if (blockedStack.length === 0) buffer += html.slice(index, next === -1 ? html.length : next);
      index = next === -1 ? html.length : next;
      continue;
    }
    const tag = readTag(html, index);
    if (!tag) {
      if (blockedStack.length === 0) buffer += "<";
      index += 1;
      continue;
    }
    index = tag.end;
    if (tag.name.startsWith("!")) continue;

    if (blockedStack.length > 0) {
      if (!tag.closing && BLOCKED_ELEMENTS.has(tag.name) && !tag.selfClosing) blockedStack.push(tag.name);
      if (tag.closing && tag.name === blockedStack.at(-1)) blockedStack.pop();
      continue;
    }
    if (!tag.closing && BLOCKED_ELEMENTS.has(tag.name)) {
      flush();
      if (!tag.selfClosing) blockedStack.push(tag.name);
      continue;
    }

    const heading = /^h([1-6])$/.exec(tag.name);
    if (heading) {
      if (!tag.closing) {
        flush();
        current = { kind: "heading", text: "", headingLevel: Number(heading[1]) };
      } else {
        flush();
      }
      continue;
    }
    if (tag.name === "li") {
      if (!tag.closing) {
        flush();
        current = { kind: "list_item", text: "", listDepth: 0 };
      } else flush();
      continue;
    }
    if (tag.name === "blockquote") {
      if (!tag.closing) {
        flush();
        current = { kind: "quote", text: "" };
      } else flush();
      continue;
    }
    if (tag.name === "pre") {
      if (!tag.closing) {
        flush();
        current = { kind: "code", text: "" };
      } else flush();
      continue;
    }
    if (tag.name === "br") {
      buffer += "\n";
    } else if (tag.name === "td" || tag.name === "th") {
      if (tag.closing) buffer += " | ";
    } else if (BLOCK_ELEMENTS.has(tag.name)) {
      flush();
    }
  }
  flush();
  return seeds;
}

export function stripHtmlToPlainText(html: string): string {
  return documentTextFromBlocks(buildBlocks(htmlToBlockSeeds(html)));
}

export function extractHtml(html: string, inputTitle?: string): ExtractedDocument {
  const blocks = buildBlocks(htmlToBlockSeeds(html));
  const title = normalizeInlineText(inputTitle || extractTitle(html) || "");
  return {
    sourceKind: "html",
    status: "READY",
    ...(title ? { title } : {}),
    text: documentTextFromBlocks(blocks),
    blocks,
    metadata: { activeContentRemoved: true },
    warnings: [],
  };
}
