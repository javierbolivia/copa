import type { AgentKnowledgePolicy, KnowledgeKind } from "./types.js";

const ALL_KINDS = [
  "project_evidence",
  "project_knowledge",
  "global_knowledge",
  "approved_memory",
] as const satisfies readonly KnowledgeKind[];

const BASE_WEIGHTS: Readonly<Record<KnowledgeKind, number>> = Object.freeze({
  project_evidence: 1,
  project_knowledge: 0.88,
  global_knowledge: 0.74,
  approved_memory: 0.8,
});

const BASE_PER_KIND: Readonly<Record<KnowledgeKind, number>> = Object.freeze({
  project_evidence: 4,
  project_knowledge: 3,
  global_knowledge: 2,
  approved_memory: 2,
});

function policy(
  agentType: string,
  overrides: Partial<Omit<AgentKnowledgePolicy, "agentType">> = {},
): AgentKnowledgePolicy {
  return Object.freeze({
    agentType,
    evidencePriority: "high",
    knowledgeInfluence: "medium",
    memoryInfluence: "restricted",
    advisoryOnly: false,
    allowedKinds: ALL_KINDS,
    kindWeights: BASE_WEIGHTS,
    maxChunks: 7,
    maxContextTokens: 1_800,
    maxPerKind: BASE_PER_KIND,
    ...overrides,
  });
}

const RESTRICTED_KNOWLEDGE_WEIGHTS = Object.freeze({
  project_evidence: 1,
  project_knowledge: 0.58,
  global_knowledge: 0.42,
  approved_memory: 0.45,
});

const HIGH_KNOWLEDGE_WEIGHTS = Object.freeze({
  project_evidence: 1,
  project_knowledge: 0.96,
  global_knowledge: 0.9,
  approved_memory: 0.86,
});

export const AGENT_KNOWLEDGE_POLICIES: Readonly<Record<string, AgentKnowledgePolicy>> =
  Object.freeze({
    research: policy("research", {
      evidencePriority: "very_high",
      knowledgeInfluence: "low",
      kindWeights: RESTRICTED_KNOWLEDGE_WEIGHTS,
    }),
    sources: policy("sources", {
      evidencePriority: "very_high",
      knowledgeInfluence: "low",
      kindWeights: RESTRICTED_KNOWLEDGE_WEIGHTS,
    }),
    problems: policy("problems", {
      evidencePriority: "high",
      knowledgeInfluence: "low",
      kindWeights: RESTRICTED_KNOWLEDGE_WEIGHTS,
    }),
    opportunities: policy("opportunities", {
      evidencePriority: "very_high",
      knowledgeInfluence: "low",
      advisoryOnly: true,
      kindWeights: RESTRICTED_KNOWLEDGE_WEIGHTS,
      maxPerKind: Object.freeze({ ...BASE_PER_KIND, global_knowledge: 1 }),
    }),
    product: policy("product", {
      knowledgeInfluence: "high",
      memoryInfluence: "medium",
      kindWeights: HIGH_KNOWLEDGE_WEIGHTS,
      maxChunks: 9,
      maxContextTokens: 2_300,
    }),
    avatar: policy("avatar", {
      knowledgeInfluence: "restricted",
      kindWeights: RESTRICTED_KNOWLEDGE_WEIGHTS,
      maxPerKind: Object.freeze({ ...BASE_PER_KIND, global_knowledge: 1 }),
    }),
    mechanism: policy("mechanism", {
      knowledgeInfluence: "high",
      kindWeights: HIGH_KNOWLEDGE_WEIGHTS,
      maxChunks: 8,
      maxContextTokens: 2_100,
    }),
    beliefs: policy("beliefs", { knowledgeInfluence: "medium" }),
    offer: policy("offer", {
      knowledgeInfluence: "high",
      memoryInfluence: "medium",
      kindWeights: HIGH_KNOWLEDGE_WEIGHTS,
      maxChunks: 9,
      maxContextTokens: 2_300,
    }),
    landing: policy("landing", {
      knowledgeInfluence: "high",
      memoryInfluence: "medium",
      kindWeights: HIGH_KNOWLEDGE_WEIGHTS,
      maxChunks: 9,
      maxContextTokens: 2_300,
    }),
    funnel: policy("funnel", { knowledgeInfluence: "high", kindWeights: HIGH_KNOWLEDGE_WEIGHTS }),
    emails: policy("emails", { knowledgeInfluence: "high", kindWeights: HIGH_KNOWLEDGE_WEIGHTS }),
    content: policy("content", { knowledgeInfluence: "high", kindWeights: HIGH_KNOWLEDGE_WEIGHTS }),
    final_product: policy("final_product", {
      knowledgeInfluence: "high",
      memoryInfluence: "high",
      kindWeights: HIGH_KNOWLEDGE_WEIGHTS,
      maxChunks: 10,
      maxContextTokens: 2_500,
    }),
  });

const ALIASES: Readonly<Record<string, string>> = Object.freeze({
  problem_analyzer: "problems",
  opportunity_scorer: "opportunities",
  product_builder: "product",
  avatar_builder: "avatar",
  offer_builder: "offer",
  landing_builder: "landing",
});

const DEFAULT_POLICY = policy("default");

export function getAgentKnowledgePolicy(agentType: string): AgentKnowledgePolicy {
  const normalized = agentType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const key = ALIASES[normalized] ?? normalized;
  return AGENT_KNOWLEDGE_POLICIES[key] ?? DEFAULT_POLICY;
}
