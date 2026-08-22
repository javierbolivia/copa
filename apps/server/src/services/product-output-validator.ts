/**
 * Product completeness and commercial-claim grounding gate.
 *
 * Problem evidence may ground the market need and desired transformation, but
 * never authorizes claims about the efficacy, speed, guarantees, credentials,
 * or operating features of Hallazia's proposed solution. Those higher-risk
 * claims require explicit support in the selected upstream opportunity,
 * product configuration, or user instructions.
 */

export const PRODUCT_SCHEMA_VERSION = 2;

export type ProductClaimCategory =
  | "TIME_BOUND_RESULT"
  | "GUARANTEE_OR_ASSURED_RESULT"
  | "EFFICACY_OR_PROOF"
  | "PERSONALIZED_SERVICE"
  | "COACHING_OR_SESSIONS"
  | "COMMUNITY_ACCESS"
  | "CERTIFICATION"
  | "LIFETIME_ACCESS"
  | "QUANTIFIED_STRUCTURE"
  | "BONUS_FEATURE"
  | "OPERATIONAL_FEATURE";

export interface ProductValidationContext {
  readonly selectedUpstream?: unknown;
  readonly productConfiguration?: unknown;
  readonly explicitUserInput?: unknown;
  readonly problemEvidence?: unknown;
  readonly allowedEvidenceIds?: readonly string[];
  readonly userAuthored?: boolean;
}

export interface UnsupportedProductClaim {
  readonly proposalId: string;
  readonly field: "concept" | "outcome" | "promise";
  readonly category: ProductClaimCategory;
  readonly claim: string;
}

export interface ProductValidationAudit {
  readonly schemaVersion: number;
  readonly missingFields: string[];
  readonly emptyFields: string[];
  readonly placeholderFields: string[];
  unresolvedEvidenceIds: string[];
  readonly unsupportedClaims: UnsupportedProductClaim[];
  invalidSelection: boolean;
  readonly problemEvidenceAuthorizesCommercialClaims: false;
  complete: boolean;
  grounded: boolean;
  ok: boolean;
  readonly errors: string[];
}

export interface ProductValidationResult {
  readonly output: Record<string, unknown>;
  readonly audit: ProductValidationAudit;
}

const REQUIRED_TEXT_FIELDS = ["id", "name", "concept", "problem", "outcome", "promise", "format"] as const;
const REQUIRED_ARRAY_FIELDS = ["deliverables", "modules", "checklists", "templates", "resources", "bonuses", "evidenceIds"] as const;
const NON_EMPTY_ARRAY_FIELDS = new Set(["deliverables", "modules"]);
const CLAIM_FIELDS = ["concept", "outcome", "promise"] as const;
const PLACEHOLDER = /^(?:sin completar|incomplet[oa]|not completed|incomplete|pending|pendiente|por definir|to be defined|tbd|n a|none|null|undefined|-+)$/u;

const CLAIM_PATTERNS: ReadonlyArray<{ category: ProductClaimCategory; pattern: RegExp }> = [
  { category: "TIME_BOUND_RESULT", pattern: /\b(?:en|dentro de|in|within)\s+(?:\d+|un|una|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:dias?|days?|semanas?|weeks?|meses?|months?|horas?|hours?)\b/u },
  { category: "GUARANTEE_OR_ASSURED_RESULT", pattern: /\b(?:garanti[az]|garantizad[oa]s?|guarantee(?:d)?|assured results?|resultados? asegurados?|risk free|sin riesgo)\b/u },
  { category: "EFFICACY_OR_PROOF", pattern: /\b(?:metodo|method|tecnicas?|techniques?|sistema|system)\s+(?:clinicamente |clinically |cientificamente |scientifically )?(?:probad[oa]s?|proven)|\b(?:basad[oa]s? en (?:la )?evidencia|evidence based|scientifically proven|cientificamente probad[oa]s?)\b/u },
  { category: "PERSONALIZED_SERVICE", pattern: /\b(?:(?:apoyo|soporte|acompanamiento|support|guidance)\s+(?:personalizad[oa]|individual|one to one|1 1)|(?:personalized|individual)\s+(?:support|guidance))\b/u },
  { category: "COACHING_OR_SESSIONS", pattern: /\b(?:coaching|mentoria|mentoring|sesiones?|sessions?|consultas?|consultations?)\b/u },
  { category: "COMMUNITY_ACCESS", pattern: /\b(?:comunidad|community|grupo privado|private group)\b/u },
  { category: "CERTIFICATION", pattern: /\b(?:certificacion|certificado|certification|certificate|acreditad[oa]|accredited)\b/u },
  { category: "LIFETIME_ACCESS", pattern: /\b(?:acceso de por vida|lifetime access|forever access)\b/u },
  { category: "QUANTIFIED_STRUCTURE", pattern: /\b\d+\s+(?:modulos?|modules?|bonuses|bonos?|sesiones?|sessions?|clases?|lessons?)\b/u },
  { category: "BONUS_FEATURE", pattern: /\b(?:bonus|bonuses|bono adicional|bonos adicionales)\b/u },
  { category: "OPERATIONAL_FEATURE", pattern: /\b(?:incluye|incluyendo|recibe|recibiras|ofrece|includes?|including|you receive|comes with|featuring)\b/u },
] as const;

export function validateProductOutput(input: unknown, context: ProductValidationContext = {}): ProductValidationResult {
  const missingFields: string[] = [];
  const emptyFields: string[] = [];
  const placeholderFields: string[] = [];
  const unresolvedEvidenceIds = new Set<string>();
  const unsupportedClaims: UnsupportedProductClaim[] = [];
  const errors: string[] = [];
  const audit: ProductValidationAudit = {
    schemaVersion: PRODUCT_SCHEMA_VERSION,
    missingFields,
    emptyFields,
    placeholderFields,
    unresolvedEvidenceIds: [],
    unsupportedClaims,
    invalidSelection: false,
    problemEvidenceAuthorizesCommercialClaims: false,
    complete: false,
    grounded: false,
    ok: false,
    errors,
  };
  const source = record(input);
  const rawProposals = Array.isArray(source.proposals) ? source.proposals : [];
  if (!Array.isArray(source.proposals)) missingFields.push("proposals");
  if (rawProposals.length === 0) emptyFields.push("proposals");
  const allowedEvidence = context.allowedEvidenceIds === undefined ? null : new Set(context.allowedEvidenceIds);
  const authorizedClaims = normalizedText([
    selectedUpstream(source, context.selectedUpstream),
    context.productConfiguration,
    context.explicitUserInput,
  ]);

  const proposals = rawProposals.map((rawProposal, index) => {
    const path = `proposals[${index}]`;
    const proposal = record(rawProposal);
    const cleaned: Record<string, unknown> = { ...proposal };
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (typeof proposal[field] !== "string") {
        missingFields.push(`${path}.${field}`);
        cleaned[field] = "";
        continue;
      }
      const value = proposal[field].trim();
      cleaned[field] = value;
      if (value === "") emptyFields.push(`${path}.${field}`);
      if (field === "format" && isPlaceholder(value)) placeholderFields.push(`${path}.${field}`);
    }
    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (!Array.isArray(proposal[field])) {
        missingFields.push(`${path}.${field}`);
        cleaned[field] = [];
        continue;
      }
      const values = proposal[field]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
      cleaned[field] = values;
      if (NON_EMPTY_ARRAY_FIELDS.has(field) && values.length === 0) emptyFields.push(`${path}.${field}`);
      if (field === "evidenceIds" && allowedEvidence !== null) {
        const resolved = values.filter((id) => {
          if (allowedEvidence.has(id)) return true;
          unresolvedEvidenceIds.add(id);
          return false;
        });
        cleaned[field] = resolved;
      }
    }
    if (!context.userAuthored) {
      const proposalId = typeof cleaned.id === "string" ? cleaned.id : `proposal-${index + 1}`;
      for (const field of CLAIM_FIELDS) {
        const claim = typeof cleaned[field] === "string" ? cleaned[field] : "";
        for (const category of claimCategories(claim)) {
          if (!claimCategoryAuthorized(category, authorizedClaims, claim)) {
            unsupportedClaims.push({ proposalId, field, category, claim });
          }
        }
      }
    }
    return cleaned;
  });

  const selectedId = typeof source.selectedId === "string" ? source.selectedId.trim() : "";
  if (typeof source.selectedId !== "string") missingFields.push("selectedId");
  else if (selectedId === "") emptyFields.push("selectedId");
  audit.invalidSelection = selectedId !== "" && !proposals.some((proposal) => proposal.id === selectedId);
  if (audit.invalidSelection) errors.push("selectedId does not identify a proposal");
  if (missingFields.length > 0) errors.push("required Product fields are missing");
  if (emptyFields.length > 0) errors.push("required Product fields are empty");
  if (placeholderFields.length > 0) errors.push("Product format is a placeholder");
  if (unresolvedEvidenceIds.size > 0) errors.push("Product references evidence outside the generation snapshot");
  if (unsupportedClaims.length > 0) errors.push("Product contains unsupported commercial or operational claims");
  audit.unresolvedEvidenceIds = [...unresolvedEvidenceIds].sort();
  audit.complete = missingFields.length === 0 && emptyFields.length === 0 && placeholderFields.length === 0 && !audit.invalidSelection;
  audit.grounded = unresolvedEvidenceIds.size === 0 && unsupportedClaims.length === 0;
  audit.ok = audit.complete && audit.grounded;
  return {
    output: { ...source, schemaVersion: PRODUCT_SCHEMA_VERSION, proposals, selectedId, productValidationAudit: audit },
    audit,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function selectedUpstream(product: Record<string, unknown>, upstream: unknown): unknown {
  const value = record(upstream);
  const items = Array.isArray(value.items) ? value.items : [];
  const selectedId = typeof value.selectedId === "string" ? value.selectedId : "";
  return items.find((item) => record(item).id === selectedId) ?? items[0] ?? upstream ?? product.upstreamSelection ?? null;
}

function normalizedText(value: unknown): string {
  const strings: string[] = [];
  const visit = (item: unknown, depth: number): void => {
    if (depth > 6) return;
    if (typeof item === "string") strings.push(item);
    else if (Array.isArray(item)) item.slice(0, 100).forEach((child) => visit(child, depth + 1));
    else if (typeof item === "object" && item !== null) Object.values(item).slice(0, 100).forEach((child) => visit(child, depth + 1));
  };
  visit(value, 0);
  return normalize(strings.join(" "));
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(normalize(value));
}

function claimCategories(value: string): ProductClaimCategory[] {
  const normalized = normalize(value);
  return CLAIM_PATTERNS.filter((item) => item.pattern.test(normalized)).map((item) => item.category);
}

function claimCategoryAuthorized(category: ProductClaimCategory, authorizedText: string, claim: string): boolean {
  if (category === "OPERATIONAL_FEATURE") {
    const generic = new Set(["incluye", "incluyendo", "recibe", "recibiras", "ofrece", "include", "includes", "including", "receive", "comes", "with", "featuring"]);
    const claimTerms = new Set(normalize(claim).split(" ").filter((term) => term.length > 2 && !generic.has(term)));
    const authorizedTerms = new Set(authorizedText.split(" ").filter((term) => term.length > 2));
    return [...claimTerms].filter((term) => authorizedTerms.has(term)).length >= 2;
  }
  const pattern = CLAIM_PATTERNS.find((item) => item.category === category)!.pattern;
  if (!pattern.test(authorizedText)) return false;
  const withoutNegativeSpecifications = authorizedText.replace(
    /\b(?:no|not|sin|without|evitar|avoid|prohibido|forbidden)\b[^.!?;]{0,100}/gu,
    " ",
  );
  return pattern.test(withoutNegativeSpecifications);
}
