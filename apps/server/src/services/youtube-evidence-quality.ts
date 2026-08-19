import { MARKET_RESEARCH_BUDGETS } from "@our-platform/shared";

/**
 * Deterministic, local-only evidence quality for acquired YouTube comments.
 *
 * Nothing here calls a model, a provider or a clock. The original comment text
 * is never modified: every rule works on a separately derived comparison form,
 * so the stored evidence stays exactly as the customer wrote it.
 */

/** Why a comment cannot be used as market evidence. */
export const YOUTUBE_COMMENT_REJECTIONS = [
  "blank",
  "link_only",
  "symbols_only",
  "repeated_characters",
  "low_information",
  "creator_boilerplate",
] as const;
export type YouTubeCommentRejection = (typeof YOUTUBE_COMMENT_REJECTIONS)[number];

export interface YouTubeCommentQualityInput {
  readonly text: string;
  readonly author?: string | undefined;
  /** Used only to identify creator boilerplate; never to judge relevance. */
  readonly channelTitle?: string | undefined;
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/giu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Reaction tokens that carry no customer language on their own. Kept small and
 * obvious on purpose: a short negative comment such as "carísimo" must survive.
 */
const FILLER_TOKENS = new Set([
  "gracias", "graciass", "thanks", "thank", "thx", "ty",
  "hola", "hello", "hi", "hey", "saludos", "greetings",
  "lol", "lmao", "lmfao", "xd", "haha", "jaja", "hahaha", "jajaja",
  "ok", "okay", "oki", "vale", "bien", "bueno", "nice", "cool", "wow", "omg",
  "amen", "bravo", "genial", "top", "fire",
  "primero", "first", "segundo", "second",
  "like", "liked", "sub", "subbed", "subscribed", "suscrito", "suscribo",
  "si", "yes", "no", "yep", "nope",
  "s2", "uwu", "jajajaja",
]);

const CREATOR_BOILERPLATE = /(?:suscr[ií]b(?:ete|anse)|subscribe|activa la campanita|turn on notifications|(?:link|enlace)\s+(?:en|in)\s+(?:la\s+)?(?:bio|descripci[oó]n|description)|c[oó]digo de descuento|discount code|cup[oó]n|my course|mi curso|mi cursos)/iu;

/** Comparison form. Derived only; the original text is never replaced by it. */
export function youtubeEvidenceComparable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(URL_PATTERN, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokensOf(comparable: string): readonly string[] {
  return comparable.length === 0 ? [] : comparable.split(" ");
}

/** A short unit repeated three or more times: "aaaa", "jajaja", "hahaha". */
function isRepeatedNoise(token: string): boolean {
  return /^(.{1,3}?)\1{2,}$/u.test(token);
}

function normalizedIdentity(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Conservative usability gate. It rejects only evidence that is structurally
 * unusable; a short but meaningful complaint ("se me mueren todas",
 * "too expensive", "this didn't work") is always retained.
 */
export function youtubeCommentRejection(
  input: Readonly<YouTubeCommentQualityInput>,
): YouTubeCommentRejection | null {
  if (input.text.trim().length === 0) return "blank";

  const withoutLinks = input.text.replace(URL_PATTERN, " ");
  if (!LETTER_OR_DIGIT.test(withoutLinks)) {
    // Nothing but links, or nothing but emoji and punctuation.
    return LETTER_OR_DIGIT.test(input.text) ? "link_only" : "symbols_only";
  }

  const author = normalizedIdentity(input.author);
  const channel = normalizedIdentity(input.channelTitle);
  if (author.length > 0 && author === channel && CREATOR_BOILERPLATE.test(input.text)) {
    return "creator_boilerplate";
  }

  const tokens = tokensOf(youtubeEvidenceComparable(withoutLinks));
  if (tokens.length === 0) return "symbols_only";
  if (tokens.every((token) => isRepeatedNoise(token))) return "repeated_characters";
  if (tokens.length === 1) {
    const [token] = tokens as [string];
    // A single token must be a real word, not a reaction or an abbreviation.
    if (FILLER_TOKENS.has(token) || token.length < 4) return "low_information";
    return null;
  }
  if (tokens.every((token) => FILLER_TOKENS.has(token) || isRepeatedNoise(token))) return "low_information";
  return null;
}

export interface YouTubeEvidenceCandidate {
  readonly text: string;
  /** Declared video language when YouTube provided one; otherwise unknown. */
  readonly language?: string | null | undefined;
}

export type YouTubeEvidenceVerdict = "unique" | "exact_duplicate" | "near_duplicate";

interface RetainedEvidence {
  readonly tokens: ReadonlySet<string>;
  readonly bigrams: ReadonlySet<string>;
  readonly digits: string;
  readonly language: string | null;
}

/**
 * Numbers in the order they appear. Order is significant: "video 1 ... comment 2"
 * and "video 2 ... comment 1" are different evidence even though they contain
 * the same words.
 */
function digitSignature(comparable: string): string {
  return (comparable.match(/\d+/gu) ?? []).join(",");
}

/** Adjacent token pairs; word order is what distinguishes a repost from a rewrite. */
function bigramsOf(tokens: readonly string[]): ReadonlySet<string> {
  const bigrams = new Set<string>();
  for (let index = 1; index < tokens.length; index += 1) {
    bigrams.add(`${tokens[index - 1]} ${tokens[index]}`);
  }
  return bigrams;
}

function baseLanguage(language: string | null | undefined): string | null {
  if (typeof language !== "string") return null;
  const normalized = language.trim().toLowerCase().split("-")[0] ?? "";
  return normalized.length === 0 ? null : normalized;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const token of small) if (large.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Bounded exact and near-duplicate detection.
 *
 * Exact matching uses the comparison form. Near matching uses token-set
 * similarity restricted by an inverted index, so the number of comparisons per
 * comment is capped and total work stays linear at the 500-comment ceiling
 * instead of degrading to O(n²).
 *
 * The near rule is deliberately conservative. Short comments are never merged,
 * comments whose numbers differ are never merged, and two comments in different
 * declared languages are never merged.
 */
export class YouTubeEvidenceDeduper {
  private readonly exact = new Map<string, number>();
  private readonly retained: RetainedEvidence[] = [];
  private readonly postings = new Map<string, number[]>();

  /** Distinct comparison forms retained so far. */
  get size(): number {
    return this.retained.length;
  }

  /**
   * Classifies one candidate and, when unique, registers it. Duplicate
   * candidates are never registered, so a repeated template cannot poison the
   * index for later comparisons.
   */
  classify(candidate: Readonly<YouTubeEvidenceCandidate>): YouTubeEvidenceVerdict {
    const comparable = youtubeEvidenceComparable(candidate.text);
    if (this.exact.has(comparable)) {
      this.exact.set(comparable, (this.exact.get(comparable) ?? 0) + 1);
      return "exact_duplicate";
    }

    const tokenList = tokensOf(comparable);
    const tokens = new Set(tokenList);
    const bigrams = bigramsOf(tokenList);
    const digits = digitSignature(comparable);
    const language = baseLanguage(candidate.language);

    if (tokenList.length >= MARKET_RESEARCH_BUDGETS.youtubeNearDuplicateMinTokens) {
      const examined = new Set<number>();
      for (const token of tokens) {
        if (examined.size >= MARKET_RESEARCH_BUDGETS.youtubeNearDuplicateMaxComparisons) break;
        for (const index of this.postings.get(token) ?? []) {
          if (examined.size >= MARKET_RESEARCH_BUDGETS.youtubeNearDuplicateMaxComparisons) break;
          if (examined.has(index)) continue;
          examined.add(index);
          const other = this.retained[index];
          if (other === undefined) continue;
          // Different numbers or different declared languages are different evidence.
          if (other.digits !== digits) continue;
          if (other.language !== null && language !== null && other.language !== language) continue;
          // Both the word set and the word order must agree, so reordered text
          // built from the same vocabulary is not treated as a repost.
          if (jaccard(tokens, other.tokens) >= MARKET_RESEARCH_BUDGETS.youtubeNearDuplicateThreshold
            && jaccard(bigrams, other.bigrams) >= MARKET_RESEARCH_BUDGETS.youtubeNearDuplicateThreshold) {
            return "near_duplicate";
          }
        }
      }
    }

    const position = this.retained.length;
    this.retained.push({ tokens, bigrams, digits, language });
    this.exact.set(comparable, 1);
    for (const token of tokens) {
      const bucket = this.postings.get(token);
      if (bucket === undefined) this.postings.set(token, [position]);
      // Postings are capped so a stop-word bucket cannot grow without bound.
      else if (bucket.length < MARKET_RESEARCH_BUDGETS.youtubeNearDuplicatePostings) bucket.push(position);
    }
    return "unique";
  }
}
