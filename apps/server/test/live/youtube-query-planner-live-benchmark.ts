import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MARKET_RESEARCH_BUDGETS, type LearnedMemory } from "@our-platform/shared";
import { config as loadDotEnv } from "dotenv";

import { loadConfig, WORKSPACE_ROOT } from "../../src/config.js";
import { AppDatabase } from "../../src/database/database.js";
import {
  YouTubeAdapter,
  type YouTubeSearchResult,
  type YouTubeVideo,
} from "../../src/integrations/youtube-adapter.js";
import { ProjectRepository } from "../../src/repositories/project-repository.js";
import {
  LearningMemoryService,
  type LearnedMemoryCandidate,
} from "../../src/services/knowledge/learning-memory-service.js";
import { InternalSkillResolver } from "../../src/services/skills/skill-resolver.js";
import { planMemoryAwareYouTubeQueries } from "../../src/services/youtube-query-planner.js";
import {
  assessYouTubeVideoRelevance,
  resolveYouTubeMinimumDurationSeconds,
  type YouTubeVideoRelevance,
} from "../../src/services/youtube-research-relevance.js";
import { deriveYouTubeResearchQueries } from "../../src/services/youtube-research-queries.js";

const ARM_QUERY_BUDGET = 6;
const SEARCH_RESULTS_PER_QUERY = MARKET_RESEARCH_BUDGETS.youtubeSearchResultsPerQuery;
const SEARCH_CALL_HARD_MAX = 36;
const MAX_REVIEW_VIDEOS_PER_CASE = 10;
const MINIMUM_DURATION_SECONDS = resolveYouTubeMinimumDurationSeconds(undefined);

type Arm = "CURRENT" | "MEMORY_AWARE";

interface BenchmarkCase {
  readonly id: string;
  readonly focus: string;
  readonly domain: string;
  readonly memoryFixture?: boolean;
}

interface Accounting {
  searchListCalls: number;
  videosListCalls: number;
  otherYouTubeCalls: number;
  externalProviderCalls: number;
  totalExternalCalls: number;
}

interface DiscoveryRecord {
  readonly search: YouTubeSearchResult;
  readonly queryOrigin: string;
  readonly queryIndex: number;
}

interface AssessedRecord extends DiscoveryRecord {
  readonly metadata: YouTubeVideo | undefined;
  readonly relevance: YouTubeVideoRelevance;
}

interface ArmResult {
  readonly arm: Arm;
  readonly queriesExecuted: readonly string[];
  readonly searchCalls: number;
  readonly rawCandidates: number;
  readonly uniqueCandidates: number;
  readonly relevantCandidates: number;
  readonly duplicateRate: number;
  readonly channelDiversity: number;
  readonly precision: number;
  readonly wastedQueries: number;
  readonly queryContribution: readonly {
    query: string;
    rawCandidates: number;
    uniqueCandidates: number;
    relevantUniqueCandidates: number;
  }[];
  readonly assessed: readonly AssessedRecord[];
}

const CASES: readonly BenchmarkCase[] = [
  {
    id: "sleep-anxiety-long-es",
    focus: "personas que tienen dificultades para dormir por estrés, ansiedad y pensamientos constantes durante la noche",
    domain: "salud del sueño",
  },
  {
    id: "freelance-late-invoices",
    focus: "autónomos que cobran tarde sus facturas y pierden tiempo persiguiendo pagos",
    domain: "finanzas freelance",
  },
  {
    id: "insomnia-with-benchmark-memory",
    focus: "insomnio",
    domain: "salud del sueño",
    memoryFixture: true,
  },
] as const;

function endpoint(url: URL): "search" | "videos" | "other" {
  if (!url.pathname.startsWith("/youtube/v3/")) return "other";
  const name = url.pathname.slice("/youtube/v3/".length);
  return name === "search" ? "search" : name === "videos" ? "videos" : "other";
}

function countingFetch(accounting: Accounting, nativeFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname !== "www.googleapis.com" || !url.pathname.startsWith("/youtube/v3/")) {
      accounting.externalProviderCalls += 1;
      throw new Error("QP-2 forbids non-YouTube external providers.");
    }
    const resource = endpoint(url);
    if (resource === "search") {
      if (accounting.searchListCalls >= SEARCH_CALL_HARD_MAX) throw new Error("QP-2 search.list hard maximum reached.");
      accounting.searchListCalls += 1;
    } else if (resource === "videos") {
      accounting.videosListCalls += 1;
      accounting.otherYouTubeCalls += 1;
    } else {
      accounting.otherYouTubeCalls += 1;
    }
    accounting.totalExternalCalls += 1;
    return nativeFetch(input, init);
  };
}

function seedBenchmarkMemory(): { readonly projectId: string; readonly memories: readonly LearnedMemory[]; readonly incompatibleIds: readonly string[] } {
  const database = new AppDatabase(":memory:");
  try {
    const projects = new ProjectRepository(database);
    const memory = new LearningMemoryService(database);
    const target = projects.create({ name: "QP-2 Memory Fixture", niche: "salud del sueño" });
    const garden = projects.create({ name: "QP-2 Incompatible Fixture", niche: "jardinería urbana" });
    const fixtures: readonly LearnedMemoryCandidate[] = [
      candidate({
        projectId: target.id,
        kind: "SEMANTIC_KNOWLEDGE",
        scope: "PROJECT",
        semanticIdentity: "insomnio mente acelerada",
        statement: "Insomnio también se expresa como mente acelerada al acostarse",
        value: { synonyms: ["mente acelerada"] },
        observationKey: "qp2-semantic",
      }),
      candidate({
        projectId: target.id,
        kind: "DOMAIN_KNOWLEDGE",
        scope: "DOMAIN",
        semanticIdentity: "insomnio rumiacion nocturna",
        statement: "Insomnio puede describirse como rumiación nocturna persistente",
        value: { queryTerms: ["rumiación nocturna"] },
        observationKey: "qp2-domain",
      }),
      candidate({
        projectId: target.id,
        kind: "RESEARCH_INTELLIGENCE",
        scope: "GLOBAL",
        semanticIdentity: "insomnio testimonios primera persona",
        statement: "Para insomnio, buscar testimonios en primera persona descubre lenguaje natural",
        value: { strategy: "testimonios en primera persona" },
        observationKey: "qp2-global",
        projectCount: 2,
      }),
      candidate({
        projectId: garden.id,
        kind: "DOMAIN_KNOWLEDGE",
        scope: "DOMAIN",
        domain: "jardinería urbana",
        semanticIdentity: "insomnio riego goteo",
        statement: "Insomnio de plantas se resuelve con riego por goteo",
        value: { queryTerms: ["riego por goteo"] },
        observationKey: "qp2-incompatible",
      }),
    ];
    const created = fixtures.map((fixture) => {
      const result = memory.reinforce(fixture);
      if (result.outcome === "REJECTED") throw new Error(`QP-2 memory fixture rejected: ${result.reason}`);
      return result.memory;
    });
    const resolved = new InternalSkillResolver(memory).resolve({
      skillId: "research-intelligence",
      version: 1,
      projectContext: { projectId: target.id, domain: "salud del sueño", query: "insomnio" },
    }).retrievedMemory;
    const incompatibleIds = created
      .filter((item) => item.scope === "DOMAIN" && item.domain === "jardineria urbana")
      .map((item) => item.id);
    return { projectId: target.id, memories: resolved.map((item) => ({ ...item })), incompatibleIds };
  } finally {
    database.close();
  }
}

function candidate(overrides: Partial<LearnedMemoryCandidate> & { projectId: string }): LearnedMemoryCandidate {
  return {
    kind: "DOMAIN_KNOWLEDGE",
    scope: "DOMAIN",
    domain: "salud del sueño",
    semanticIdentity: "qp2 benchmark memory",
    statement: "QP-2 benchmark memory",
    value: null,
    observationKey: "qp2-observation",
    disposition: "APPROVED",
    reusable: true,
    validated: true,
    strength: "ELIGIBLE",
    sourceClass: "VALIDATED_STRUCTURED",
    supportCount: 4,
    sourceCount: 2,
    authorCount: 4,
    confidence: 0.9,
    provenanceSummary: { summary: "QP-2 isolated benchmark fixture", sourceKinds: ["benchmark"] },
    ...overrides,
  };
}

async function discover(
  adapter: YouTubeAdapter,
  arm: Arm,
  queries: readonly string[],
): Promise<{ records: Map<string, DiscoveryRecord>; rawCandidates: number; contributions: Array<{ query: string; rawCandidates: number; uniqueCandidates: number }> }> {
  const records = new Map<string, DiscoveryRecord>();
  const contributions: Array<{ query: string; rawCandidates: number; uniqueCandidates: number }> = [];
  let rawCandidates = 0;
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex]!;
    const page = await adapter.searchVideos(query, undefined, SEARCH_RESULTS_PER_QUERY);
    rawCandidates += page.items.length;
    let uniqueCandidates = 0;
    for (const search of page.items) {
      if (records.has(search.videoId)) continue;
      records.set(search.videoId, { search, queryOrigin: query, queryIndex });
      uniqueCandidates += 1;
    }
    contributions.push({ query, rawCandidates: page.items.length, uniqueCandidates });
  }
  if (queries.length !== ARM_QUERY_BUDGET) throw new Error(`${arm} did not receive exactly ${ARM_QUERY_BUDGET} queries.`);
  return { records, rawCandidates, contributions };
}

async function metadataFor(adapter: YouTubeAdapter, videoIds: readonly string[]): Promise<Map<string, YouTubeVideo>> {
  const metadata = new Map<string, YouTubeVideo>();
  for (let index = 0; index < videoIds.length; index += 50) {
    for (const video of await adapter.getVideos(videoIds.slice(index, index + 50))) metadata.set(video.videoId, video);
  }
  return metadata;
}

function assessArm(
  arm: Arm,
  focus: string,
  discovery: Awaited<ReturnType<typeof discover>>,
  metadata: ReadonlyMap<string, YouTubeVideo>,
): ArmResult {
  const assessed = [...discovery.records.values()].map((record): AssessedRecord => {
    const video = metadata.get(record.search.videoId);
    const relevance = assessYouTubeVideoRelevance({
      topic: focus,
      query: record.queryOrigin,
      title: video?.title ?? record.search.title,
      description: video?.description ?? record.search.description,
      tags: video?.tags ?? [],
      channelTitle: video?.channelTitle ?? record.search.channelTitle,
      duration: video?.duration ?? null,
      metadataAvailable: video !== undefined,
      minimumDurationSeconds: MINIMUM_DURATION_SECONDS,
    });
    return { ...record, metadata: video, relevance };
  });
  const relevant = assessed.filter((record) => record.relevance.decision === "relevant");
  const queryContribution = discovery.contributions.map((contribution, queryIndex) => ({
    ...contribution,
    relevantUniqueCandidates: relevant.filter((record) => record.queryIndex === queryIndex).length,
  }));
  const unique = assessed.length;
  return {
    arm,
    queriesExecuted: discovery.contributions.map((item) => item.query),
    searchCalls: discovery.contributions.length,
    rawCandidates: discovery.rawCandidates,
    uniqueCandidates: unique,
    relevantCandidates: relevant.length,
    duplicateRate: discovery.rawCandidates === 0 ? 0 : round((discovery.rawCandidates - unique) / discovery.rawCandidates),
    channelDiversity: new Set(assessed.map((record) => record.metadata?.channelId ?? record.search.channelId)).size,
    precision: unique === 0 ? 0 : round(relevant.length / unique),
    wastedQueries: queryContribution.filter((item) => item.relevantUniqueCandidates === 0).length,
    queryContribution,
    assessed,
  };
}

function publicArm(result: ArmResult): Omit<ArmResult, "assessed"> {
  const { assessed: _assessed, ...publicResult } = result;
  return publicResult;
}

function ids(result: ArmResult, decision?: YouTubeVideoRelevance["decision"]): Set<string> {
  return new Set(result.assessed
    .filter((record) => decision === undefined || record.relevance.decision === decision)
    .map((record) => record.search.videoId));
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((item) => !right.has(item)).sort();
}

function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((item) => right.has(item)).sort();
}

function artifactRows(current: ArmResult, memoryAware: ArmResult) {
  return [current, memoryAware].flatMap((result) => result.assessed.map((record) => ({
    videoId: record.search.videoId,
    title: record.metadata?.title ?? record.search.title,
    channel: record.metadata?.channelTitle ?? record.search.channelTitle,
    queryOrigin: record.queryOrigin,
    arm: result.arm,
    relevanceOutcome: record.relevance.decision,
    relevanceReason: record.relevance.reason,
    matchedTerms: [...record.relevance.matchedTerms],
    durationSeconds: record.relevance.durationSeconds,
  })));
}

function reviewSet(current: ArmResult, memoryAware: ArmResult, currentExclusive: ReadonlySet<string>, memoryExclusive: ReadonlySet<string>) {
  const rows = artifactRows(current, memoryAware);
  const selected = new Map<string, (typeof rows)[number] & { reviewReason: string }>();
  for (const row of rows) {
    const exclusive = currentExclusive.has(row.videoId) || memoryExclusive.has(row.videoId);
    const borderline = row.relevanceOutcome === "borderline";
    if (!exclusive && !borderline) continue;
    const reviewReason = exclusive ? "EXCLUSIVE_DETERMINISTIC_RELEVANT" : "BORDERLINE_HUMAN_REVIEW_NEEDED";
    const existing = selected.get(row.videoId);
    if (existing === undefined || reviewReason.startsWith("EXCLUSIVE")) selected.set(row.videoId, { ...row, reviewReason });
  }
  return [...selected.values()].sort((left, right) => left.videoId.localeCompare(right.videoId)).slice(0, MAX_REVIEW_VIDEOS_PER_CASE);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function realEligibleMemoryCount(databasePath: string): number {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare(
      "SELECT count(*) count FROM learned_memories WHERE status IN ('ACTIVE','WEAKENED')",
    ).get() as { count: number };
    return row.count;
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  loadDotEnv({ path: resolve(WORKSPACE_ROOT, ".env"), quiet: true });
  const eligibleMemoryCount = realEligibleMemoryCount(loadConfig().databasePath);
  const accounting: Accounting = {
    searchListCalls: 0,
    videosListCalls: 0,
    otherYouTubeCalls: 0,
    externalProviderCalls: 0,
    totalExternalCalls: 0,
  };
  const startedAt = new Date().toISOString();
  const reportDirectory = resolve(WORKSPACE_ROOT, "data", "benchmarks");
  mkdirSync(reportDirectory, { recursive: true });
  const reportPath = resolve(reportDirectory, `qp2-youtube-live-${startedAt.replace(/[:.]/gu, "-")}.json`);
  const adapter = new YouTubeAdapter({
    ...(process.env.YOUTUBE_API_KEY?.trim() ? { apiKey: process.env.YOUTUBE_API_KEY } : {}),
    fetch: countingFetch(accounting, globalThis.fetch),
  });
  if (!adapter.configured) throw new Error("YouTube is not configured; no live calls were made.");

  const results: unknown[] = [];
  let status: "PASS" | "PARTIAL" = "PASS";
  let failure: string | null = null;
  try {
    for (const benchmarkCase of CASES) {
      const fixture = benchmarkCase.memoryFixture ? seedBenchmarkMemory() : null;
      const plan = planMemoryAwareYouTubeQueries({
        researchFocus: benchmarkCase.focus,
        ...(fixture === null ? {} : {
          projectContext: { projectId: fixture.projectId, domain: benchmarkCase.domain },
          relevantMemory: fixture.memories,
        }),
      });
      const currentQueries = deriveYouTubeResearchQueries(benchmarkCase.focus).slice(0, ARM_QUERY_BUDGET).map((item) => item.query);
      const memoryAwareQueries = plan.queries.slice(0, ARM_QUERY_BUDGET).map((item) => item.query);
      const currentDiscovery = await discover(adapter, "CURRENT", currentQueries);
      const memoryDiscovery = await discover(adapter, "MEMORY_AWARE", memoryAwareQueries);
      const unionIds = [...new Set([...currentDiscovery.records.keys(), ...memoryDiscovery.records.keys()])];
      const metadata = await metadataFor(adapter, unionIds);
      const current = assessArm("CURRENT", benchmarkCase.focus, currentDiscovery, metadata);
      const memoryAware = assessArm("MEMORY_AWARE", benchmarkCase.focus, memoryDiscovery, metadata);
      const currentUnique = ids(current);
      const memoryUnique = ids(memoryAware);
      const currentRelevant = ids(current, "relevant");
      const memoryRelevant = ids(memoryAware, "relevant");
      const currentExclusive = new Set(difference(currentRelevant, memoryRelevant));
      const memoryExclusive = new Set(difference(memoryRelevant, currentRelevant));
      const retrievedIds = new Set(fixture?.memories.map((item) => item.id) ?? []);
      results.push({
        id: benchmarkCase.id,
        focus: benchmarkCase.focus,
        domain: benchmarkCase.domain,
        current: publicArm(current),
        memoryAware: publicArm(memoryAware),
        overlap: {
          uniqueCandidates: intersection(currentUnique, memoryUnique).length,
          relevantCandidates: intersection(currentRelevant, memoryRelevant).length,
        },
        exclusiveRelevant: {
          current: [...currentExclusive],
          memoryAware: [...memoryExclusive],
        },
        memory: {
          source: fixture === null
            ? eligibleMemoryCount === 0 ? "REAL_DB_NONE_AVAILABLE" : "REAL_DB_NOT_SELECTED"
            : "ISOLATED_BENCHMARK_FIXTURE",
          retrieved: (fixture?.memories ?? []).map((item) => ({ id: item.id, kind: item.kind, scope: item.scope })),
          used: plan.memoryUsed,
          influencedExecutedQueries: plan.queries.slice(0, ARM_QUERY_BUDGET).filter((item) => item.memoryIds.length > 0).map((item) => item.query),
          incompatibleDomainLeakage: fixture?.incompatibleIds.some((id) => retrievedIds.has(id)) ?? false,
        },
        candidates: artifactRows(current, memoryAware),
        humanReviewSet: reviewSet(current, memoryAware, currentExclusive, memoryExclusive),
      });
    }
  } catch (error) {
    status = "PARTIAL";
    failure = error instanceof Error ? error.message.slice(0, 240) : "unknown_failure";
  }

  const completedAt = new Date().toISOString();
  const report = {
    benchmark: "HALLAZIA_QP_2_CONTROLLED_LIVE_YOUTUBE",
    status,
    startedAt,
    completedAt,
    failure,
    casesRequested: CASES.length,
    casesCompleted: results.length,
    configuration: {
      armQueryBudget: ARM_QUERY_BUDGET,
      searchResultsPerQuery: SEARCH_RESULTS_PER_QUERY,
      searchCallHardMax: SEARCH_CALL_HARD_MAX,
      minimumDurationSeconds: MINIMUM_DURATION_SECONDS,
      commentsFetched: false,
      languageFilter: null,
      regionFilter: null,
      executorChanged: false,
      realEligibleMemoryCountAtStart: eligibleMemoryCount,
    },
    accounting,
    cases: results,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info(JSON.stringify({ status, reportPath, casesCompleted: results.length, accounting }));
  if (status !== "PASS") process.exitCode = 2;
}

await main();
