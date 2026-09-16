export interface ProviderEvidenceTransformation {
  readonly evidenceId: string;
  readonly field: "quoteText";
  readonly kind: "SENSITIVE_SPAN_REDACTED";
  readonly originalLength: number;
  readonly projectedLength: number;
}

export interface ProviderEvidenceAudit {
  readonly schemaVersion: 1;
  readonly transformedSnippetCount: number;
  readonly transformations: readonly ProviderEvidenceTransformation[];
}

export interface ProviderEvidenceProjection<T> {
  readonly evidence: T[];
  readonly audit: ProviderEvidenceAudit;
}

const PROVIDER_REDACTION = "[contenido sensible omitido para compatibilidad del proveedor]";

// This is deliberately a narrow redaction list. It projects sensitive spans for
// an external provider without changing the original local evidence or claiming
// that the projection is a verbatim quote.
const SENSITIVE_SPANS: readonly RegExp[] = [
  /hij[oa]\s+de\s+puta/giu,
  /cortad[oa]s?\s+las?\s+(?:dos\s+)?manos?/giu,
];

function redactSensitiveSpans(text: string): string {
  return SENSITIVE_SPANS.reduce((current, pattern) => current.replace(pattern, PROVIDER_REDACTION), text);
}

export function projectEvidenceForProvider<T extends { id: string; quoteText: string }>(items: readonly T[]): ProviderEvidenceProjection<T> {
  const transformations: ProviderEvidenceTransformation[] = [];
  const evidence = items.map((item) => {
    const projectedQuote = redactSensitiveSpans(item.quoteText);
    if (projectedQuote === item.quoteText) return item;
    transformations.push({
      evidenceId: item.id,
      field: "quoteText",
      kind: "SENSITIVE_SPAN_REDACTED",
      originalLength: item.quoteText.length,
      projectedLength: projectedQuote.length,
    });
    return { ...item, quoteText: projectedQuote };
  });
  return {
    evidence,
    audit: { schemaVersion: 1, transformedSnippetCount: transformations.length, transformations },
  };
}
