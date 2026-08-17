import type { ModuleKey } from "@our-platform/shared";

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

/** Stable, module-specific contracts. They validate the fields consumed by the app while
 * allowing additive prompt evolution. OpenAI still receives these as structured outputs. */
export const MODULE_OUTPUT_SCHEMAS: Readonly<Record<ModuleKey, JsonSchema>> = {
  research: object({ schemaVersion: { type: "integer" }, summary: string, subniches: nonEmptyStringArray, hypotheses: nonEmptyResearchItemArray, questions: nonEmptyStringArray, searchSuggestions: nonEmptyStringArray, insights: nonEmptyResearchItemArray }),
  sources: object({ schemaVersion: { type: "integer" }, summary: string, sourceCount: { type: "integer" }, commentCount: { type: "integer" }, isDemo: { type: "boolean" } }),
  problems: object({ schemaVersion: { type: "integer" }, items: { type: "array", items: object({ id: string, name: string, category: string, summary: string, evidenceIds }) } }),
  opportunities: object({ schemaVersion: { type: "integer" }, items: { type: "array", items: object({ id: string, name: string, problemId: string, evidenceIds }) }, selectedId: string }),
  product: object({ schemaVersion: { type: "integer" }, proposals: { type: "array", items: object({ id: string, name: string, concept: string, outcome: string, promise: string, deliverables: stringArray, evidenceIds }) }, selectedId: string }),
  avatar: object({ schemaVersion: { type: "integer" }, name: string, currentSituation: { type: "array", items: object({ text: string, provenance: string, evidenceIds }) }, desiredOutcome: { type: "array", items: object({ text: string, provenance: string, evidenceIds }) } }),
  mechanism: object({ schemaVersion: { type: "integer" }, perceivedProblem: string, mechanism: string, solutionMechanism: string, simpleExplanation: string, provenance: string, evidenceIds }),
  beliefs: object({ schemaVersion: { type: "integer" }, currentBeliefs: stringArray, limitingBeliefs: stringArray, requiredBeliefs: stringArray, objections: stringArray, arguments: stringArray, centralThesis: string }),
  offer: object({ schemaVersion: { type: "integer" }, name: string, promise: string, benefits: stringArray, deliverables: stringArray, cta: string, provenance: string, evidenceIds }),
  landing: object({ schemaVersion: { type: "integer" }, title: string, sections: { type: "array", items: object({ type: string }, ["type"]) }, evidenceIds }),
  funnel: object({ schemaVersion: { type: "integer" }, nodes: { type: "array", items: object({ id: string, type: string, label: string }) }, edges: { type: "array", items: object({ from: string, to: string, event: string }) }, paymentsEnabled: { type: "boolean" } }),
  emails: object({ schemaVersion: { type: "integer" }, sequences: { type: "array", items: object({ type: string, emails: { type: "array", items: object({ subject: string, body: string, cta: string }) } }) }, evidenceIds }),
  content: object({ schemaVersion: { type: "integer" }, calendar: { type: "array", items: object({ day: { type: "integer" }, type: string, hook: string, body: string }) }, hooks: stringArray, channels: stringArray, evidenceIds }),
  final_product: object({ schemaVersion: { type: "integer" }, files: { type: "array", items: string }, guide: object({ title: string, chapters: stringArray }), checklist: stringArray, workbook: stringArray, miniTool: object({ title: string, fields: stringArray }), evidenceIds }),
};

export function isCanonicalModuleOutput(key:ModuleKey,value:unknown):boolean{
  if(typeof value!=="object"||value===null||Array.isArray(value))return false;
  const output=value as Record<string,unknown>;
  if(typeof output.schemaVersion!=="number")return false;
  switch(key){
    case "research":return typeof output.summary==="string";
    case "sources":return typeof output.sourceCount==="number"&&typeof output.commentCount==="number";
    case "problems":case "opportunities":return Array.isArray(output.items);
    case "product":return Array.isArray(output.proposals);
    case "avatar":return Array.isArray(output.currentSituation)&&Array.isArray(output.desiredOutcome);
    case "mechanism":return typeof output.mechanism==="string"&&typeof output.solutionMechanism==="string";
    case "beliefs":return Array.isArray(output.currentBeliefs)&&Array.isArray(output.requiredBeliefs);
    case "offer":return typeof output.promise==="string"&&Array.isArray(output.deliverables);
    case "landing":return typeof output.title==="string"&&Array.isArray(output.sections);
    case "funnel":return Array.isArray(output.nodes)&&Array.isArray(output.edges);
    case "emails":return Array.isArray(output.sequences);
    case "content":return Array.isArray(output.calendar);
    case "final_product":return typeof output.guide==="object"&&Array.isArray(output.checklist)&&Array.isArray(output.workbook);
  }
}
