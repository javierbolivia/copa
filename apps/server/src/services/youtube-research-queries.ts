/**
 * Deterministic, LLM-free derivation of the YouTube discovery plan.
 *
 * Market research is global by design, so one Research Focus fans out into a
 * bounded set of query lanes: a Spanish-first lane, an English lane, and one
 * undecorated global lane that lets YouTube relevance surface any language.
 * No language is searched beyond those two decorated lanes, and nothing here
 * performs I/O or calls a model.
 */

/** Research angle classes; each one maps to exactly one template per language lane. */
export const YOUTUBE_RESEARCH_ANGLES = [
  "direct_problem",
  "frustration",
  "mistakes",
  "solution_seeking",
  "desired_outcome",
] as const;
export type YouTubeResearchAngle = (typeof YOUTUBE_RESEARCH_ANGLES)[number];

/** Query language lanes. `global` is an undecorated, opportunistic lane. */
export const YOUTUBE_RESEARCH_QUERY_LANGUAGES = ["es", "en", "global"] as const;
export type YouTubeResearchQueryLanguage = (typeof YOUTUBE_RESEARCH_QUERY_LANGUAGES)[number];

export interface YouTubeResearchQuery {
  readonly query: string;
  readonly angle: YouTubeResearchAngle;
  readonly language: YouTubeResearchQueryLanguage;
}

/** Hard ceiling on discovery queries so search cost cannot grow with topic length. */
export const YOUTUBE_RESEARCH_MAX_QUERIES = 12;

const SPANISH_TEMPLATES: Readonly<Record<YouTubeResearchAngle, (topic: string) => string>> = {
  direct_problem: (topic) => `${topic} problemas`,
  frustration: (topic) => `${topic} no funciona`,
  mistakes: (topic) => `errores ${topic}`,
  solution_seeking: (topic) => `cómo solucionar ${topic}`,
  desired_outcome: (topic) => `${topic} resultados reales`,
};

const ENGLISH_TEMPLATES: Readonly<Record<YouTubeResearchAngle, (topic: string) => string>> = {
  direct_problem: (topic) => `${topic} problems`,
  frustration: (topic) => `${topic} not working`,
  mistakes: (topic) => `${topic} mistakes`,
  solution_seeking: (topic) => `how to fix ${topic}`,
  desired_outcome: (topic) => `${topic} real results`,
};

const MAX_TOPIC_LENGTH = 120;

/**
 * Canonical topic form used to build queries: collapsed whitespace with quote
 * and operator characters removed so a focus can never inject search syntax.
 */
export function youtubeResearchTopic(topic: string): string {
  return topic
    .normalize("NFC")
    .replace(/["'|()\[\]{}]/gu, " ")
    .replace(/[+\-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_TOPIC_LENGTH)
    .trim();
}

/** Case/diacritic-insensitive comparison form used only to collapse equal queries. */
function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Builds the bounded discovery plan for one topic. The result is stable for a
 * given topic: same order, same angles, same languages, no randomness and no
 * clock. Duplicate query strings (a topic that already contains a template
 * word) collapse to their first occurrence.
 */
export function deriveYouTubeResearchQueries(topic: string): readonly YouTubeResearchQuery[] {
  const normalized = youtubeResearchTopic(topic);
  if (normalized.length === 0) return [];

  const planned: YouTubeResearchQuery[] = [
    // The undecorated lane runs first: it is the least biased view of the topic.
    { query: normalized, angle: "direct_problem", language: "global" },
  ];
  for (const angle of YOUTUBE_RESEARCH_ANGLES) {
    planned.push({ query: SPANISH_TEMPLATES[angle](normalized), angle, language: "es" });
  }
  for (const angle of YOUTUBE_RESEARCH_ANGLES) {
    planned.push({ query: ENGLISH_TEMPLATES[angle](normalized), angle, language: "en" });
  }

  const seen = new Set<string>();
  const queries: YouTubeResearchQuery[] = [];
  for (const candidate of planned) {
    if (queries.length >= YOUTUBE_RESEARCH_MAX_QUERIES) break;
    const key = comparable(candidate.query);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    queries.push(candidate);
  }
  return queries;
}
