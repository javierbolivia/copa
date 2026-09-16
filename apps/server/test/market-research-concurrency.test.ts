import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmGenerateResult } from "@our-platform/shared";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { MarketResearchService } from "../src/services/market-research-service.js";
import type { MarketResearchAnalyzerClient } from "../src/services/market-research-semantic-miner.js";

const fixture = { results: [{ url: "https://example.com/photos", text: "Pierdo demasiado tiempo organizando mis fotografías duplicadas y necesito ayuda." }], metadata: { status: 200, resultCount: 1 } };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Market Research concurrent request costs", () => {
  let db: AppDatabase;
  let projects: ProjectRepository;
  let projectId: string;
  beforeEach(() => {
    db = new AppDatabase(":memory:");
    projects = new ProjectRepository(db);
    projectId = projects.create({ name: "Research", niche: "Photography" }).id;
  });
  afterEach(() => db.close());

  function service(gate: ReturnType<typeof deferred>) {
    const discover = vi.fn(async () => { await gate.promise; return fixture; });
    const generate = vi.fn(async (): Promise<LlmGenerateResult<unknown>> => ({ provider: "fake", requestedModel: "fake", output: { findings: [] }, usage: { inputTokens: 10, outputTokens: 2, usageKind: "provider_reported" } }));
    const fallback = vi.fn(async () => { throw new Error("No fallback expected"); });
    return {
      discover, generate, fallback,
      research: new MarketResearchService(db, {
        clients: { tavily: { name: "tavily", configured: true, discover } },
        analyzers: {
          deepSeek: { configured: true, generate: generate as MarketResearchAnalyzerClient["generate"] },
          gemini: { configured: true, generate: fallback },
        },
      }),
    };
  }

  it("coalesces identical overlapping requests and persists one run, but refreshes after completion", async () => {
    const gate = deferred();
    const { research, discover, generate, fallback } = service(gate);
    const pending = Array.from({ length: 10 }, (_, index) => research.run(projectId, {
      topic: index % 2 ? " fotografías " : "fotografías",
      providers: index % 2 ? ["brave", "tavily", "tavily"] : ["tavily", "brave"],
    }));
    gate.resolve();
    const runs = await Promise.all(pending);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(new Set(runs.map(run => run.runId)).size).toBe(1);
    expect(research.history(projectId)).toHaveLength(1);
    expect(db.connection.prepare("SELECT count(*) count FROM llm_usage").get()).toMatchObject({ count: 1 });
    (runs[0]!.signals as Array<{ text: string }>)[0]!.text = "caller mutation";
    expect(runs[1]!.signals[0]!.text).toBe(fixture.results[0]!.text);
    expect(research.latest(projectId)!.signals[0]!.text).toBe(fixture.results[0]!.text);
    const next = await research.run(projectId, { topic: "fotografías", providers: ["tavily", "brave"] });
    expect(next.runId).not.toBe(runs[0]!.runId);
    expect(discover).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("releases failed persistence so a later request can retry without an orphan ledger entry", async () => {
    const gate = deferred();
    const { research, discover } = service(gate);
    db.connection.exec("CREATE TRIGGER reject_research BEFORE INSERT ON generations BEGIN SELECT RAISE(ABORT, 'controlled persistence failure'); END");
    const pending = Promise.allSettled([
      research.run(projectId, { topic: "fotografías", providers: ["tavily"] }),
      research.run(projectId, { topic: "fotografías", providers: ["tavily"] }),
    ]);
    gate.resolve();
    expect((await pending).every(result => result.status === "rejected")).toBe(true);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(db.connection.prepare("SELECT count(*) count FROM generations").get()).toMatchObject({ count: 0 });
    expect(db.connection.prepare("SELECT count(*) count FROM llm_usage").get()).toMatchObject({ count: 0 });
    db.connection.exec("DROP TRIGGER reject_research");
    await research.run(projectId, { topic: "fotografías", providers: ["tavily"] });
    expect(discover).toHaveBeenCalledTimes(2);
    expect(research.history(projectId)).toHaveLength(1);
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.connection.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
  });

  it("keeps projects, topics, provider selections and duration criteria isolated", async () => {
    const gate = deferred();
    const { research, discover } = service(gate);
    const otherId = projects.create({ name: "Other", niche: "Photography" }).id;
    const pending = [
      research.run(projectId, { topic: "fotografías", providers: ["tavily"] }),
      research.run(otherId, { topic: "fotografías", providers: ["tavily"] }),
      research.run(projectId, { topic: "respaldo de fotos", providers: ["tavily"] }),
      research.run(projectId, { topic: "fotografías", providers: ["tavily", "brave"] }),
      research.run(projectId, { topic: "fotografías", providers: ["tavily"], youtubeMinimumDurationSeconds: 900 }),
    ];
    gate.resolve();
    const runs = await Promise.all(pending);
    expect(discover).toHaveBeenCalledTimes(5);
    expect(new Set(runs.map(run => run.runId)).size).toBe(5);
    expect(research.history(otherId)).toHaveLength(1);
    expect(research.history(projectId)).toHaveLength(4);
  });
});
