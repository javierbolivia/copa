import { createHash } from "node:crypto";

export type GeminiPayloadSanitizationKind =
  | "PROFANITY_REDACTED"
  | "SLUR_REDACTED"
  | "GRAPHIC_VIOLENCE_REDACTED"
  | "SELF_HARM_REDACTED"
  | "SEXUAL_VIOLENCE_REDACTED";

export interface GeminiPayloadTransformation {
  /** JSON path in the provider-only copy; never a canonical database field. */
  readonly path: string;
  readonly kind: GeminiPayloadSanitizationKind;
  readonly originalLength: number;
  readonly projectedLength: number;
  /** Allows a local audit to correlate text without persisting it in telemetry. */
  readonly originalFingerprint: string;
}

export interface GeminiPayloadProjectionAudit {
  readonly schemaVersion: 1;
  readonly transformedStringCount: number;
  readonly transformations: readonly GeminiPayloadTransformation[];
}

export interface GeminiPayloadProjection<T> {
  readonly payload: T;
  readonly systemInstructions: string;
  readonly audit: GeminiPayloadProjectionAudit;
}

interface SensitiveSpan {
  readonly kind: GeminiPayloadSanitizationKind;
  readonly pattern: RegExp;
  readonly replacement: string;
}

/**
 * This is a provider-compatibility projection, never a canonical-data filter.
 * It replaces only classified spans, retaining the surrounding sentence and a
 * compact semantic label so the model still understands that harm was reported.
 */
const SENSITIVE_SPANS: readonly SensitiveSpan[] = [
  { kind: "PROFANITY_REDACTED", pattern: /hij[oa]\s+de\s+puta/giu, replacement: "[insulto omitido]" },
  { kind: "PROFANITY_REDACTED", pattern: /(?:puta\s+madre|joder|coñ[oa])/giu, replacement: "[insulto omitido]" },
  { kind: "SLUR_REDACTED", pattern: /\b(?:maric[oó]n(?:es)?|put[ao]s?|subnormal(?:es)?|retrasad[oa]s?|imb[eé]cil(?:es)?)\b/giu, replacement: "[insulto dirigido omitido]" },
  { kind: "GRAPHIC_VIOLENCE_REDACTED", pattern: /cortad[oa]s?\s+las?\s+(?:dos\s+)?manos?/giu, replacement: "[violencia gráfica omitida]" },
  // Stem variants cover real-world Spanish conjugations that the infinitive-only
  // list below misses (for example, mordió, muerda, herido, maltrato or daño).
  { kind: "GRAPHIC_VIOLENCE_REDACTED", pattern: /\b(?:mord|muerd|ataqu|agred|lastim|herid|herir|maltrat|dañ)[\p{L}\p{M}]*/giu, replacement: "[conducta violenta descrita]" },
  { kind: "GRAPHIC_VIOLENCE_REDACTED", pattern: /\b(?:matar(?:lo|la|los|las|me|te)?|asesinar(?:lo|la|los|las)?|apuñal\w*|ahorcar\w*|degollar\w*|descuartizar\w*|sangr\w*|violenci\w*|muert[eo]\w*|golpear\w*|pegar(?:le|les)?|atacar\w*|morder\w*|agresi[óo]n|agresiv\w*)\b/giu, replacement: "[conducta violenta descrita]" },
  { kind: "SELF_HARM_REDACTED", pattern: /\b(?:suicid\w*|autolesion\w*|quitarme\s+la\s+vida|matarme)\b/giu, replacement: "[autolesión descrita]" },
  { kind: "SEXUAL_VIOLENCE_REDACTED", pattern: /\b(?:violaci[óo]n|abuso\s+sexual|pornograf\w*)\b/giu, replacement: "[contenido sexual sensible omitido]" },
];

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

function sanitizeText(value: string, path: string, transformations: GeminiPayloadTransformation[]): string {
  let projected = value;
  for (const span of SENSITIVE_SPANS) {
    const next = projected.replace(span.pattern, span.replacement);
    if (next === projected) continue;
    transformations.push({
      path,
      kind: span.kind,
      originalLength: projected.length,
      projectedLength: next.length,
      originalFingerprint: fingerprint(projected),
    });
    projected = next;
  }
  return projected;
}

function projectValue(value: unknown, path: string, transformations: GeminiPayloadTransformation[]): unknown {
  if (typeof value === "string") return sanitizeText(value, path, transformations);
  if (Array.isArray(value)) return value.map((item, index) => projectValue(item, `${path}[${index}]`, transformations));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, projectValue(item, `${path}.${key}`, transformations)]),
  );
}

/**
 * Canonical SQLite records remain untouched. Apply this only after a module has
 * built its provider input and immediately before Gemini is invoked.
 */
export function buildGeminiProjection<T extends Record<string, unknown>>(
  payload: T,
  systemInstructions: string,
): GeminiPayloadProjection<T> {
  const transformations: GeminiPayloadTransformation[] = [];
  return {
    payload: projectValue(payload, "payload", transformations) as T,
    systemInstructions: sanitizeText(systemInstructions, "systemInstructions", transformations),
    audit: {
      schemaVersion: 1,
      transformedStringCount: transformations.length,
      transformations,
    },
  };
}
