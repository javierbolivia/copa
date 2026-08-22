import type { InternalSkillDefinition } from "@our-platform/shared";

export const RESEARCH_INTELLIGENCE_SKILL = Object.freeze({
  id: "research-intelligence",
  version: 1,
  kind: "MARKET_RESEARCH_POLICY",
  scope: "PROJECT",
  description: "Resolve bounded prior knowledge and evidence policy for auditable market research without choosing or coupling to a provider.",
  inputContract: {
    schemaVersion: 1,
    requiredContext: ["projectId", "domain", "query"],
  },
  memoryPolicy: {
    requiredKinds: [],
    optionalKinds: ["DOMAIN_KNOWLEDGE", "SEMANTIC_KNOWLEDGE", "RESEARCH_INTELLIGENCE"],
    scopePolicy: "PROJECT_DOMAIN_GLOBAL",
    retrievalLimit: 8,
  },
  executionPolicy: {
    mode: "DETERMINISTIC",
    steps: [
      "Retrieve bounded prior memory relevant to the current domain and research intent.",
      "Preserve original evidence and provenance without destructive filtering.",
      "Apply local budgets before any optional tool or reasoning executor.",
      "Return auditable context and explicitly eligible learnable outcomes.",
    ],
  },
  budgetPolicy: {
    maxMemoryItems: 8,
    maxEvidenceItems: 60,
    maxContextTokens: 2400,
    externalCalls: 0,
  },
  evidencePolicy: {
    preserveOriginalEvidence: true,
    provenanceRequired: true,
    destructiveFiltering: "FORBIDDEN",
  },
  outputContract: {
    schemaVersion: 1,
    type: "RESEARCH_INTELLIGENCE_CONTEXT",
  },
  acceptancePolicy: {
    auditable: true,
    rejectedMemoryAllowed: false,
    externalCallsAllowed: false,
  },
  status: "ACTIVE",
} as const satisfies InternalSkillDefinition);
