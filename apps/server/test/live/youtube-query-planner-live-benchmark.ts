import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MARKET_RESEARCH_BUDGETS, type YouTubeQueryPlan } from "@our-platform/shared";
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

interface PreparedBenchmarkCase {
  readonly benchmarkCase: BenchmarkCase;
  readonly plan: YouTubeQueryPlan;
  readonly memoryAudit: MemoryAudit | null;
  readonly deterministicOutput: boolean;
}

interface MemoryAudit {
  readonly source: "ISOLATED_IN_MEMORY_QA_DATABASE";
  readonly qaLabel: string;
  readonly resolverSkill: string;
  readonly retrievalLimit: number;
  readonly retrieved: readonly { id: string; kind: string; scope: string; domain: string | null }[];
  readonly used: YouTubeQueryPlan["memoryUsed"];
  readonly influencedExecutedQueries: readonly string[];
  readonly incompatibleDomainLeakage: boolean;
  readonly deterministicOutput: boolean;
  readonly scopeChecks: {
    readonly projectSemantic: boolean;
    readonly matchingDomain: boolean;
    readonly globalResearchIntelligence: boolean;
  };
  readonly canonicalIdentity: {
    readonly firstOutcome: string;
    readonly reinforcementOutcome: string;
    readonly stableId: boolean;
    readonly stableCanonicalKey: boolean;
  };
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

interface QueryDiscoveryContribution {
  readonly query: string;
  readonly rawCandidates: number;
  readonly uniqueCandidates: number;
  readonly videoIds: readonly string[];
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
  readonly duplicateVideos: number;
  readonly channelDiversity: number;
  readonly videosPerChannel: readonly { channelId: string; channel: string; videos: number }[];
  readonly topChannelConcentration: number;
  readonly precision: number;
  readonly wastedQueries: number;
  readonly queryContribution: readonly {
    query: string;
    returnedCandidates: number;
    uniqueCandidates: number;
    deterministicRelevant: number;
    exclusiveRelevant: number;
    uniqueChannels: number;
    overlapWithOtherQueries: number;
    wasted: boolean;
    videoIds: readonly string[];
  }[];
  readonly assessed: readonly AssessedRecord[];
}

const CASES: readonly BenchmarkCase[] = [
  {
    id: "self-taught-english-long-es",
    focus: "personas que intentan aprender inglés por su cuenta pero se bloquean al hablar, olvidan vocabulario y abandonan la práctica por falta de constancia",
    domain: "aprendizaje de idiomas",
  },
  {
    id: "restaurant-waste-channel-diversity",
    focus: "propietarios de pequeños restaurantes que quieren reducir desperdicio de alimentos, controlar inventario y mejorar márgenes",
    domain: "operaciones de restaurantes",
  },
  {
    id: "back-pain-production-memory-path",
    focus: "dolor de espalda",
    domain: "bienestar musculoesquelético",
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
      throw new Error("QP-2B forbids non-YouTube external providers.");
    }
    const resource = endpoint(url);
    if (resource === "search") {
      if (accounting.searchListCalls >= SEARCH_CALL_HARD_MAX) throw new Error("QP-2B search.list hard maximum reached.");
      accounting.searchListCalls += 1;
    } else if (resource === "videos") {
      accounting.videosListCalls += 1;
    } else {
      accounting.otherYouTubeCalls += 1;
    }
    accounting.totalExternalCalls += 1;
    return nativeFetch(input, init);
  };
}

function planThroughProductionMemoryPath(benchmarkCase: BenchmarkCase): {
  readonly plan: YouTubeQueryPlan;
  readonly audit: MemoryAudit;
} {
  const database = new AppDatabase(":memory:");
  try {
    const projects = new ProjectRepository(database);
    const memory = new LearningMemoryService(database);
    const target = projects.create({ name: "QP-2B QA Memory Path", niche: benchmarkCase.domain });
    const garden = projects.create({ name: "QP-2B QA Incompatible Domain", niche: "jardinería urbana" });
    const fixtures: readonly LearnedMemoryCandidate[] = [
      candidate({
        projectId: target.id,
        kind: "SEMANTIC_KNOWLEDGE",
        scope: "PROJECT",
        domain: benchmarkCase.domain,
        semanticIdentity: "dolor espalda rigidez lumbar",
        statement: "Dolor de espalda también se expresa como rigidez lumbar al levantarse",
        value: { synonyms: ["rigidez lumbar"] },
        observationKey: "qp2b-qa-semantic",
      }),
      candidate({
        projectId: target.id,
        kind: "DOMAIN_KNOWLEDGE",
        scope: "DOMAIN",
        domain: benchmarkCase.domain,
        semanticIdentity: "dolor espalda postura sedentaria",
        statement: "Dolor de espalda se relaciona con postura sedentaria prolongada",
        value: { queryTerms: ["postura sedentaria"] },
        observationKey: "qp2b-qa-domain-first",
      }),
      candidate({
        projectId: target.id,
        kind: "RESEARCH_INTELLIGENCE",
        scope: "GLOBAL",
        domain: benchmarkCase.domain,
        semanticIdentity: "dolor espalda testimonios primera persona",
        statement: "Para dolor de espalda, buscar testimonios en primera persona descubre lenguaje natural",
        value: { strategy: "testimonios en primera persona" },
        observationKey: "qp2b-qa-global",
        projectCount: 2,
      }),
      candidate({
        projectId: garden.id,
        kind: "DOMAIN_KNOWLEDGE",
        scope: "DOMAIN",
        domain: "jardinería urbana",
        semanticIdentity: "dolor espalda riego goteo",
        statement: "Dolor de espalda en jardinería se evita con riego por goteo",
        value: { queryTerms: ["riego por goteo"] },
        observationKey: "qp2b-qa-incompatible",
      }),
    ];
    const created = fixtures.map((fixture) => {
      const result = memory.reinforce(fixture);
      if (result.outcome === "REJECTED") throw new Error(`QP-2B memory fixture rejected: ${result.reason}`);
      return result.memory;
    });
    const firstDomain = created.find((item) => item.kind === "DOMAIN_KNOWLEDGE" && item.domain === "bienestar musculoesqueletico");
    if (firstDomain === undefined) throw new Error("QP-2B matching DOMAIN memory was not persisted.");
    const reinforcement = memory.reinforce(candidate({
      projectId: target.id,
      kind: "DOMAIN_KNOWLEDGE",
      scope: "DOMAIN",
      domain: benchmarkCase.domain,
      semanticIdentity: "dolor espalda postura sedentaria",
      statement: "Dolor de espalda se relaciona con postura sedentaria prolongada",
      value: { queryTerms: ["postura sedentaria"] },
      observationKey: "qp2b-qa-domain-reinforcement",
      supportCount: 5,
    }));
    if (reinforcement.outcome === "REJECTED") throw new Error(`QP-2B canonical reinforcement rejected: ${reinforcement.reason}`);
    const resolved = new InternalSkillResolver(memory).resolve({
      skillId: "research-intelligence",
      version: 1,
      projectContext: { projectId: target.id, domain: benchmarkCase.domain, query: benchmarkCase.focus },
    });
    const incompatibleIds = created
      .filter((item) => item.scope === "DOMAIN" && item.domain === "jardineria urbana")
      .map((item) => item.id);
    const retrievedIds = new Set(resolved.retrievedMemory.map((item) => item.id));
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: benchmarkCase.focus,
      projectContext: { projectId: target.id, domain: benchmarkCase.domain },
      relevantMemory: resolved.retrievedMemory,
    });
    const repeatedPlan = planMemoryAwareYouTubeQueries({
      researchFocus: benchmarkCase.focus,
      projectContext: { projectId: target.id, domain: benchmarkCase.domain },
      relevantMemory: resolved.retrievedMemory,
    });
    const executed = plan.queries.slice(0, ARM_QUERY_BUDGET);
    return {
      plan,
      audit: {
        source: "ISOLATED_IN_MEMORY_QA_DATABASE",
        qaLabel: "QP-2B_QA_ONLY_NO_PRODUCTION_PERSISTENCE",
        resolverSkill: `${resolved.skill.id}@${resolved.skill.version}`,
        retrievalLimit: Math.min(resolved.skill.memoryPolicy.retrievalLimit, resolved.budget.maxMemoryItems),
        retrieved: resolved.retrievedMemory.map((item) => ({
          id: item.id,
          kind: item.kind,
          scope: item.scope,
          domain: item.domain,
        })),
        used: plan.memoryUsed,
        influencedExecutedQueries: executed.filter((item) => item.memoryIds.length > 0).map((item) => item.query),
        incompatibleDomainLeakage: incompatibleIds.some((id) => retrievedIds.has(id)),
        deterministicOutput: JSON.stringify(plan) === JSON.stringify(repeatedPlan),
        scopeChecks: {
          projectSemantic: resolved.retrievedMemory.some((item) => item.kind === "SEMANTIC_KNOWLEDGE" && item.scope === "PROJECT"),
          matchingDomain: resolved.retrievedMemory.some((item) => item.kind === "DOMAIN_KNOWLEDGE" && item.scope === "DOMAIN"),
          globalResearchIntelligence: resolved.retrievedMemory.some((item) => item.kind === "RESEARCH_INTELLIGENCE" && item.scope === "GLOBAL"),
        },
        canonicalIdentity: {
          firstOutcome: "CREATED",
          reinforcementOutcome: reinforcement.outcome,
          stableId: reinforcement.memory.id === firstDomain.id,
          stableCanonicalKey: reinforcement.memory.canonicalKey === firstDomain.canonicalKey,
        },
      },
    };
  } finally {
    database.close();
  }
}

function candidate(overrides: Partial<LearnedMemoryCandidate> & { projectId: string }): LearnedMemoryCandidate {
  return {
    kind: "DOMAIN_KNOWLEDGE",
    scope: "DOMAIN",
    domain: "bienestar musculoesquelético",
    semanticIdentity: "qp2b qa benchmark memory",
    statement: "QP-2B QA benchmark memory",
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
    provenanceSummary: { summary: "QP-2B isolated QA benchmark fixture", sourceKinds: ["benchmark_qa"] },
    ...overrides,
  };
}

async function discover(
  adapter: YouTubeAdapter,
  arm: Arm,
  queries: readonly string[],
): Promise<{ records: Map<string, DiscoveryRecord>; rawCandidates: number; contributions: QueryDiscoveryContribution[] }> {
  const records = new Map<string, DiscoveryRecord>();
  const contributions: QueryDiscoveryContribution[] = [];
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
    contributions.push({
      query,
      rawCandidates: page.items.length,
      uniqueCandidates,
      videoIds: [...new Set(page.items.map((item) => item.videoId))],
    });
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
  const occurrences = new Map<string, number>();
  for (const contribution of discovery.contributions) {
    for (const videoId of contribution.videoIds) occurrences.set(videoId, (occurrences.get(videoId) ?? 0) + 1);
  }
  const assessedById = new Map(assessed.map((record) => [record.search.videoId, record]));
  const queryContribution = discovery.contributions.map((contribution) => {
    const queryRecords = contribution.videoIds.flatMap((videoId) => {
      const record = assessedById.get(videoId);
      return record === undefined ? [] : [record];
    });
    const deterministicRelevant = queryRecords.filter((record) => record.relevance.decision === "relevant").length;
    return {
      query: contribution.query,
      returnedCandidates: contribution.rawCandidates,
      uniqueCandidates: contribution.uniqueCandidates,
      deterministicRelevant,
      exclusiveRelevant: 0,
      uniqueChannels: new Set(queryRecords.map(channelId)).size,
      overlapWithOtherQueries: contribution.videoIds.filter((videoId) => (occurrences.get(videoId) ?? 0) > 1).length,
      wasted: deterministicRelevant === 0,
      videoIds: contribution.videoIds,
    };
  });
  const unique = assessed.length;
  const channels = new Map<string, { channelId: string; channel: string; videos: number }>();
  for (const record of assessed) {
    const id = channelId(record);
    const existing = channels.get(id);
    if (existing === undefined) {
      channels.set(id, {
        channelId: id,
        channel: record.metadata?.channelTitle ?? record.search.channelTitle,
        videos: 1,
      });
    } else {
      existing.videos += 1;
    }
  }
  const videosPerChannel = [...channels.values()].sort((left, right) => right.videos - left.videos || left.channelId.localeCompare(right.channelId));
  return {
    arm,
    queriesExecuted: discovery.contributions.map((item) => item.query),
    searchCalls: discovery.contributions.length,
    rawCandidates: discovery.rawCandidates,
    uniqueCandidates: unique,
    relevantCandidates: relevant.length,
    duplicateRate: discovery.rawCandidates === 0 ? 0 : round((discovery.rawCandidates - unique) / discovery.rawCandidates),
    duplicateVideos: discovery.rawCandidates - unique,
    channelDiversity: channels.size,
    videosPerChannel,
    topChannelConcentration: unique === 0 ? 0 : round((videosPerChannel[0]?.videos ?? 0) / unique),
    precision: unique === 0 ? 0 : round(relevant.length / unique),
    wastedQueries: queryContribution.filter((item) => item.wasted).length,
    queryContribution,
    assessed,
  };
}

function channelId(record: AssessedRecord): string {
  return record.metadata?.channelId ?? record.search.channelId;
}

function publicArm(result: ArmResult, exclusiveRelevant: ReadonlySet<string>) {
  const { assessed: _assessed, queryContribution, ...publicResult } = result;
  return {
    ...publicResult,
    queryContribution: queryContribution.map(({ videoIds, ...contribution }) => ({
      ...contribution,
      exclusiveRelevant: videoIds.filter((videoId) => exclusiveRelevant.has(videoId)).length,
    })),
  };
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
    channelId: channelId(record),
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
  const selected = new Map<string, (typeof rows)[number] & { reviewReason: string; humanReviewNeeded: true }>();
  for (const row of rows) {
    const exclusive = currentExclusive.has(row.videoId) || memoryExclusive.has(row.videoId);
    const borderline = row.relevanceOutcome === "borderline";
    if (!exclusive && !borderline) continue;
    const reviewReason = exclusive ? "EXCLUSIVE_DETERMINISTIC_RELEVANT" : "BORDERLINE_HUMAN_REVIEW_NEEDED";
    const existing = selected.get(row.videoId);
    if (existing === undefined || reviewReason.startsWith("EXCLUSIVE")) {
      selected.set(row.videoId, { ...row, reviewReason, humanReviewNeeded: true });
    }
  }
  return [...selected.values()].sort((left, right) => left.videoId.localeCompare(right.videoId)).slice(0, MAX_REVIEW_VIDEOS_PER_CASE);
}

function topChannelQueries(result: ArmResult) {
  const top = result.videosPerChannel[0];
  if (top === undefined) return [];
  const counts = new Map<string, number>();
  for (const record of result.assessed) {
    if (channelId(record) === top.channelId) counts.set(record.queryOrigin, (counts.get(record.queryOrigin) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([query, videos]) => ({ query, videos }))
    .sort((left, right) => right.videos - left.videos || left.query.localeCompare(right.query));
}

function classifyDiversityCause(current: ArmResult, memoryAware: ArmResult): string {
  if (memoryAware.channelDiversity >= current.channelDiversity) return "NO_MEMORY_AWARE_DIVERSITY_LOSS";
  if (memoryAware.relevantCandidates >= current.relevantCandidates && memoryAware.precision > current.precision) {
    return "A_NARROWER_OR_HIGHER_PRECISION_QUERIES";
  }
  const currentOverlap = current.queryContribution.reduce((sum, item) => sum + item.overlapWithOtherQueries, 0);
  const memoryOverlap = memoryAware.queryContribution.reduce((sum, item) => sum + item.overlapWithOtherQueries, 0);
  if (memoryAware.duplicateRate > current.duplicateRate && memoryOverlap > currentOverlap) {
    return "B_NEAR_OVERLAPPING_QUERIES";
  }
  if (memoryAware.relevantCandidates < current.relevantCandidates && memoryAware.wastedQueries > current.wastedQueries) {
    return "D_POSSIBLE_PLANNER_WEAKNESS";
  }
  return "C_YOUTUBE_RANKING_OR_MIXED_CAUSE";
}

function caseVerdict(current: Pick<ArmResult, "relevantCandidates" | "precision" | "wastedQueries">, memoryAware: Pick<ArmResult, "relevantCandidates" | "precision" | "wastedQueries">): string {
  if (memoryAware.relevantCandidates >= current.relevantCandidates + 2 && memoryAware.precision >= current.precision) {
    return "MEMORY_AWARE_WIN";
  }
  if (current.relevantCandidates >= memoryAware.relevantCandidates + 2 && current.precision >= memoryAware.precision) {
    return "CURRENT_WIN";
  }
  if (memoryAware.relevantCandidates >= current.relevantCandidates && memoryAware.wastedQueries < current.wastedQueries) {
    return "MEMORY_AWARE_WIN";
  }
  if (current.relevantCandidates >= memoryAware.relevantCandidates && current.wastedQueries < memoryAware.wastedQueries) {
    return "CURRENT_WIN";
  }
  return "TIE_OR_AMBIGUOUS";
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

interface ComparableArm {
  readonly searchCalls: number;
  readonly uniqueCandidates: number;
  readonly relevantCandidates: number;
  readonly precision: number;
  readonly wastedQueries: number;
  readonly channelDiversity: number;
}

interface ComparableCase {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly current: ComparableArm;
  readonly memoryAware: ComparableArm;
  readonly exclusiveRelevant: { readonly current: readonly string[]; readonly memoryAware: readonly string[] };
  readonly candidates: readonly { readonly arm: Arm; readonly channel: string; readonly channelId?: string }[];
  readonly memory?: unknown;
}

interface HistoricalReport {
  readonly benchmark: string;
  readonly accounting: Accounting;
  readonly cases: readonly ComparableCase[];
}

function loadPreviousQp2(reportDirectory: string): { readonly path: string; readonly report: HistoricalReport } {
  const file = readdirSync(reportDirectory)
    .filter((name) => /^qp2-youtube-live-.*\.json$/u.test(name))
    .sort()
    .at(-1);
  if (file === undefined) throw new Error("QP-2B requires the prior QP-2 benchmark artifact.");
  const path = resolve(reportDirectory, file);
  const report = JSON.parse(readFileSync(path, "utf8")) as HistoricalReport;
  if (report.benchmark !== "HALLAZIA_QP_2_CONTROLLED_LIVE_YOUTUBE" || report.cases.length !== 3) {
    throw new Error("QP-2B found an incompatible prior QP-2 artifact.");
  }
  return { path, report };
}

function combinedComparison(previous: HistoricalReport, currentCases: readonly ComparableCase[], currentAccounting: Accounting) {
  const cases = [...previous.cases, ...currentCases];
  const aggregate = (arm: "current" | "memoryAware") => {
    const values = cases.map((item) => item[arm]);
    const uniqueCandidates = values.reduce((sum, item) => sum + item.uniqueCandidates, 0);
    const relevantCandidates = values.reduce((sum, item) => sum + item.relevantCandidates, 0);
    const channels = new Set(cases.flatMap((item) => item.candidates
      .filter((candidate) => candidate.arm === (arm === "current" ? "CURRENT" : "MEMORY_AWARE"))
      .map((candidate) => candidate.channel.normalize("NFKC").trim().toLocaleLowerCase("und"))));
    return {
      searchCalls: values.reduce((sum, item) => sum + item.searchCalls, 0),
      uniqueCandidates,
      relevantCandidates,
      precision: uniqueCandidates === 0 ? 0 : round(relevantCandidates / uniqueCandidates),
      exclusiveRelevant: cases.reduce((sum, item) => sum + item.exclusiveRelevant[arm].length, 0),
      wastedQueries: values.reduce((sum, item) => sum + item.wastedQueries, 0),
      uniqueChannels: channels.size,
    };
  };
  const current = aggregate("current");
  const memoryAware = aggregate("memoryAware");
  const verdicts = cases.map((item) => caseVerdict(item.current, item.memoryAware));
  const currentWins = verdicts.filter((item) => item === "CURRENT_WIN").length;
  const memoryAwareWins = verdicts.filter((item) => item === "MEMORY_AWARE_WIN").length;
  const tiesOrAmbiguous = verdicts.length - currentWins - memoryAwareWins;
  const domainIsolation = currentCases.every((item) => {
    const memory = item.memory as { readonly incompatibleDomainLeakage?: boolean } | undefined;
    return memory?.incompatibleDomainLeakage !== true;
  });
  const canaryCriteria = {
    allSixCasesCompleted: cases.length === 6,
    noCurrentWins: currentWins === 0,
    atLeastTwoMemoryAwareWins: memoryAwareWins >= 2,
    noRelevantRegression: memoryAware.relevantCandidates >= current.relevantCandidates,
    precisionNotLower: memoryAware.precision >= current.precision,
    wastedQueriesNotHigher: memoryAware.wastedQueries <= current.wastedQueries,
    domainIsolation,
  };
  const canaryEligible = Object.values(canaryCriteria).every(Boolean);
  return {
    cases: cases.length,
    channelIdentity: "NORMALIZED_CHANNEL_TITLE_ACROSS_BOTH_ARTIFACTS",
    apiAccounting: {
      searchListCalls: previous.accounting.searchListCalls + currentAccounting.searchListCalls,
      videosListCalls: previous.accounting.videosListCalls + currentAccounting.videosListCalls,
      otherYouTubeEndpointCalls:
        previous.accounting.totalExternalCalls - previous.accounting.searchListCalls - previous.accounting.videosListCalls - previous.accounting.externalProviderCalls
        + currentAccounting.totalExternalCalls - currentAccounting.searchListCalls - currentAccounting.videosListCalls - currentAccounting.externalProviderCalls,
      externalProviderCalls: previous.accounting.externalProviderCalls + currentAccounting.externalProviderCalls,
      totalExternalCalls: previous.accounting.totalExternalCalls + currentAccounting.totalExternalCalls,
    },
    current,
    memoryAware,
    outcomes: { currentWins, memoryAwareWins, tiesOrAmbiguous, perCase: cases.map((item, index) => ({ id: item.id, verdict: verdicts[index] })) },
    canaryCriteria,
    recommendation: canaryEligible ? "PROCEED_TO_LIMITED_CANARY" : "KEEP_SHADOW_AND_TUNE",
  };
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
  const previousQp2 = loadPreviousQp2(reportDirectory);
  const reportPath = resolve(reportDirectory, `qp2b-youtube-live-${startedAt.replace(/[:.]/gu, "-")}.json`);
  const preparedCases: PreparedBenchmarkCase[] = CASES.map((benchmarkCase) => {
    if (benchmarkCase.memoryFixture) {
      const memoryPath = planThroughProductionMemoryPath(benchmarkCase);
      return {
        benchmarkCase,
        plan: memoryPath.plan,
        memoryAudit: memoryPath.audit,
        deterministicOutput: memoryPath.audit.deterministicOutput,
      };
    }
    const plan = planMemoryAwareYouTubeQueries({ researchFocus: benchmarkCase.focus });
    const repeatedPlan = planMemoryAwareYouTubeQueries({ researchFocus: benchmarkCase.focus });
    return {
      benchmarkCase,
      plan,
      memoryAudit: null,
      deterministicOutput: JSON.stringify(plan) === JSON.stringify(repeatedPlan),
    };
  });
  for (const prepared of preparedCases) {
    if (prepared.plan.queries.length < ARM_QUERY_BUDGET) throw new Error(`QP-2B ${prepared.benchmarkCase.id} cannot fill the fair six-query budget.`);
    if (!prepared.deterministicOutput) throw new Error(`QP-2B ${prepared.benchmarkCase.id} planner output is not deterministic.`);
    const audit = prepared.memoryAudit;
    if (audit !== null && (
      audit.incompatibleDomainLeakage
      || !audit.scopeChecks.projectSemantic
      || !audit.scopeChecks.matchingDomain
      || !audit.scopeChecks.globalResearchIntelligence
      || !audit.canonicalIdentity.stableId
      || !audit.canonicalIdentity.stableCanonicalKey
      || audit.canonicalIdentity.reinforcementOutcome !== "REINFORCED"
      || audit.retrieved.length > audit.retrievalLimit
      || audit.used.length === 0
      || audit.influencedExecutedQueries.length === 0
    )) throw new Error("QP-2B production memory-path preflight failed.");
  }
  if (process.argv.includes("--validate-only")) {
    console.info(JSON.stringify({
      status: "PASS",
      mode: "VALIDATE_ONLY_NO_EXTERNAL_CALLS",
      cases: preparedCases.length,
      memoryPathValidated: preparedCases.some((item) => item.memoryAudit !== null),
    }));
    return;
  }
  const adapter = new YouTubeAdapter({
    ...(process.env.YOUTUBE_API_KEY?.trim() ? { apiKey: process.env.YOUTUBE_API_KEY } : {}),
    fetch: countingFetch(accounting, globalThis.fetch),
  });
  if (!adapter.configured) throw new Error("YouTube is not configured; no live calls were made.");

  const results: ComparableCase[] = [];
  let status: "PASS" | "PARTIAL" = "PASS";
  let failure: string | null = null;
  try {
    for (const prepared of preparedCases) {
      const { benchmarkCase, plan, memoryAudit } = prepared;
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
      results.push({
        id: benchmarkCase.id,
        focus: benchmarkCase.focus,
        domain: benchmarkCase.domain,
        current: publicArm(current, currentExclusive),
        memoryAware: publicArm(memoryAware, memoryExclusive),
        verdict: caseVerdict(current, memoryAware),
        overlap: {
          uniqueCandidates: intersection(currentUnique, memoryUnique).length,
          relevantCandidates: intersection(currentRelevant, memoryRelevant).length,
        },
        exclusiveRelevant: {
          current: [...currentExclusive],
          memoryAware: [...memoryExclusive],
        },
        memory: memoryAudit ?? {
          source: eligibleMemoryCount === 0 ? "REAL_DB_NONE_AVAILABLE" : "REAL_DB_NOT_SELECTED_FOR_CONTROL_CASE",
          retrieved: [],
          used: plan.memoryUsed,
          influencedExecutedQueries: [],
          incompatibleDomainLeakage: false,
          deterministicOutput: prepared.deterministicOutput,
        },
        channelAnalysis: {
          currentTopChannelQueries: topChannelQueries(current),
          memoryAwareTopChannelQueries: topChannelQueries(memoryAware),
          diversityCauseClassification: classifyDiversityCause(current, memoryAware),
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
  const combined = combinedComparison(previousQp2.report, results, accounting);
  const report = {
    benchmark: "HALLAZIA_QP_2B_SECOND_CONTROLLED_LIVE_YOUTUBE",
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
      executorMode: "SHADOW",
      realEligibleMemoryCountAtStart: eligibleMemoryCount,
      priorQp2Artifact: previousQp2.path,
    },
    accounting,
    cases: results,
    combinedQp2AndQp2b: combined,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info(JSON.stringify({ status, reportPath, casesCompleted: results.length, accounting }));
  if (status !== "PASS") process.exitCode = 2;
}

await main();
