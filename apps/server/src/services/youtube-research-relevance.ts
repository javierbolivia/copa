import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_YOUTUBE_MAX_REPORTED_DURATION_SECONDS,
  type MarketResearchYouTubeDeterministicReason,
  type MarketResearchYouTubeRelevanceDecision,
} from "@our-platform/shared";

export type YouTubeRelevanceDecision = MarketResearchYouTubeRelevanceDecision;
export type YouTubeVideoRelevanceReason = MarketResearchYouTubeDeterministicReason;
export type YouTubeCommentRelevanceReason = "research_relevant" | "research_irrelevant" | "creator_promotion" | "borderline";

export interface YouTubeVideoRelevanceInput {
  readonly topic: string;
  /** Exact query that first discovered this candidate; never part of Research Focus. */
  readonly query?: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly channelTitle: string;
  readonly duration: string | null;
  /** False when official videos.list metadata was unavailable for this candidate. */
  readonly metadataAvailable?: boolean;
  readonly minimumDurationSeconds?: number;
}

export interface YouTubeVideoRelevance {
  readonly decision: YouTubeRelevanceDecision;
  readonly matchedTerms: readonly string[];
  readonly durationSeconds: number | null;
  readonly reason: YouTubeVideoRelevanceReason;
}

export interface YouTubeCommentRelevanceInput {
  readonly text: string;
  readonly topicTerms: readonly string[];
  readonly author?: string;
  readonly channelTitle?: string;
}

const STOP_WORDS = new Set([
  "a", "al", "algo", "an", "and", "are", "as", "at", "be", "been", "being", "by",
  "cada", "como", "con", "cual", "cuando", "de", "del", "desde", "do", "does", "el", "en",
  "es", "esta", "este", "esto", "for", "from", "ha", "han", "hasta", "hay", "how", "i", "in",
  "is", "it", "la", "las", "lo", "los", "me", "mi", "mis", "no", "not", "of", "on", "or", "para", "pero",
  "por", "que", "se", "sin", "sobre", "su", "sus", "the", "this", "to", "tu", "tus", "un", "una",
  "uno", "was", "what", "when", "where", "which", "who", "why", "with", "y", "ya", "you", "your",
]);

/** Discovery and conversational vocabulary that cannot establish topicality. */
const GENERIC_TERMS = new Set([
  "best", "better", "bueno", "consejo", "error", "fix", "good", "great", "guia", "guide", "help",
  "idea", "lindo", "mejor", "mistake", "new", "nice", "nuevo", "problem", "problema", "real",
  "result", "resultado", "review", "solucion", "solution", "tip", "topic", "tutorial", "video", "way",
]);

const EXPLICIT_AFFILIATE = /\b(?:affiliate|afiliad[oa]|sponsored|patrocinad[oa]|paid partnership|colaboracion pagada|enlace afiliado|affiliate link)\b/iu;
const EXPLICIT_SELF_PROMOTION = /\b(?:(?:mi|my)\s+(?:curso|course|ebook|e-book|libro|book|tienda|shop|producto|product|canal|channel)|(?:compra|buy|visita|visit)\s+(?:mi|my)|(?:link|enlace)\s+(?:en|in)\s+(?:la\s+)?(?:bio|descripcion|description)|use my code|usa mi codigo|suscribete|subscribe|sigueme|follow me|activa la campanita|turn on notifications)\b/iu;
const CREATOR_OFFER = /\b(?:promo(?:cion|tion)?(?: code)?|codigo promocional|codigo de descuento|discount code|descuento|discount|coupon|cupon|oferta|offer|on sale|use the code|usa el codigo)\b/iu;
const RELIGIOUS = /\b(?:amen|aleluya|dios (?:te )?bendiga|god bless|hallelujah|jesus|orando|praying)\b/iu;
const LOCATION_OR_LISTENING = /\b(?:listening|watching|viendo|escuchando)\s+(?:from|desde)\b|\bsaludos?\s+desde\b/iu;
const STORY_OR_TRAVEL = /\b(?:audiobook|audio book|audiolibro|bedtime story|cuento completo|travel vlog|vlog de viaje|tourist|turismo)\b/iu;
const PRAISE_OR_EMOTION = /\b(?:amazing|awesome|beautiful|excelente|fantastico|genial|gracias|great video|i love (?:this|it)|lindo video|love this|me encanta|nice video|thank you|thanks|wow)\b/iu;
const UNRELATED_SOCIAL_OR_CHANNEL_CHATTER = /\b(?:first(?: comment)?|early gang|notification squad|who(?:'s| is) (?:here|watching)|anyone (?:else )?(?:here|watching)|quien (?:sigue )?viendo|alguien (?:mas )?(?:aqui|viendo)|new subscriber|nuevo suscriptor|love your channel|me encanta tu canal|great channel|excelente canal|please upload more|sube mas videos|like if|dale like si)\b/iu;
const STRONG_PAIN = /\b(?:can(?:not|['’]?t)|no puedo|no logro|no (?:me )?(?:funciona|funciono|sirve)|does(?: not|n['’]?t) work|did(?: not|n['’]?t) work|will not work|won['’]?t work|not working|dejo de funcionar|too (?:difficult|hard|slow|noisy)|muy dificil|demasiado lento|imposible|frustrad[oa]|frustrating|struggl\w*|fall[oa]\w*|fail(?:ed|ing|s)?|fracaso\w*|broken|se (?:me )?(?:rompe|rompio|apaga|cierra|cae|pierde|muere|murio|seca|seco)|dried out|keeps? (?:breaking|crashing|failing|freezing)|se rompio|sucks?|horrible|terrible|waste of (?:money|time)|perdi (?:dinero|tiempo)|not worth)\b/iu;
const PRICE_OBJECTION = /\b(?:can(?:not|['’]?t) afford|no me alcanza|fuera de mi presupuesto|carisim[oa]s?|costly|demasiado car[oa]s?|muy car[oa]s?|too expensive|expensive|overpriced|price is too high|precio (?:demasiado )?alto)\b/iu;
const FAILED_ATTEMPT = /\b(?:i tried|i used|i bought|intente|intentamos|probe|probamos|use|usamos|compre|compramos)\b/iu;
const FAILURE_CONNECTOR = /\b(?:aun asi no (?:funciona|funciono|sirve)|did(?: not|n['’]?t) work|failed|no funciono|no resulto|sin resultado|still (?:does(?: not|n['’]?t) work|not working)|tampoco (?:funciona|funciono|sirve))\b/iu;
const DESIRED_OUTCOME = /\b(?:busco|buscando|i need|i want|i wish|looking for|me gustaria|necesito|ojala|quisiera|quiero|would like)\b/iu;
const GENERIC_PAIN = /\b(?:complaint|dificultad|frustracion|issue|pain|problema|problem)\b/iu;
const SIGNAL_WORDS = new Set([
  "afford", "budget", "busco", "buscando", "caro", "carisimo", "complaint", "cost", "dificultad",
  "expensive", "failed", "frustracion", "help", "issue", "looking", "need", "ojala", "overpriced", "pain",
  "precio", "price", "problema", "problem", "quiero", "still", "tried", "want", "wish",
]);

function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("und");
}

function conservativeStem(value: string): string {
  let term = value;
  if (term.length > 7 && term.endsWith("aciones")) term = `${term.slice(0, -7)}acion`;
  else if (term.length > 6 && term.endsWith("ciones")) term = `${term.slice(0, -6)}cion`;
  else if (term.length > 6 && term.endsWith("idades")) term = `${term.slice(0, -6)}idad`;
  else if (term.length > 5 && term.endsWith("ies")) term = `${term.slice(0, -3)}y`;
  else if (term.length > 6 && term.endsWith("ing")) {
    term = term.slice(0, -3);
    if (/([^aeiou])\1$/u.test(term)) term = term.slice(0, -1);
  } else if (term.length > 5 && term.endsWith("ed")) {
    term = term.slice(0, -2);
    if (/([^aeiou])\1$/u.test(term)) term = term.slice(0, -1);
  } else if (term.length > 6 && (term.endsWith("ando") || term.endsWith("iendo"))) {
    term = term.endsWith("ando") ? term.slice(0, -4) : term.slice(0, -5);
  } else if (term.length > 5 && /(?:ches|shes|sses|xes|zes)$/u.test(term)) term = term.slice(0, -2);
  else if (term.length > 5 && term.endsWith("es")) term = term.slice(0, -2);
  else if (term.length > 4 && term.endsWith("s") && !/(?:is|ss|us)$/u.test(term)) term = term.slice(0, -1);
  // Long terminal-e bases share a conservative stem with common -ing/-ed forms.
  if (term.length > 4 && term.endsWith("e")) term = term.slice(0, -1);
  return term;
}

function lexicalTokens(value: string, allowGeneric = false): readonly string[] {
  const normalized = comparable(value);
  const raw = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of raw) {
    if (STOP_WORDS.has(token)) continue;
    const stem = conservativeStem(token).slice(0, 80);
    if (stem.length < 2 || STOP_WORDS.has(stem)) continue;
    if (!allowGeneric && (GENERIC_TERMS.has(token) || GENERIC_TERMS.has(stem))) continue;
    if (!seen.has(stem)) {
      seen.add(stem);
      result.push(stem);
    }
  }
  return result;
}

export function resolveYouTubeMinimumDurationSeconds(value: number | undefined): number {
  const resolved = value ?? MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds;
  if (!Number.isSafeInteger(resolved)
    || resolved < MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds
    || resolved > MARKET_RESEARCH_BUDGETS.youtubeMaximumMinimumDurationSeconds) {
    throw new RangeError("youtubeMinimumDurationSeconds is outside the supported range");
  }
  return resolved;
}

export function durationSeconds(value: string | null): number | null {
  if (value === null) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value);
  if (match === null || (match[1] === undefined && match[2] === undefined && match[3] === undefined)) return null;
  const total = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(total) && total >= 0 && total <= MARKET_RESEARCH_YOUTUBE_MAX_REPORTED_DURATION_SECONDS
    ? total
    : null;
}

/** Research Focus terms come exclusively from the undecorated topic. */
export function topicTerms(topic: string): readonly string[] {
  return lexicalTokens(topic).slice(0, MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxMatchedTerms);
}

/** Deterministic, popularity-free metadata assessment before comment I/O. */
export function assessYouTubeVideoRelevance(input: Readonly<YouTubeVideoRelevanceInput>): YouTubeVideoRelevance {
  const minimumDurationSeconds = resolveYouTubeMinimumDurationSeconds(input.minimumDurationSeconds);
  if (input.metadataAvailable === false) {
    return { decision: "irrelevant", matchedTerms: [], durationSeconds: null, reason: "video_metadata_unavailable" };
  }

  const seconds = durationSeconds(input.duration);
  if (seconds === null) {
    return { decision: "irrelevant", matchedTerms: [], durationSeconds: null, reason: "duration_unavailable" };
  }
  if (seconds < minimumDurationSeconds) {
    return { decision: "irrelevant", matchedTerms: [], durationSeconds: seconds, reason: "duration_below_minimum" };
  }

  const focus = topicTerms(input.topic);
  if (focus.length === 0) {
    return { decision: "irrelevant", matchedTerms: [], durationSeconds: seconds, reason: "no_meaningful_topic_terms" };
  }

  const title = new Set(lexicalTokens(input.title));
  const description = new Set(lexicalTokens(input.description));
  const tags = new Set(input.tags.flatMap((tag) => lexicalTokens(tag)));
  const channel = new Set(lexicalTokens(input.channelTitle));
  const matchedTerms = focus.filter((term) => title.has(term) || description.has(term) || tags.has(term) || channel.has(term));
  if (matchedTerms.length === 0) {
    return { decision: "irrelevant", matchedTerms, durationSeconds: seconds, reason: "no_topic_overlap" };
  }

  let score = 0;
  let titleMatches = 0;
  for (const term of matchedTerms) {
    if (title.has(term)) { score += 4; titleMatches += 1; }
    if (tags.has(term)) score += 3;
    if (description.has(term)) score += 2;
    if (channel.has(term)) score += 1;
  }

  // Query decorators can add at most one point, and only after topic overlap.
  const focusSet = new Set(focus);
  const queryIntent = lexicalTokens(input.query ?? "", true).filter((term) => !focusSet.has(term));
  const metadataIntent = new Set(lexicalTokens(
    `${input.title} ${input.description} ${input.tags.join(" ")} ${input.channelTitle}`,
    true,
  ));
  if (queryIntent.some((term) => metadataIntent.has(term))) score += 1;

  if (score >= 6) {
    return {
      decision: "relevant",
      matchedTerms,
      durationSeconds: seconds,
      reason: titleMatches > 0 ? "strong_title_topic_overlap" : "strong_metadata_topic_overlap",
    };
  }
  return { decision: "borderline", matchedTerms, durationSeconds: seconds, reason: "limited_topic_overlap" };
}

function normalizedIdentity(value: string | undefined): string {
  return comparable(value ?? "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function commentRelationStem(value: string): string {
  const stem = conservativeStem(comparable(value));
  const inflection = stem.length >= 5 ? stem.replace(/(?:an|en|as|es|a|e|o)$/u, "") : stem;
  // Keep common lexical variants of the same destruction concept comparable.
  return /^destr(?:uy|oz)/u.test(inflection) ? "destru" : inflection;
}

function focusRelationLinks(text: string, focus: readonly string[]): readonly string[] {
  const commentTerms = new Set(lexicalTokens(text).map(commentRelationStem));
  return focus.filter((term) => {
    const relationTerm = commentRelationStem(term);
    // Generic functionality language can strengthen a relationship, but cannot establish one.
    return relationTerm !== "funcion" && commentTerms.has(relationTerm);
  });
}

const RELATION_CONNECTOR = /\b(?:cuando|when|mientras|while)\b/iu;
const DEPARTURE_OR_ABSENCE = /\b(?:me voy|nos vamos|se va|se van|salgo|salimos|sale|salen|(?:lo|la|los|las) dejo|dejamos(?:lo|la|los|las)?|left alone|leave|leaves|leaving|go out|goes out|away)\b/iu;
const ABSENCE_FOCUS_TERMS = new Set(["ausencia", "absence", "alone", "separacion", "separation", "solo"]);

function hasFocusRelation(text: string, focus: readonly string[]): boolean {
  const normalized = comparable(text);
  const clauseRelation = normalized.split(/[.!?;:\n]+/u).some((clause) =>
    RELATION_CONNECTOR.test(clause) && focusRelationLinks(clause, focus).length >= 2);
  if (clauseRelation) return true;

  const focusSupportsAbsence = focus.some((term) => ABSENCE_FOCUS_TERMS.has(commentRelationStem(term)));
  return focusSupportsAbsence
    && DEPARTURE_OR_ABSENCE.test(normalized)
    && focusRelationLinks(text, focus).length > 0;
}

function informativeCommentTerms(text: string, focus: readonly string[]): readonly string[] {
  const focusSet = new Set(focus.map((term) => conservativeStem(comparable(term))));
  return lexicalTokens(text, true).filter((term) =>
    !focusSet.has(term) && !GENERIC_TERMS.has(term) && !SIGNAL_WORDS.has(term));
}

/** Conservative local-only comment gate; topical customer language remains verbatim. */
export function assessYouTubeCommentRelevance(input: Readonly<YouTubeCommentRelevanceInput>): YouTubeCommentRelevanceReason {
  const text = input.text.trim();
  const normalized = comparable(text);
  const author = normalizedIdentity(input.author);
  const channel = normalizedIdentity(input.channelTitle);
  const exactCreator = author.length > 0 && channel.length > 0 && author === channel;
  const explicitAffiliate = EXPLICIT_AFFILIATE.test(normalized);
  const explicitSelfPromotion = EXPLICIT_SELF_PROMOTION.test(normalized);

  const focus = [...new Set(input.topicTerms.map((term) => conservativeStem(comparable(term))))]
    .filter((term) => term.length >= 2 && !GENERIC_TERMS.has(term));
  const relationLinks = focusRelationLinks(text, focus);
  if (relationLinks.length === 0) return "research_irrelevant";
  if (explicitAffiliate || explicitSelfPromotion || (exactCreator && CREATOR_OFFER.test(normalized))) {
    return "creator_promotion";
  }
  if (RELIGIOUS.test(normalized) || LOCATION_OR_LISTENING.test(normalized)) {
    return "research_irrelevant";
  }
  if (relationLinks.length < 2 && focus.length < 3) return "research_irrelevant";
  const informative = informativeCommentTerms(text, focus);
  const failedSolution = FAILED_ATTEMPT.test(normalized) && FAILURE_CONNECTOR.test(normalized);
  const desiredOutcome = DESIRED_OUTCOME.test(normalized) && informative.length > 0;
  const specificPain = STRONG_PAIN.test(normalized) || PRICE_OBJECTION.test(normalized);
  const detailedGenericPain = GENERIC_PAIN.test(normalized) && informative.length > 0;
  // Strong evidence can qualify without causal wording only when it covers the
  // Focus itself, rather than combining one matching term with unrelated pain.
  const strongTopicCoverage = relationLinks.length >= Math.min(2, focus.length)
    && relationLinks.length * 4 >= focus.length * 3;
  if (strongTopicCoverage && (specificPain || failedSolution || desiredOutcome)) return "research_relevant";

  const focusRequiresRelation = focus.length >= 3;
  const focusRelation = hasFocusRelation(text, focus);
  if (focusRequiresRelation && !focusRelation) return "research_irrelevant";
  if (focusRelation || detailedGenericPain) return "research_relevant";

  if (STORY_OR_TRAVEL.test(normalized)
    || PRAISE_OR_EMOTION.test(normalized)
    || UNRELATED_SOCIAL_OR_CHANNEL_CHATTER.test(normalized)) {
    return "research_irrelevant";
  }
  // A question mark, generic emotion, pain, praise, or intent vocabulary alone is never enough.
  return "borderline";
}
