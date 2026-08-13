import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ModuleKey } from "@our-platform/shared";

import { WORKSPACE_ROOT } from "../config.js";

export type ModelTier = "economy" | "powerful";

export interface ModulePrompt {
  readonly agentKey: string;
  readonly version: string;
  readonly hash: string;
  readonly versionHash: string;
  readonly instructions: string;
  readonly modelTier: ModelTier;
  readonly relativePath: string;
}

const PROMPT_FILES: Partial<Record<ModuleKey, string>> = {
  research: "research.md",
  problems: "problem-analyzer.md",
  opportunities: "opportunity-scorer.md",
  product: "product-builder.md",
  avatar: "avatar-builder.md",
  mechanism: "mechanism-builder.md",
  beliefs: "beliefs-agent.md",
  offer: "offer-builder.md",
  landing: "landing-builder.md",
  funnel: "funnel-builder.md",
  emails: "email-agent.md",
  content: "content-engine.md",
  final_product: "product-generator.md",
};

// Work that combines or synthesizes many upstream artifacts gets the powerful model.
const POWERFUL_MODULES = new Set<ModuleKey>([
  "research", "problems", "opportunities", "product", "mechanism", "offer", "landing", "final_product",
]);

const promptCache = new Map<ModuleKey, ModulePrompt>();

export function getModulePrompt(key: ModuleKey): ModulePrompt | undefined {
  const filename = PROMPT_FILES[key];
  if (!filename) return undefined;
  const cached = promptCache.get(key);
  if (cached) return cached;

  const relativePath = `prompts/${filename}`;
  const source = readFileSync(resolve(WORKSPACE_ROOT, relativePath), "utf8");
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(source);
  if (!frontMatter) throw new Error(`El prompt ${relativePath} no tiene front matter valido.`);
  const metadata = Object.fromEntries(frontMatter[1]!.split(/\r?\n/u).map((line) => {
    const separator = line.indexOf(":");
    return separator < 0 ? [line.trim(), ""] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
  if (!metadata.agent_key || !metadata.version || metadata.status !== "active") {
    throw new Error(`El prompt ${relativePath} no esta activo o carece de metadata requerida.`);
  }
  const hash = createHash("sha256").update(source).digest("hex");
  const prompt: ModulePrompt = {
    agentKey: metadata.agent_key,
    version: metadata.version,
    hash,
    versionHash: `${metadata.version}+sha256.${hash.slice(0, 12)}`,
    instructions: frontMatter[2]!.trim(),
    modelTier: POWERFUL_MODULES.has(key) ? "powerful" : "economy",
    relativePath,
  };
  promptCache.set(key, prompt);
  return prompt;
}

