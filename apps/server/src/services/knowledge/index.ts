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
export { INDEXABLE_ARTIFACT_TYPES, KnowledgeIndexBuilder, artifactChunks, knowledgeIndexFingerprint } from "./knowledge-index-builder.js";
export type { DerivedKnowledgeChunk, IndexableArtifactType, KnowledgeIndexAudit, KnowledgeIndexEntityType, KnowledgeIndexSyncResult, KnowledgeSemanticCandidate } from "./knowledge-index-builder.js";
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
export { isSemanticRetrievalEnabled } from "../semantic-retrieval/config.js";
export { SemanticEmbeddingStore, semanticTextFingerprint } from "../semantic-retrieval/semantic-embedding-store.js";
export type { EmbeddingSyncResult, SemanticEmbeddingInput, SemanticModelIdentity, StoredSemanticEmbedding } from "../semantic-retrieval/semantic-embedding-store.js";
export { hybridRank, lexicalFallback, rerankHybrid } from "../semantic-retrieval/hybrid-ranking.js";
export {
  LOCAL_EMBEDDING_MODEL,
  LOCAL_MODEL_LICENSE,
  LOCAL_RERANKER_MODEL,
  LocalTransformersEmbeddingProvider,
  LocalTransformersReranker,
  LocalSemanticRuntime,
  getLocalSemanticRuntime,
} from "../semantic-retrieval/local-transformers.js";
export type {
  RankedSemanticCandidate,
  SemanticCandidate,
  SemanticEmbeddingBatchResult,
  SemanticEmbeddingProvider,
  SemanticEmbeddingResult,
  SemanticRerankCandidate,
  SemanticRerankResult,
  SemanticReranker,
} from "../semantic-retrieval/types.js";
