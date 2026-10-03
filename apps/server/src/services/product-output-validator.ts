import { ProductModuleOutputSchema } from "@our-platform/shared";

/**
 * Product completeness and commercial-claim grounding gate.
 *
 * Problem evidence may ground the market need and desired transformation, but
 * never authorizes claims about the efficacy, speed, guarantees, credentials,
 * or strong commercial obligations of Hallazia's proposed solution. Legitimate
 * design suggestions remain proposals; higher-risk claims require explicit
 * support in upstream opportunity, product configuration, or user instructions.
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

export type ProductClaimPolicyClass = "GROUNDED" | "PROPOSED" | "REQUIRES_EXPLICIT_AUTHORIZATION";

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

export interface ProposedProductDesignDecision {
  readonly proposalId: string;
  readonly field: UnsupportedProductClaim["field"];
  readonly path: string;
  readonly category: ProductClaimCategory;
  readonly claim: string;
  readonly classification: "PROPOSED";
}

export interface ProductValidationAudit {
  readonly schemaVersion: number;
  readonly missingFields: string[];
  readonly emptyFields: string[];
  readonly placeholderFields: string[];
  readonly invalidFormatFields: string[];
  unresolvedEvidenceIds: string[];
  readonly unsupportedClaims: UnsupportedProductClaim[];
  readonly proposedDesignDecisions: ProposedProductDesignDecision[];
  readonly claimPolicy: typeof PRODUCT_CLAIM_POLICY;
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
const ALL_PRODUCT_CAPABILITIES: readonly ProductClaimCategory[] = [
  "TIME_BOUND_RESULT", "GUARANTEE_OR_ASSURED_RESULT", "EFFICACY_OR_PROOF", "PERSONALIZED_SERVICE",
  "COACHING_OR_SESSIONS", "COMMUNITY_ACCESS", "CERTIFICATION", "LIFETIME_ACCESS",
  "QUANTIFIED_STRUCTURE", "BONUS_FEATURE", "TEMPLATES_OR_TOOLS", "LIVE_SESSIONS",
  "HUMAN_SUPPORT", "OPERATIONAL_FEATURE",
];
const PRODUCT_CAPABILITY_FIELD_POLICY = {
  concept: ALL_PRODUCT_CAPABILITIES,
  outcome: ALL_PRODUCT_CAPABILITIES,
  promise: ALL_PRODUCT_CAPABILITIES,
  format: ALL_PRODUCT_CAPABILITIES,
  deliverables: ALL_PRODUCT_CAPABILITIES,
  modules: ALL_PRODUCT_CAPABILITIES,
  checklists: ALL_PRODUCT_CAPABILITIES,
  templates: ALL_PRODUCT_CAPABILITIES,
  resources: ALL_PRODUCT_CAPABILITIES,
  bonuses: ALL_PRODUCT_CAPABILITIES,
} as const satisfies Readonly<Record<UnsupportedProductClaim["field"], readonly ProductClaimCategory[]>>;
const PROPOSED_ARRAY_CATEGORY_POLICY = {
  checklists: "TEMPLATES_OR_TOOLS",
  templates: "TEMPLATES_OR_TOOLS",
  resources: "TEMPLATES_OR_TOOLS",
  bonuses: "BONUS_FEATURE",
} as const satisfies Readonly<Partial<Record<(typeof FEATURE_ARRAY_FIELDS)[number], ProductClaimCategory>>>;
const PROPOSED_DESIGN_FIELDS: readonly UnsupportedProductClaim["field"][] = [
  "concept", "format", "deliverables", "modules", "checklists", "templates", "resources", "bonuses",
];
const PROPOSED_DESIGN_CATEGORIES: readonly ProductClaimCategory[] = [
  "TEMPLATES_OR_TOOLS", "BONUS_FEATURE",
];
export const PRODUCT_CLAIM_POLICY = {
  GROUNDED: { fields: ["problem", "outcome"], evidenceField: "evidenceIds" },
  PROPOSED: { fields: PROPOSED_DESIGN_FIELDS, categories: PROPOSED_DESIGN_CATEGORIES },
  REQUIRES_EXPLICIT_AUTHORIZATION: {
    categories: ALL_PRODUCT_CAPABILITIES.filter((category) => !PROPOSED_DESIGN_CATEGORIES.includes(category)),
    proposedCategoriesOutsideDesignFields: PROPOSED_DESIGN_CATEGORIES,
  },
} as const;
const PLACEHOLDER = /^(?:sin completar|incomplet[oa]|not completed|incomplete|pending|pendiente|por definir|to be defined|tbd|n a|none|null|undefined|-+)$/u;
const FORBIDDEN_PRODUCT_FORMAT = /\b(?:curso|cursos|course|courses|membresia|membresias|membership|memberships|comunidad|community|coaching|mentoria|mentoring|sesiones? en vivo|live sessions?|talleres? en vivo|live workshops?|masterclass|bootcamp)\b/u;

export function isForbiddenProductFormat(value: string): boolean {
  return FORBIDDEN_PRODUCT_FORMAT.test(normalize(value));
}

/**
 * Canonical capability detectors. Every protected category identifies concrete
 * content or an operating commitment; introductory verbs such as "incluye" or
 * "offers" have no capability meaning on their own.
 */
const CLAIM_PATTERNS: ReadonlyArray<{ category: ProductClaimCategory; pattern: RegExp }> = [
  { category: "TIME_BOUND_RESULT", pattern: /\b(?:en|dentro de|in|within)\s+(?:\d+|un|una|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:dias?|days?|semanas?|weeks?|meses?|months?|horas?|hours?)\b/u },
  { category: "GUARANTEE_OR_ASSURED_RESULT", pattern: /\b(?:garanti[az]|garantizad[oa]s?|guarantee(?:d)?|assured results?|resultados? asegurados?|risk free|sin riesgo)\b/u },
  { category: "EFFICACY_OR_PROOF", pattern: /\b(?:metodo|method|tecnicas?|techniques?|sistema|system)\s+(?:clinicamente |clinically |cientificamente |scientifically )?(?:probad[oa]s?|proven)|\b(?:basad[oa]s? en (?:la )?evidencia|evidence based|scientifically proven|cientificamente probad[oa]s?)\b/u },
  { category: "PERSONALIZED_SERVICE", pattern: /\b(?:(?:apoyo|soporte|acompanamiento|support|guidance)\s+(?:personalizad[oa]|individual|one to one|1 1)|(?:personalized|individual)\s+(?:support|guidance))\b/u },
  { category: "COACHING_OR_SESSIONS", pattern: /\b(?:coaching|mentoria|mentoring|consultas|consultations?|consulta\s+(?:profesional|individual|personalizada|privada|inicial)|(?:sesiones?|sessions?)\s+(?:individuales?|personalizadas?|one to one|1 1))\b/u },
  { category: "COMMUNITY_ACCESS", pattern: /\b(?:comunidad|community|grupo privado|private group)\b/u },
  { category: "CERTIFICATION", pattern: /\b(?:certificacion|certificado|certification|certificate|acreditad[oa]|accredited)\b/u },
  { category: "LIFETIME_ACCESS", pattern: /\b(?:acceso(?:\s+\w+){0,5}\s+(?:de por vida|de forma permanente|permanente|vitalicio)|(?:lifetime|permanent|forever)\s+access)\b/u },
  { category: "QUANTIFIED_STRUCTURE", pattern: /\b(?:\d+\s+(?:modulos?|modules?|bonuses|bonos?|sesiones?|sessions?|clases?|lessons?)|(?:modulos?|modules?|sesiones?|sessions?|clases?|lessons?)\s+\d+|(?:cursos?|programas?|courses?|programs?)\s+(?:de|of)\s+\d+\s+(?:dias?|days?|semanas?|weeks?|meses?|months?))\b/u },
  { category: "BONUS_FEATURE", pattern: /\b(?:bonus|bonuses|bonos?|bonos adicionales)\b/u },
  { category: "TEMPLATES_OR_TOOLS", pattern: /\b(?:plantillas?|templates?|herramientas?|tools?|workbooks?|cuadernos? de trabajo|checklists?|listas? de verificacion)\b/u },
  { category: "LIVE_SESSIONS", pattern: /\b(?:en vivo|live sessions?|live workshops?|taller(?:es)? en vivo)\b/u },
  { category: "HUMAN_SUPPORT", pattern: /\b(?:coaching|tutorias?|tutoring|asesoramiento|atencion personalizada|(?:apoyo|soporte|acompanamiento|support|guidance)\s+(?:human[oa]|personalizad[oa]|individual|por una? persona|de una? persona)|(?:human|personalized|individual)\s+(?:support|guidance))\b/u },
  { category: "OPERATIONAL_FEATURE", pattern: /\b(?:(?:seguimiento|monitoring|follow up|feedback|retroalimentacion|revisiones?|reviews?)\s+(?:semanal|weekly|mensual|monthly|continu[oa]|ongoing|periodic[oa]|periodic|personalizad[oa]|individual)|(?:semanal|weekly|mensual|monthly|continu[oa]|ongoing|periodic[oa]|periodic|personalizad[oa]|personalized|individual)\s+(?:seguimiento|monitoring|follow up|feedback|retroalimentacion|revisiones?|reviews?)|(?:actualizaciones?|updates?)\s+(?:continuas?|ongoing|periodic[oa]|periodic))\b/u },
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

/**
 * Build the provider-facing Product contract from the same canonical capability
 * policy enforced by the validator. Base Product fields always remain usable;
 * proposed design fields remain available, while strong capabilities are
 * described from the explicit authorization allowlist.
 */
export function buildProductStructuredOutputSchema(
  snapshot: Pick<ProductGroundingSnapshot, "authorizedCapabilities">,
): Readonly<Record<string, unknown>> {
  const authorized = new Set(snapshot.authorizedCapabilities);
  const schema = structuredClone(ProductModuleOutputSchema) as Record<string, unknown>;
  const schemaProperties = record(schema.properties);
  const proposalsSchema = record(schemaProperties.proposals);
  const proposalSchema = record(proposalsSchema.items);
  const proposalProperties = record(proposalSchema.properties);
  const explicitAuthorizationCategories = PRODUCT_CLAIM_POLICY.REQUIRES_EXPLICIT_AUTHORIZATION.categories;
  const explicitAuthorizedCapabilities = explicitAuthorizationCategories.filter((capability) => authorized.has(capability));
  const forbiddenExplicitCapabilities = explicitAuthorizationCategories.filter((capability) => !authorized.has(capability));

  proposalsSchema.description = "BASE PRODUCT STRUCTURE: one or more complete proposals. Market conclusions use evidenceIds; design fields are proposals, while strong commercial capabilities require explicit authorization.";
  for (const [field, applicableCapabilities] of Object.entries(PRODUCT_CAPABILITY_FIELD_POLICY)) {
    const fieldSchema = structuredClone(record(proposalProperties[field]));
    proposalProperties[field] = fieldSchema;
    const proposed = applicableCapabilities.filter((capability) => productClaimPolicyClass(field as UnsupportedProductClaim["field"], capability) === "PROPOSED");
    const explicitlyAuthorized = applicableCapabilities.filter((capability) =>
      productClaimPolicyClass(field as UnsupportedProductClaim["field"], capability) === "REQUIRES_EXPLICIT_AUTHORIZATION"
      && authorized.has(capability));
    const forbidden = applicableCapabilities.filter((capability) =>
      productClaimPolicyClass(field as UnsupportedProductClaim["field"], capability) === "REQUIRES_EXPLICIT_AUTHORIZATION"
      && !authorized.has(capability));
    fieldSchema.description = `PROPOSED PRODUCT DESIGN is allowed for: ${proposed.length > 0 ? proposed.join(", ") : "NONE"}. REQUIRES_EXPLICIT_AUTHORIZATION allowed here: ${explicitlyAuthorized.length > 0 ? explicitlyAuthorized.join(", ") : "NONE"}. OMIT every forbidden capability listed for this field in x-hallazia-product-capability-contract.`;
    fieldSchema["x-hallazia-capability-authorization"] = {
      mode: "FAIL_CLOSED",
      authorized: explicitlyAuthorized,
      forbidden,
      instruction: "OMIT every forbidden capability; never infer authorization from evidence, Knowledge, or proposed design.",
    };
  }
  schema["x-hallazia-product-capability-contract"] = {
    baseProductStructure: {
      fields: ["id", "name", "concept", "problem", "outcome", "promise", "format", "deliverables", "modules", "evidenceIds"],
      guidance: "A complete useful Product may use generic progressive organization without inventing optional capabilities or arbitrary quantities.",
    },
    claimPolicy: PRODUCT_CLAIM_POLICY,
    explicitAuthorization: {
      mode: "FAIL_CLOSED",
      authorizedCapabilities: explicitAuthorizedCapabilities,
      forbiddenCapabilities: forbiddenExplicitCapabilities,
      instruction: "OMIT every REQUIRES_EXPLICIT_AUTHORIZATION capability unless it is present in authorizedCapabilities.",
    },
    fields: Object.fromEntries(Object.entries(PRODUCT_CAPABILITY_FIELD_POLICY).map(([field, applicableCapabilities]) => [
      field,
      {
        proposedCapabilities: applicableCapabilities.filter((capability) => productClaimPolicyClass(field as UnsupportedProductClaim["field"], capability) === "PROPOSED"),
        explicitAuthorizedCapabilities: applicableCapabilities.filter((capability) =>
          productClaimPolicyClass(field as UnsupportedProductClaim["field"], capability) === "REQUIRES_EXPLICIT_AUTHORIZATION"
          && authorized.has(capability)),
        forbiddenExplicitCapabilities: applicableCapabilities.filter((capability) =>
          productClaimPolicyClass(field as UnsupportedProductClaim["field"], capability) === "REQUIRES_EXPLICIT_AUTHORIZATION"
          && !authorized.has(capability)),
      },
    ])),
    optionalArrays: Object.fromEntries(Object.entries(PROPOSED_ARRAY_CATEGORY_POLICY).map(([field, category]) => [
      field,
      { category, classification: "PROPOSED", allowed: true },
    ])),
  };
  return schema;
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
  return detectCapabilityCategories(authorizedText);
}

export function validateProductOutput(input: unknown, context: ProductValidationContext = {}): ProductValidationResult {
  const missingFields: string[] = [];
  const emptyFields: string[] = [];
  const placeholderFields: string[] = [];
  const invalidFormatFields: string[] = [];
  const unresolvedEvidenceIds = new Set<string>();
  const unsupportedClaims: UnsupportedProductClaim[] = [];
  const proposedDesignDecisions: ProposedProductDesignDecision[] = [];
  const issues: ProductGroundingIssue[] = [];
  const errors: string[] = [];
  const audit: ProductValidationAudit = {
    schemaVersion: PRODUCT_SCHEMA_VERSION,
    missingFields,
    emptyFields,
    placeholderFields,
    invalidFormatFields,
    unresolvedEvidenceIds: [],
    unsupportedClaims,
    proposedDesignDecisions,
    claimPolicy: PRODUCT_CLAIM_POLICY,
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
      if (field === "format") {
        if (isPlaceholder(value)) {
          placeholderFields.push(`${path}.${field}`);
        } else if (isForbiddenProductFormat(value)) {
          invalidFormatFields.push(`${path}.${field}`);
        }
      }
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
        for (const category of classifyProductClaim(field, claim)) {
          if (productClaimPolicyClass(field, category) === "PROPOSED") {
            proposedDesignDecisions.push({ proposalId, field, path: `${jsonPath}.${field}`, category, claim, classification: "PROPOSED" });
            continue;
          }
          if (!claimCategoryAuthorized(category, authorizedCapabilities)) {
            const claimPath = `${jsonPath}.${field}`;
            unsupportedClaims.push({ proposalId, field, path: claimPath, category, claim });
            issues.push({ code: field === "promise" ? "UNSUPPORTED_PROMISE" : "UNAUTHORIZED_CAPABILITY", path: claimPath, category });
          }
        }
      }
      for (const field of FEATURE_ARRAY_FIELDS) {
        const values = Array.isArray(cleaned[field]) ? cleaned[field] as string[] : [];
        const categories = new Set(values.flatMap((claim) => classifyProductClaim(field, claim)));
        const proposedCategory = PROPOSED_ARRAY_CATEGORY_POLICY[field as keyof typeof PROPOSED_ARRAY_CATEGORY_POLICY];
        if (proposedCategory !== undefined && values.length > 0) categories.add(proposedCategory);
        for (const category of categories) {
          const claim = values.join(" ");
          if (productClaimPolicyClass(field, category) === "PROPOSED") {
            proposedDesignDecisions.push({ proposalId, field, path: `${jsonPath}.${field}`, category, claim, classification: "PROPOSED" });
            continue;
          }
          if (!claimCategoryAuthorized(category, authorizedCapabilities)) {
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
  if (invalidFormatFields.length > 0) errors.push("Product format must be an Ebook or digital publication, not a course, membership, coaching or community");
  if (unresolvedEvidenceIds.size > 0) errors.push("Product references evidence outside the generation snapshot");
  if (unsupportedClaims.length > 0) errors.push("Product contains unsupported commercial or operational claims");
  for (const path of [...missingFields, ...emptyFields, ...placeholderFields, ...invalidFormatFields]) {
    issues.push({ code: "STRUCTURAL_INVALID", path: path.startsWith("$") ? path : `$.${path}` });
  }
  if (audit.invalidSelection) issues.push({ code: "STRUCTURAL_INVALID", path: "$.selectedId" });
  audit.unresolvedEvidenceIds = [...unresolvedEvidenceIds].sort();
  audit.complete = missingFields.length === 0 && emptyFields.length === 0 && placeholderFields.length === 0 && invalidFormatFields.length === 0 && !audit.invalidSelection;
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

function detectCapabilityCategories(value: string): ProductClaimCategory[] {
  const normalized = normalize(value);
  return CLAIM_PATTERNS
    .filter((item) => item.pattern.test(normalized))
    .map((item) => item.category);
}

/**
 * Classify a claim with the field semantics that can be determined safely.
 * Internal ordinal module labels are representation details, not marketed
 * quantities. All other protected capabilities are content-based and retain
 * the same fail-closed meaning in every field.
 */
function classifyProductClaim(
  field: UnsupportedProductClaim["field"],
  value: string,
): ProductClaimCategory[] {
  const claim = field === "modules"
    ? normalize(value).replace(/^(?:modulos?|modules?)\s+\d+\b/u, "").trim()
    : value;
  return detectCapabilityCategories(claim);
}

function productClaimPolicyClass(
  field: UnsupportedProductClaim["field"],
  category: ProductClaimCategory,
): ProductClaimPolicyClass {
  return PROPOSED_DESIGN_FIELDS.includes(field) && PROPOSED_DESIGN_CATEGORIES.includes(category)
    ? "PROPOSED"
    : "REQUIRES_EXPLICIT_AUTHORIZATION";
}

function claimCategoryAuthorized(
  category: ProductClaimCategory,
  authorizedCapabilities: ReadonlySet<ProductClaimCategory>,
): boolean {
  return authorizedCapabilities.has(category);
}
