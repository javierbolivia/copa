import { AvatarModuleOutputSchema, ProductModuleOutputSchema, type ModuleKey } from "@our-platform/shared";

type JsonSchema = Readonly<Record<string, unknown>>;

const string = { type: "string" } as const;
const stringArray = { type: "array", items: string } as const;
const evidenceIds = stringArray;
const nonEmptyStringArray = { type: "array", items: string, minItems: 1 } as const;
const researchItem = { type: "object", properties: { text: string, provenance: string, evidenceIds }, required: ["text", "provenance", "evidenceIds"], additionalProperties: true } as const;
const nonEmptyResearchItemArray = { type: "array", items: researchItem, minItems: 1 } as const;

function object(properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema {
  return { type: "object", properties, required, additionalProperties: true };
}

/** 0-100 bounded score used by every Opportunity scoring criterion. Rejects
 * NaN, out-of-range values and non-numeric types via the shared JSON Schema
 * validator (minimum/maximum + numeric type checks). */
const opportunityScoreValue = { type: "number", minimum: 0, maximum: 100 } as const;
export const OPPORTUNITY_SCORE_CRITERIA = [
  "frequency", "urgency", "emotionalIntensity", "willingnessToPay", "solutionFeasibility",
  "competition", "differentiation", "commercialPotential", "evidenceConfidence",
] as const;

/** The 9 criteria the provider MUST supply per Opportunity (opportunity-scorer.md).
 * `total`/`scoreFormula` are intentionally NOT required here: the backend always
 * computes and injects them after receiving the provider output (see
 * applyOpportunityScoring in module-service.ts); the provider is never the
 * source of truth for the weighted total. */
const opportunityScores = object({
  frequency: opportunityScoreValue,
  urgency: opportunityScoreValue,
  emotionalIntensity: opportunityScoreValue,
  willingnessToPay: opportunityScoreValue,
  solutionFeasibility: opportunityScoreValue,
  competition: opportunityScoreValue,
  differentiation: opportunityScoreValue,
  commercialPotential: opportunityScoreValue,
  evidenceConfidence: opportunityScoreValue,
});
const opportunityRationales=object(Object.fromEntries(OPPORTUNITY_SCORE_CRITERIA.map(key=>[key,{type:"string",minLength:1}])));

/** Stable, module-specific contracts. They validate the fields consumed by the app while
 * allowing additive prompt evolution. OpenAI still receives these as structured outputs. */
export const MODULE_OUTPUT_SCHEMAS: Readonly<Record<ModuleKey, JsonSchema>> = {
  research: object({ schemaVersion: { type: "integer" }, summary: string, subniches: nonEmptyStringArray, hypotheses: nonEmptyResearchItemArray, questions: nonEmptyStringArray, searchSuggestions: nonEmptyStringArray, insights: nonEmptyResearchItemArray }),
  sources: object({ schemaVersion: { type: "integer" }, summary: string, sourceCount: { type: "integer" }, commentCount: { type: "integer" }, isDemo: { type: "boolean" } }),
  problems: object({ schemaVersion: { type: "integer" }, items: { type: "array", items: object({ id: string, name: string, category: string, summary: string, evidenceIds }) } }),
  opportunities: object({ schemaVersion: { type: "integer" }, items: { type: "array", items: object({ id: string, name: string, problemId: string, evidenceIds, scores: opportunityScores, rationale:string, scoreRationales:opportunityRationales, missingData:stringArray, validationPlan:stringArray },["id","name","problemId","evidenceIds","scores"]) }, selectedId: string }),
  product: ProductModuleOutputSchema,
  avatar: AvatarModuleOutputSchema,
  mechanism: object({
    schemaVersion: { type: "integer" },
    perceivedProblem: string,
    apparentCause: string,
    rootCauseHypothesis: string,
    mechanism: string,
    solutionMechanism: string,
    differentiation: string,
    simpleExplanation: string,
    detailedExplanation: string,
    steps: stringArray,
    alternatives: stringArray,
    limitations: stringArray,
    validationPlan: stringArray,
    provenance: string,
    evidenceIds,
  }, [
    "schemaVersion", "perceivedProblem", "apparentCause", "rootCauseHypothesis",
    "mechanism", "solutionMechanism", "differentiation", "simpleExplanation",
    "detailedExplanation", "provenance", "evidenceIds"
  ]),
  beliefs: object({
    schemaVersion: { type: "integer" },
    currentBeliefs: stringArray,
    limitingBeliefs: stringArray,
    bridgeBeliefs: stringArray,
    requiredBeliefs: stringArray,
    objections: stringArray,
    arguments: stringArray,
    centralThesis: string,
    evidenceIds,
  }, [
    "schemaVersion", "currentBeliefs", "limitingBeliefs", "requiredBeliefs",
    "objections", "arguments", "centralThesis"
  ]),
  offer: object({
    schemaVersion: { type: "integer" },
    name: string,
    promise: string,
    benefits: stringArray,
    deliverables: stringArray,
    bonuses: stringArray,
    bonusDetails: { type: "array", items: object({ name: string, description: string }) },
    pricingSuggestion: object({
      amount: { type: ["number", "null"] },
      currency: string,
      rationale: string,
      terms: string,
    }, ["amount"]),
    guaranteeSuggestion: string,
    orderBump: { type: ["object", "string", "null"], properties: { name: string, description: string } },
    upsell: { type: ["object", "string", "null"], properties: { name: string, description: string } },
    downsell: { type: ["object", "string", "null"], properties: { name: string, description: string } },
    cta: string,
    provenance: string,
    disclaimer: string,
    evidenceIds,
  }, [
    "schemaVersion", "name", "promise", "benefits", "deliverables", "bonuses",
    "cta", "provenance", "evidenceIds"
  ]),
  landing: object({ schemaVersion: { type: "integer" }, title: string, sections: { type: "array", items: object({ type: string, headline: string, body: string }, ["type", "headline", "body"]) }, evidenceIds }),
  funnel: object({ schemaVersion: { type: "integer" }, nodes: { type: "array", items: object({ id: string, type: string, label: string }) }, edges: { type: "array", items: object({ from: string, to: string, event: string }) }, paymentsEnabled: { type: "boolean" } }),
  emails: object({ schemaVersion: { type: "integer" }, sequences: { type: "array", items: object({ type: string, emails: { type: "array", items: object({ subject: string, body: string, cta: string }) } }) }, evidenceIds }),
  content: object({ schemaVersion: { type: "integer" }, calendar: { type: "array", items: object({ day: { type: "integer" }, type: string, channel: string, hook: string, body: string, cta: string }) }, hooks: stringArray, channels: stringArray, evidenceIds }),
  final_product: object({ schemaVersion: { type: "integer" }, files: { type: "array", items: string }, guide: object({ title: string, introduction: string, chapters: { type: "array", items: object({ title: string, content: string, evidenceIds }, ["title", "content"]) }, conclusion: string, references: { type: "array", items: object({ id: string, organization: string, title: string, url: string }) } }), checklist: stringArray, workbook: stringArray, miniTool: object({ title: string, fields: stringArray }), evidenceIds }),
};

export function isCanonicalModuleOutput(key:ModuleKey,value:unknown):boolean{
  if(typeof value!=="object"||value===null||Array.isArray(value))return false;
  const output=value as Record<string,unknown>;
  if (typeof output.schemaVersion === "string" && /^\d+$/.test((output.schemaVersion as string).trim())) {
    output.schemaVersion = Number.parseInt((output.schemaVersion as string).trim(), 10);
  } else if (output.schemaVersion === undefined) {
    output.schemaVersion = (key === "avatar" || key === "product") ? 2 : 1;
  }
  if(typeof output.schemaVersion!=="number"||!Number.isInteger(output.schemaVersion))return false;
  switch(key){
    case "research":return typeof output.summary==="string";
    case "sources":return typeof output.sourceCount==="number"&&typeof output.commentCount==="number";
    case "problems":return Array.isArray(output.items);
    case "opportunities":return typeof output.selectedId==="string"&&Array.isArray(output.items)&&output.items.every((item)=>isCanonicalOpportunityItem(item));
    case "product":return isCanonicalProductOutput(output);
    case "avatar":return Array.isArray(output.currentSituation)&&Array.isArray(output.desiredOutcome);
    case "mechanism":return typeof output.mechanism==="string"&&typeof output.solutionMechanism==="string";
    case "beliefs":return Array.isArray(output.currentBeliefs)&&Array.isArray(output.requiredBeliefs);
    case "offer":return typeof output.promise==="string"&&Array.isArray(output.deliverables);
    case "landing":return typeof output.title==="string"&&Array.isArray(output.sections);
    case "funnel":return Array.isArray(output.nodes)&&Array.isArray(output.edges);
    case "emails":return Array.isArray(output.sequences);
    case "content":return Array.isArray(output.calendar)&&output.calendar.every((item)=>{
      if(typeof item!=="object"||item===null||Array.isArray(item))return false;
      const piece=item as Record<string,unknown>;
      return Number.isInteger(piece.day)&&typeof piece.type==="string"&&piece.type.trim().length>0&&typeof piece.channel==="string"&&piece.channel.trim().length>0&&typeof piece.hook==="string"&&piece.hook.trim().length>0&&typeof piece.body==="string"&&piece.body.trim().length>0&&typeof piece.cta==="string"&&piece.cta.trim().length>0;
    });
    case "final_product":{
      const guide=typeof output.guide==="object"&&output.guide!==null&&!Array.isArray(output.guide)?output.guide as Record<string,unknown>:undefined;
      return !!guide&&typeof guide.title==="string"&&Array.isArray(guide.chapters)
        // Accept historical title-only drafts for repair, but new provider output uses
        // structured chapter content (enforced by the provider JSON Schema above).
        &&guide.chapters.every((chapter)=>typeof chapter==="string"||(typeof chapter==="object"&&chapter!==null&&!Array.isArray(chapter)&&typeof (chapter as Record<string,unknown>).title==="string"&&typeof (chapter as Record<string,unknown>).content==="string"))
        &&(guide.references===undefined||(Array.isArray(guide.references)&&guide.references.every((reference)=>typeof reference==="object"&&reference!==null&&!Array.isArray(reference)&&typeof (reference as Record<string,unknown>).id==="string"&&typeof (reference as Record<string,unknown>).title==="string"&&typeof (reference as Record<string,unknown>).organization==="string"&&typeof (reference as Record<string,unknown>).url==="string")))
        &&Array.isArray(output.checklist)&&Array.isArray(output.workbook);
    }
  }
}

/** The 9 canonical Opportunity scoring criteria (prompts/opportunity-scorer.md).
 * Exported so module-service.ts can validate/read the exact same set without
 * duplicating the list. */
function isValidOpportunityScore(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Runtime guard mirroring the `opportunities` JSON Schema: every item must
 * carry the 9 bounded numeric scores. `total`/`scoreFormula` are backend-only
 * and deliberately not checked here (the provider is never their source). */
function isCanonicalOpportunityItem(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.problemId !== "string") return false;
  if (!Array.isArray(item.evidenceIds)||!item.evidenceIds.every((id)=>typeof id==="string")) return false;
  const scores = item.scores;
  if (typeof scores !== "object" || scores === null || Array.isArray(scores)) return false;
  const scoreRecord = scores as Record<string, unknown>;
  if(item.rationale!==undefined&&typeof item.rationale!=="string")return false;
  for(const key of ["missingData","validationPlan"]){
    if(item[key]!==undefined&&(!Array.isArray(item[key])||!item[key].every((value:unknown)=>typeof value==="string")))return false;
  }
  if(item.scoreRationales!==undefined){
    if(typeof item.scoreRationales!=="object"||item.scoreRationales===null||Array.isArray(item.scoreRationales))return false;
    const reasons=item.scoreRationales as Record<string,unknown>;
    if(!OPPORTUNITY_SCORE_CRITERIA.every(key=>typeof reasons[key]==="string"&&reasons[key].trim().length>0))return false;
  }
  return OPPORTUNITY_SCORE_CRITERIA.every((criterion) => isValidOpportunityScore(scoreRecord[criterion]));
}

const PRODUCT_REQUIRED_TEXT = ["id", "name", "concept", "problem", "outcome", "promise", "format"] as const;
const PRODUCT_REQUIRED_ARRAYS = ["deliverables", "modules", "checklists", "templates", "resources", "bonuses", "evidenceIds"] as const;

function isCanonicalProductOutput(output: Record<string, unknown>): boolean {
  if (!Array.isArray(output.proposals) || output.proposals.length === 0 || typeof output.selectedId !== "string") return false;
  return output.proposals.every((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const proposal = value as Record<string, unknown>;
    return PRODUCT_REQUIRED_TEXT.every((key) => typeof proposal[key] === "string")
      && PRODUCT_REQUIRED_ARRAYS.every((key) => Array.isArray(proposal[key]));
  });
}
