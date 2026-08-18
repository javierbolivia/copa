import {
  MARKET_SIGNAL_NORMALIZATION_VERSION,
  MARKET_SIGNAL_SOURCES,
  type MarketSignalEngagement,
  type MarketSignalSource,
  type NormalizedMarketSignal,
} from "@our-platform/shared";

const MAX_TEXT_LENGTH = 10_000;
const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2_048;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const ISO_TIMESTAMP = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?<fraction>\.\d{1,3})?(?<zone>Z|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u;

export class MarketSignalNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketSignalNormalizationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new MarketSignalNormalizationError(`${field} must be an object`);
  return value;
}

function normalizeText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new MarketSignalNormalizationError(`${field} must be a string`);
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (!normalized) throw new MarketSignalNormalizationError(`${field} must not be empty`);
  if (normalized.length > maxLength) throw new MarketSignalNormalizationError(`${field} exceeds ${maxLength} characters`);
  if (CONTROL_CHARACTER.test(normalized)) throw new MarketSignalNormalizationError(`${field} contains unsafe control characters`);
  return normalized;
}

function normalizeNullableText(value: unknown, field: string, maxLength: number): string | null {
  return value === null ? null : normalizeText(value, field, maxLength);
}

function normalizeIdentifier(value: unknown, field: string): string | null {
  const normalized = normalizeNullableText(value, field, MAX_SHORT_TEXT_LENGTH);
  if (normalized !== null && /[\t\n]/u.test(normalized)) {
    throw new MarketSignalNormalizationError(`${field} must be a single line`);
  }
  return normalized;
}

function normalizeUrl(value: unknown, field: string): string | null {
  const raw = normalizeNullableText(value, field, MAX_URL_LENGTH);
  if (raw === null) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MarketSignalNormalizationError(`${field} must be an absolute URL`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.hostname) {
    throw new MarketSignalNormalizationError(`${field} must be a credential-free HTTP(S) URL`);
  }
  url.hash = "";
  url.searchParams.sort();
  return url.toString();
}

function normalizeCapturedAt(value: unknown, field: string): string {
  const raw = normalizeText(value, field, MAX_SHORT_TEXT_LENGTH);
  const match = raw.match(ISO_TIMESTAMP);
  if (!match?.groups) throw new MarketSignalNormalizationError(`${field} must be an ISO-8601 timestamp with timezone`);

  const { groups } = match;
  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const hour = Number(groups.hour);
  const minute = Number(groups.minute);
  const second = Number(groups.second);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59
    || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new MarketSignalNormalizationError(`${field} must be a valid timestamp`);
  }

  if (groups.zone !== "Z") {
    const offsetHour = Number(groups.offsetHour);
    const offsetMinute = Number(groups.offsetMinute);
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new MarketSignalNormalizationError(`${field} must have a valid timezone offset`);
    }
  }

  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.getTime())) throw new MarketSignalNormalizationError(`${field} must be a valid timestamp`);
  return timestamp.toISOString();
}

function normalizeSource(value: unknown, field: string): MarketSignalSource {
  if (typeof value !== "string" || !MARKET_SIGNAL_SOURCES.includes(value as MarketSignalSource)) {
    throw new MarketSignalNormalizationError(`${field} is not a supported market signal source`);
  }
  return value as MarketSignalSource;
}

function normalizeEngagement(value: unknown): MarketSignalEngagement {
  const input = requireRecord(value, "engagement");
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizeText(rawKey, "engagement key", 64).toLowerCase();
    if (!/^[a-z][a-z0-9_.-]*$/u.test(key)) throw new MarketSignalNormalizationError("engagement key is invalid");
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0 || rawValue > Number.MAX_SAFE_INTEGER) {
      throw new MarketSignalNormalizationError(`engagement.${key} must be a non-negative finite number`);
    }
    if (Object.hasOwn(normalized, key)) throw new MarketSignalNormalizationError(`engagement key ${key} is duplicated`);
    normalized[key] = rawValue;
  }
  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}

/**
 * Canonicalizes one transient signal before any LLM synthesis. The function is
 * pure: it does not perform I/O, create identities, read a clock, or mutate its input.
 */
export function normalizeMarketSignal(input: unknown): NormalizedMarketSignal {
  const signal = requireRecord(input, "MarketSignal");
  const source = normalizeSource(signal.source, "source");
  const sourceId = normalizeIdentifier(signal.sourceId, "sourceId");
  const url = normalizeUrl(signal.url, "url");
  if (sourceId === null && url === null) {
    throw new MarketSignalNormalizationError("MarketSignal requires sourceId or url for auditability");
  }
  const query = normalizeNullableText(signal.query, "query", MAX_TEXT_LENGTH);
  const capturedAt = normalizeCapturedAt(signal.capturedAt, "capturedAt");
  const provenance = requireRecord(signal.provenance, "provenance");

  const provenanceSource = normalizeSource(provenance.source, "provenance.source");
  const provenanceSourceId = normalizeIdentifier(provenance.sourceId, "provenance.sourceId");
  const provenanceUrl = normalizeUrl(provenance.url, "provenance.url");
  if (provenanceSourceId === null && provenanceUrl === null) {
    throw new MarketSignalNormalizationError("provenance requires sourceId or url for auditability");
  }
  const provenanceQuery = normalizeNullableText(provenance.query, "provenance.query", MAX_TEXT_LENGTH);
  const provenanceCapturedAt = normalizeCapturedAt(provenance.capturedAt, "provenance.capturedAt");
  const normalizationVersion = normalizeIdentifier(provenance.normalizationVersion, "provenance.normalizationVersion");
  if (normalizationVersion === null) throw new MarketSignalNormalizationError("provenance.normalizationVersion is required");
  if (provenanceSource !== source || provenanceSourceId !== sourceId || provenanceUrl !== url || provenanceQuery !== query || provenanceCapturedAt !== capturedAt) {
    throw new MarketSignalNormalizationError("provenance must match the signal source identity, query, and capture time");
  }

  return {
    source,
    sourceId,
    url,
    query,
    capturedAt,
    text: normalizeText(signal.text, "text", MAX_TEXT_LENGTH),
    engagement: normalizeEngagement(signal.engagement),
    context: normalizeNullableText(signal.context, "context", MAX_TEXT_LENGTH),
    pain: normalizeNullableText(signal.pain, "pain", MAX_TEXT_LENGTH),
    desiredOutcome: normalizeNullableText(signal.desiredOutcome, "desiredOutcome", MAX_TEXT_LENGTH),
    failedAttempt: normalizeNullableText(signal.failedAttempt, "failedAttempt", MAX_TEXT_LENGTH),
    currentSolution: normalizeNullableText(signal.currentSolution, "currentSolution", MAX_TEXT_LENGTH),
    solutionComplaint: normalizeNullableText(signal.solutionComplaint, "solutionComplaint", MAX_TEXT_LENGTH),
    urgency: normalizeNullableText(signal.urgency, "urgency", MAX_SHORT_TEXT_LENGTH),
    specificity: normalizeNullableText(signal.specificity, "specificity", MAX_SHORT_TEXT_LENGTH),
    commercialIntent: normalizeNullableText(signal.commercialIntent, "commercialIntent", MAX_SHORT_TEXT_LENGTH),
    provenance: {
      provider: normalizeIdentifier(provenance.provider, "provenance.provider") ?? (() => { throw new MarketSignalNormalizationError("provenance.provider is required"); })(),
      source,
      sourceId,
      url,
      query,
      capturedAt,
      normalizationVersion: MARKET_SIGNAL_NORMALIZATION_VERSION,
    },
  } as NormalizedMarketSignal;
}
