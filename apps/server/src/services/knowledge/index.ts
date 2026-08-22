export { chunkExtractedDocument } from "./chunker.js";
export { extractKnowledgeDocument } from "./extract.js";
export { extractDocx } from "./docx-extractor.js";
export { extractHtml, htmlToBlockSeeds, stripHtmlToPlainText } from "./html-extractor.js";
export { normalizeInlineText, normalizeMultilineText } from "./normalization.js";
export { extractPdf } from "./pdf-extractor.js";
export { extractMarkdown, extractPlainText, markdownToBlockSeeds } from "./text-extractors.js";
export { AGENT_KNOWLEDGE_POLICIES, getAgentKnowledgePolicy } from "./agent-knowledge-policies.js";
export { buildKnowledgeContext, estimateContextTokens } from "./context-builder.js";
export { DisabledEmbeddingProvider } from "./embedding-provider.js";
export type { EmbeddingBatchResult, EmbeddingProvider } from "./embedding-provider.js";
export { KnowledgeRetriever } from "./knowledge-retriever.js";
export { LearningMemoryService } from "./learning-memory-service.js";
export type {
  LearnedMemoryCandidate,
  LearnedMemoryObservationAudit,
  LearnedMemoryScopePolicy,
  LearnedMemorySourceClass,
  MemoryReinforcementResult,
  RelevantKnowledgeRequest,
  RelevantLearnedMemory,
} from "./learning-memory-service.js";
export { knowledgeContentFingerprint, normalizeLexicalScores, rankLexicalHits } from "./lexical-ranking.js";
export { KNOWLEDGE_KINDS } from "./types.js";
export type {
  AgentKnowledgePolicy,
  ContextKnowledgeChunk,
  EvidencePriority,
  KnowledgeCitation,
  KnowledgeContextResult,
  KnowledgeInfluence,
  KnowledgeKind,
  KnowledgeRepositoryHit,
  KnowledgeRepositoryPort,
  KnowledgeRepositorySearchRequest,
  KnowledgeRepositorySearchResult,
  KnowledgeRetrievalRequest,
  KnowledgeRetrievalResult,
  RankedKnowledgeHit,
  ScoreDirection,
} from "./types.js";
export { KnowledgeExtractionError } from "./extraction-types.js";
export type {
  ExtractedBlock,
  ExtractedBlockKind,
  ExtractedDocument,
  ExtractedPage,
  ExtractionStatus,
  KnowledgeExtractionInput,
  KnowledgeExtractionLimits,
  KnowledgeMetadataValue,
  KnowledgeSourceKind,
  StructuralChunk,
  StructuralChunkOptions,
} from "./extraction-types.js";
