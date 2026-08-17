import {
  type SemanticConceptMatch,
  type SemanticVocabularySnapshot,
  normalizeAlias,
} from "./semantic-vocabulary.js";

/**
 * Deterministic tokenizer for alias matching.
 *
 * Reuses the same normalization used to persist `normalized_alias`
 * (lower-case, accent-folded, whitespace-collapsed) and then extracts
 * letter/number runs. This yields a stable token list where:
 *   - single-word aliases become exactly one token;
 *   - multi-word aliases become an ordered token sequence;
 *   - accidental substrings (e.g. "precio" inside "desprecio") can never match
 *     because "desprecio" is a single token;
 *   - punctuation is stripped so "ruido digital!" still matches "ruido digital".
 */
function tokenizeForMatch(value: string): string[] {
  return normalizeAlias(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Small, explicit, fixed list of Spanish grammatical connectors (articles,
 * copulas, prepositions, conjunctions, pronouns) that may appear BETWEEN the
 * tokens of a multi-word alias without breaking the match.
 *
 * The tolerance is strictly bounded: every token between two consecutive alias
 * tokens MUST be in this set. Any token with semantic content (e.g. "revisar",
 * "todo") breaks the match, so arbitrary gaps are impossible. No fuzzy matching
 * and no semantic similarity — the list is data, not a model.
 */
const GRAMMATICAL_CONNECTORS = new Set([
  "el", "la", "los", "las", "lo", "le", "les", "se", "me", "te", "nos", "os",
  "un", "una", "uno", "unos", "unas", "mi", "tu", "su", "sus",
  "este", "esta", "estos", "estas", "ese", "esa", "aquel", "aquella",
  "es", "son", "soy", "esta", "estoy", "eres", "somos", "estan",
  "de", "del", "a", "al", "en", "por", "para", "con", "y", "o",
  "que", "porque", "pero", "pues", "no",
]);

/** True when `value` is a purely grammatical connector that may be skipped. */
function isGrammaticalConnector(value: string): boolean {
  return GRAMMATICAL_CONNECTORS.has(value);
}

/**
 * Ordered, gap-tolerant token match for multi-word aliases.
 *
 * `seq` must appear in the same order inside `tokens`; between two consecutive
 * seq tokens only grammatical connectors (see GRAMMATICAL_CONNECTORS) may
 * intervene. A content word between them breaks the match. Deterministic: no
 * fuzzy matching, no embeddings, no generated regex. Single-token aliases use
 * exact token-set membership (never a substring of another word).
 */
function sequenceMatch(tokens: readonly string[], seq: readonly string[]): boolean {
  if (seq.length === 0) return false;
  if (seq.length === 1) return tokens.includes(seq[0]!);
  let si = 0; // index into seq
  let ti = 0; // index into tokens
  while (ti < tokens.length) {
    if (tokens[ti]! === seq[si]) {
      si++;
      if (si === seq.length) return true;
      ti++;
    } else if (isGrammaticalConnector(tokens[ti]!) && si > 0 && si < seq.length) {
      // A connector between already-matched alias tokens is allowed.
      ti++;
    } else {
      // Mismatch: if we had progressed into seq, restart from the beginning.
      if (si > 0) si = 0;
      else ti++;
    }
  }
  return false;
}

/**
 * Match a (normalized) text against every domain concept of a vocabulary
 * snapshot.
 *
 * Algorithm (no regex generation, no fuzzy, no embeddings, no LLM):
 *   1. Tokenize the text once.
 *   2. For each concept, check exclusions FIRST. If any exclusion sequence is
 *      found, the concept is blocked (not activated) and recorded with the
 *      blocking exclusion.
 *   3. Otherwise, check aliases. A single-token alias matches when the token is
 *      present in the text token set (word boundary, never a substring of
 *      another word). A multi-token alias matches only as a contiguous ordered
 *      sequence of tokens.
 *
 * Returns one entry per concept that matched or was blocked, preserving enough
 * provenance for PHASE 3 audit (conceptKey, matchedAlias, vocabularyVersionId,
 * blocking exclusion). The vocabularyVersionId is taken from the snapshot, never
 * from any fixture-specific id.
 */
export function matchDomainConcepts(
  snapshot: SemanticVocabularySnapshot,
  text: string,
): SemanticConceptMatch[] {
  const textTokens = tokenizeForMatch(text);
  const textTokenSet = new Set(textTokens);
  const results: SemanticConceptMatch[] = [];

  for (const concept of snapshot.concepts) {
    let blockedBy: string | null = null;
    for (const exclusion of concept.exclusions) {
      if (sequenceMatch(textTokens, tokenizeForMatch(exclusion))) {
        blockedBy = exclusion;
        break;
      }
    }
    if (blockedBy) {
      results.push({
        conceptKey: concept.conceptKey,
        matchedAlias: null,
        vocabularyVersionId: snapshot.vocabularyVersionId,
        blockedByExclusion: blockedBy,
      });
      continue;
    }

    let matched: string | null = null;
    for (const alias of concept.aliases) {
      const aliasTokens = tokenizeForMatch(alias);
      if (aliasTokens.length === 0) continue;
      if (aliasTokens.length === 1) {
        if (textTokenSet.has(aliasTokens[0]!)) {
          matched = alias;
          break;
        }
      } else if (sequenceMatch(textTokens, aliasTokens)) {
        matched = alias;
        break;
      }
    }

    if (matched) {
      results.push({
        conceptKey: concept.conceptKey,
        matchedAlias: matched,
        vocabularyVersionId: snapshot.vocabularyVersionId,
        blockedByExclusion: null,
      });
    }
  }

  return results;
}

/** Active (non-blocked) domain concept keys detected in `text` for `snapshot`. */
export function domainConceptsOf(snapshot: SemanticVocabularySnapshot, text: string): string[] {
  return matchDomainConcepts(snapshot, text)
    .filter((match) => match.matchedAlias !== null && !match.blockedByExclusion)
    .map((match) => match.conceptKey);
}
