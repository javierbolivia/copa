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
  | "TEMPLATES_OR_TOOLS"
  | "LIVE_SESSIONS"
  | "HUMAN_SUPPORT"
  | "OPERATIONAL_FEATURE";

export type ProductGroundingIssueCode =
  | "EVIDENCE_OUTSIDE_SNAPSHOT"
  | "UNAUTHORIZED_CAPABILITY"
  | "UNSUPPORTED_PROMISE"
  | "STRUCTURAL_INVALID";

export interface ProductGroundingIssue {
  readonly code: ProductGroundingIssueCode;
  readonly path: string;
  readonly category?: ProductClaimCategory;
}

export interface ProductAllowedEvidence {
  readonly id: string;
  readonly quote: string;
}

export interface ProductGroundingSnapshot {
  readonly allowedEvidence: readonly ProductAllowedEvidence[];
  readonly selectedOpportunity: unknown;
  readonly productConfiguration: unknown;
  readonly explicitUserInput: string | null;
  readonly authorizedCapabilities: readonly ProductClaimCategory[];
}

export interface ProductValidationContext {
  readonly groundingSnapshot?: ProductGroundingSnapshot;
  readonly selectedUpstream?: unknown;
  readonly productConfiguration?: unknown;
  readonly explicitUserInput?: unknown;
  readonly problemEvidence?: unknown;
  readonly allowedEvidenceIds?: readonly string[];
  readonly userAuthored?: boolean;
}

export interface UnsupportedProductClaim {
  readonly proposalId: string;
  readonly field: "concept" | "outcome" | "promise" | "format" | "deliverables" | "modules" | "checklists" | "templates" | "resources" | "bonuses";
  readonly path: string;
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
  readonly issues: ProductGroundingIssue[];
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
const CLAIM_FIELDS = ["concept", "outcome", "promise", "format"] as const;
const FEATURE_ARRAY_FIELDS = ["deliverables", "modules", "checklists", "templates", "resources", "bonuses"] as const;
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
  { category: "QUANTIFIED_STRUCTURE", pattern: /\b(?:\d+\s+(?:modulos?|modules?|bonuses|bonos?|sesiones?|sessions?|clases?|lessons?)|(?:modulos?|modules?|sesiones?|sessions?|clases?|lessons?)\s+\d+)\b/u },
  { category: "BONUS_FEATURE", pattern: /\b(?:bonus|bonuses|bonos?|bonos adicionales)\b/u },
  { category: "TEMPLATES_OR_TOOLS", pattern: /\b(?:plantillas?|templates?|herramientas?|tools?|workbooks?|cuadernos? de trabajo|checklists?|listas? de verificacion)\b/u },
  { category: "LIVE_SESSIONS", pattern: /\b(?:en vivo|live sessions?|live workshops?|taller(?:es)? en vivo)\b/u },
  { category: "HUMAN_SUPPORT", pattern: /\b(?:apoyo|soporte|acompanamiento|support|guidance)\b/u },
  { category: "OPERATIONAL_FEATURE", pattern: /\b(?:incluye|incluyendo|recibe|recibiras|ofrece|includes?|including|you receive|comes with|featuring)\b/u },
] as const;

const AUTHORIZED_OPPORTUNITY_FIELDS = ["name", "solution", "proposedSolution", "format", "capabilities", "features", "deliverables"] as const;

/** Build the single bounded Product evidence/capability snapshot used by prompt and validator. */
export function buildProductGroundingSnapshot(input: {
  readonly evidence: readonly { readonly id: string; readonly quoteText: string }[];
  readonly opportunities: unknown;
  readonly productConfiguration?: unknown;
  readonly explicitUserInput?: string | null;
}): ProductGroundingSnapshot {
  const evidenceById = new Map(input.evidence
    .filter((item) => item.id.trim() !== "")
    .map((item) => [item.id, item.quoteText]));
  const allowedIds = new Set(evidenceById.keys());
  const allowedEvidence = [...evidenceById].map(([id, quote]) => ({
    id,
    quote: sanitizeEvidenceReferences(quote, allowedIds) as string,
  }));
  const selectedOpportunity = sanitizeEvidenceReferences(selectOpportunity(input.opportunities), allowedIds);
  const productConfiguration = sanitizeEvidenceReferences(input.productConfiguration ?? null, allowedIds);
  const explicitUserInput = sanitizeEvidenceReferences(input.explicitUserInput?.trim() || null, allowedIds) as string | null;
  return {
    allowedEvidence,
    selectedOpportunity,
    productConfiguration,
    explicitUserInput,
    authorizedCapabilities: deriveAuthorizedProductCapabilities(
      selectedOpportunity,
      productConfiguration,
      explicitUserInput,
    ),
  };
}

export function deriveAuthorizedProductCapabilities(
  selectedOpportunity: unknown,
  productConfiguration?: unknown,
  explicitUserInput?: unknown,
): ProductClaimCategory[] {
  const opportunity = record(selectedOpportunity);
  const opportunityAuthorization = Object.fromEntries(
    AUTHORIZED_OPPORTUNITY_FIELDS.filter((key) => key in opportunity).map((key) => [key, opportunity[key]]),
  );
  const authorizedText = positiveAuthorizationText([opportunityAuthorization, productConfiguration, explicitUserInput]);
  return claimCategories(authorizedText);
}

export function validateProductOutput(input: unknown, context: ProductValidationContext = {}): ProductValidationResult {
  const missingFields: string[] = [];
  const emptyFields: string[] = [];
  const placeholderFields: string[] = [];
  const unresolvedEvidenceIds = new Set<string>();
  const unsupportedClaims: UnsupportedProductClaim[] = [];
  const issues: ProductGroundingIssue[] = [];
  const errors: string[] = [];
  const audit: ProductValidationAudit = {
    schemaVersion: PRODUCT_SCHEMA_VERSION,
    missingFields,
    emptyFields,
    placeholderFields,
    unresolvedEvidenceIds: [],
    unsupportedClaims,
    issues,
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
  const snapshot = context.groundingSnapshot;
  const selectedOpportunity = snapshot?.selectedOpportunity ?? selectOpportunity(context.selectedUpstream ?? source.upstreamSelection);
  const productConfiguration = snapshot?.productConfiguration ?? context.productConfiguration;
  const explicitUserInput = snapshot?.explicitUserInput ?? context.explicitUserInput;
  const allowedEvidence = snapshot
    ? new Set(snapshot.allowedEvidence.map((item) => item.id))
    : context.allowedEvidenceIds === undefined ? null : new Set(context.allowedEvidenceIds);
  const authorizedCapabilities = new Set(snapshot?.authorizedCapabilities
    ?? deriveAuthorizedProductCapabilities(selectedOpportunity, productConfiguration, explicitUserInput));
  const authorizedClaims = positiveAuthorizationText([
    Object.fromEntries(AUTHORIZED_OPPORTUNITY_FIELDS.map((key) => [key, record(selectedOpportunity)[key]])),
    productConfiguration,
    explicitUserInput,
  ]);

  const proposals = rawProposals.map((rawProposal, index) => {
    const path = `proposals[${index}]`;
    const jsonPath = `$.${path}`;
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
        const resolved = values.filter((id, evidenceIndex) => {
          if (allowedEvidence.has(id)) return true;
          unresolvedEvidenceIds.add(id);
          issues.push({ code: "EVIDENCE_OUTSIDE_SNAPSHOT", path: `${jsonPath}.evidenceIds[${evidenceIndex}]` });
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
          if (!claimCategoryAuthorized(category, authorizedCapabilities, authorizedClaims, claim)) {
            const claimPath = `${jsonPath}.${field}`;
            unsupportedClaims.push({ proposalId, field, path: claimPath, category, claim });
            issues.push({ code: field === "promise" ? "UNSUPPORTED_PROMISE" : "UNAUTHORIZED_CAPABILITY", path: claimPath, category });
          }
        }
      }
      for (const field of FEATURE_ARRAY_FIELDS) {
        const values = Array.isArray(cleaned[field]) ? cleaned[field] as string[] : [];
        const categories = new Set(values.flatMap((claim) => claimCategories(claim)));
        if (field === "bonuses" && values.length > 0) categories.add("BONUS_FEATURE");
        if ((field === "checklists" || field === "templates" || field === "resources") && values.length > 0) categories.add("TEMPLATES_OR_TOOLS");
        for (const category of categories) {
          const claim = values.join(" ");
          if (!claimCategoryAuthorized(category, authorizedCapabilities, authorizedClaims, claim)) {
            const claimPath = `${jsonPath}.${field}`;
            unsupportedClaims.push({ proposalId, field, path: claimPath, category, claim });
            issues.push({ code: "UNAUTHORIZED_CAPABILITY", path: claimPath, category });
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
  for (const path of [...missingFields, ...emptyFields, ...placeholderFields]) {
    issues.push({ code: "STRUCTURAL_INVALID", path: path.startsWith("$") ? path : `$.${path}` });
  }
  if (audit.invalidSelection) issues.push({ code: "STRUCTURAL_INVALID", path: "$.selectedId" });
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

function selectOpportunity(upstream: unknown): unknown {
  const value = record(upstream);
  const items = Array.isArray(value.items) ? value.items : [];
  const selectedId = typeof value.selectedId === "string" ? value.selectedId : "";
  return items.find((item) => record(item).id === selectedId) ?? items[0] ?? upstream ?? null;
}

function sanitizeEvidenceReferences(value: unknown, allowedIds: ReadonlySet<string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, (id) =>
      allowedIds.has(id) ? id : "[id omitted]");
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeEvidenceReferences(item, allowedIds));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "evidenceIds" && Array.isArray(item)
      ? item.filter((id): id is string => typeof id === "string" && allowedIds.has(id))
      : sanitizeEvidenceReferences(item, allowedIds),
  ]));
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

function positiveAuthorizationText(value: unknown): string {
  return normalizedText(value).replace(
    /\b(?:no|not|sin|without|evitar|avoid|prohibido|forbidden)\b[^.!?;]{0,100}/gu,
    " ",
  );
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(normalize(value));
}

function claimCategories(value: string): ProductClaimCategory[] {
  const normalized = normalize(value);
  const categories = CLAIM_PATTERNS.filter((item) => item.pattern.test(normalized)).map((item) => item.category);
  return categories.length > 1 ? categories.filter((category) => category !== "OPERATIONAL_FEATURE") : categories;
}

function claimCategoryAuthorized(
  category: ProductClaimCategory,
  authorizedCapabilities: ReadonlySet<ProductClaimCategory>,
  authorizedText: string,
  claim: string,
): boolean {
  if (!authorizedCapabilities.has(category)) return false;
  if (category === "OPERATIONAL_FEATURE") {
    const generic = new Set(["incluye", "incluyendo", "recibe", "recibiras", "ofrece", "include", "includes", "including", "receive", "comes", "with", "featuring"]);
    const claimTerms = new Set(normalize(claim).split(" ").filter((term) => term.length > 2 && !generic.has(term)));
    const authorizedTerms = new Set(authorizedText.split(" ").filter((term) => term.length > 2));
    return [...claimTerms].filter((term) => authorizedTerms.has(term)).length >= 2;
  }
  return true;
}
