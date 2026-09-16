/** Semantic retrieval remains opt-in until a later production integration. */
export function isSemanticRetrievalEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.SEMANTIC_ENABLED === "true";
}
