import type { AppDatabase } from "../database/database.js";

export type SupportType = "DIRECT" | "INFERRED" | "CONTEXT_ONLY" | "NOT_SUPPORTED";
export type ProblemStrength = "SIGNAL" | "EMERGING" | "PATTERN" | "STRONG_PATTERN";

export interface ProblemQualityConfig { readonly emergingAuthors: number; readonly patternAuthors: number; readonly strongAuthors: number; readonly strongSources: number; }
export const PROBLEM_QUALITY_CONFIG: ProblemQualityConfig = { emergingAuthors: 2, patternAuthors: 4, strongAuthors: 6, strongSources: 2 };
const STOP_WORDS = new Set("de del la el los las y o en para por con un una que como sobre sus se al a es son no mi tu su this that from into foto fotos fotografia fotografias tutorial video".split(" "));
const tokens = (value: string) => new Set(value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/gu, "").match(/[\p{L}\p{N}]{3,}/gu)?.filter((word) => !STOP_WORDS.has(word)) ?? []);
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((word) => b.has(word));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

interface EvidenceRow { id: string; commentId: string; quoteText: string; author: string; sourceId: string; sourceTitle: string; likes: number; isReply: number; }
interface Candidate { id: string; name: string; summary: string; category: string; evidenceIds: string[]; }
interface ValidatedEvidence extends EvidenceRow { supportType: SupportType; }

export function deriveResearchFocus(sourceTitles: readonly string[], fallback: string): string {
  const frequency = new Map<string, number>();
  for (const title of sourceTitles) for (const token of tokens(title)) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  const focus = [...frequency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([token]) => token);
  return focus.length ? focus.join(" ") : fallback;
}

export function classifyEvidenceSupport(claim: string, quote: string, focus: string): SupportType {
  const claimTokens = tokens(claim), quoteTokens = tokens(quote), directOverlap = overlap(claimTokens, quoteTokens).length;
  if (directOverlap >= 2 || (directOverlap === 1 && (claimTokens.size <= 2 || quoteTokens.size <= 4))) return "DIRECT";
  if (directOverlap === 1 && quoteTokens.size >= 3) return "INFERRED";
  return overlap(tokens(focus), quoteTokens).length > 0 ? "CONTEXT_ONLY" : "NOT_SUPPORTED";
}

export function scoreProblem(input: { precision: number; uniqueAuthors: number; uniqueSources: number; totalLikes: number; relevance: number }): number {
  const recurrence = Math.min(100, input.uniqueAuthors * 18 + Math.max(0, input.uniqueSources - 1) * 14);
  const engagement = Math.min(100, Math.log10(input.totalLikes + 1) * 25);
  let score = Math.round(input.precision * .38 + recurrence * .32 + input.relevance * .24 + engagement * .06);
  if (input.uniqueAuthors <= 1) score = Math.min(score, 35);
  if (input.precision < 60) score = Math.min(score, 45);
  return Math.max(0, Math.min(100, score));
}

export function strengthLevel(uniqueAuthors: number, uniqueSources: number): ProblemStrength {
  if (uniqueAuthors >= PROBLEM_QUALITY_CONFIG.strongAuthors || (uniqueAuthors >= PROBLEM_QUALITY_CONFIG.patternAuthors && uniqueSources >= PROBLEM_QUALITY_CONFIG.strongSources)) return "STRONG_PATTERN";
  if (uniqueAuthors >= PROBLEM_QUALITY_CONFIG.patternAuthors) return "PATTERN";
  if (uniqueAuthors >= PROBLEM_QUALITY_CONFIG.emergingAuthors) return "EMERGING";
  return "SIGNAL";
}

function candidate(value: unknown, index: number): Candidate | undefined {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.summary !== "string") return undefined;
  const evidenceIds = Array.isArray(value.evidenceIds) ? value.evidenceIds.filter((id): id is string => typeof id === "string") : [];
  return { id: typeof value.id === "string" ? value.id : `problem-${index + 1}`, name: value.name.trim(), summary: value.summary.trim(), category: typeof value.category === "string" ? value.category : "problem", evidenceIds: [...new Set(evidenceIds)] };
}
function relevant(claim: string, focus: string): number { const score = overlap(tokens(claim), tokens(focus)).length; return Math.min(100, score * 34 + (score ? 18 : 10)); }
function mergeKey(value: Candidate): Set<string> { return tokens(`${value.name} ${value.summary}`); }

/** Validates Gemini candidates against the persisted active Analysis Set; no generated evidence can enter storage. */
export function qualityProblems(database: AppDatabase, projectId: string, raw: unknown): Record<string, unknown> {
  const output = isRecord(raw) ? raw : {};
  const rows = database.connection.prepare(`SELECT e.id,e.comment_id commentId,e.quote_text quoteText,c.author,e.source_id sourceId,s.title sourceTitle,c.likes,c.is_reply isReply FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')`).all(projectId) as unknown as EvidenceRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const sourceTitles = [...new Set(rows.map((row) => row.sourceTitle))];
  const project = database.connection.prepare("SELECT niche FROM projects WHERE id=?").get(projectId) as { niche: string } | undefined;
  const focus = deriveResearchFocus(sourceTitles, project?.niche ?? "");
  const candidates = (Array.isArray(output.items) ? output.items : []).map(candidate).filter((item): item is Candidate => item !== undefined);
  const merged: Candidate[] = [];
  for (const item of candidates) {
    const same = merged.find((other) => { const a = mergeKey(item), b = mergeKey(other), common = overlap(a, b).length; return common >= 2 && common / Math.max(1, Math.min(a.size, b.size)) >= .5; });
    if (same) same.evidenceIds = [...new Set([...same.evidenceIds, ...item.evidenceIds])]; else merged.push(item);
  }
  const items = merged.flatMap((item) => {
    const claim = `${item.name} ${item.summary}`;
    const classified: ValidatedEvidence[] = item.evidenceIds.flatMap((id) => { const row = byId.get(id); if (!row) return []; return [{ ...row, supportType: classifyEvidenceSupport(claim, row.quoteText, focus) }]; });
    const supported = classified.filter((row) => row.supportType === "DIRECT" || row.supportType === "INFERRED");
    if (!supported.length) return [];
    const direct = supported.filter((row) => row.supportType === "DIRECT"), inferred = supported.filter((row) => row.supportType === "INFERRED");
    const authors = new Set(supported.map((row) => row.author.trim().toLocaleLowerCase("es"))), sources = new Set(supported.map((row) => row.sourceId));
    const precision = Math.round(((direct.length + inferred.length * .7) / Math.max(1, item.evidenceIds.length)) * 100);
    const relevance = relevant(claim, focus), likes = supported.reduce((sum, row) => sum + row.likes, 0);
    const strength = scoreProblem({ precision, uniqueAuthors: authors.size, uniqueSources: sources.size, totalLikes: likes, relevance });
    return [{ id: item.id, name: item.name, summary: item.summary, category: item.category, tags: [...new Set([item.category])], evidenceIds: supported.map((row) => row.id), quotes: supported.map((row) => row.quoteText), evidenceCount: supported.length, uniqueAuthors: authors.size, uniqueSources: sources.size, directEvidenceCount: direct.length, inferredEvidenceCount: inferred.length, totalLikes: likes, evidencePrecisionScore: precision, relevanceScore: relevance, problemStrengthScore: strength, strengthLevel: strengthLevel(authors.size, sources.size), evidence: supported.map((row) => ({ evidenceId: row.id, commentId: row.commentId, quote: row.quoteText, author: row.author, sourceTitle: row.sourceTitle, likes: row.likes, isReply: row.isReply === 1, supportType: row.supportType })) }];
  });
  return { ...output, schemaVersion: typeof output.schemaVersion === "number" ? output.schemaVersion : 1, qualityAlgorithmVersion: "problem-quality-v1", researchFocus: focus, items };
}
