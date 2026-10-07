import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppDatabase } from "../src/database/database.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";

describe("generation history cost status", () => {
  let database: AppDatabase;
  let projectId: string;
  let repository: JobRepository;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    projectId = new ProjectRepository(database).create({ name: "Cost status", niche: "QA" }).id;
    repository = new JobRepository(database);
  });

  afterEach(() => database.close());

  it("distinguishes reported, estimated, unknown and non-billable usage", () => {
    const now = new Date().toISOString();
    const insertGeneration = database.connection.prepare(`INSERT INTO generations
      (id,project_id,agent_key,provider,model,status,input_snapshot,output_data,prompt_version,input_tokens,output_tokens,estimated_cost,duration_ms,created_at,completed_at)
      VALUES(?,?,?,?,'test',?,'{}','{}','test',?,?,?,0,?,?)`);
    const insertUsage = database.connection.prepare(`INSERT INTO llm_usage
      (id,project_id,generation_id,provider,model,input_tokens,output_tokens,estimated_cost,currency,is_estimate,recorded_at)
      VALUES(?,?,?,?,?,?,?,?,'USD',?,?)`);
    const addGeneration = (id: string, provider: string, inputTokens: number, outputTokens: number, cost: number, status = "COMPLETED") => {
      insertGeneration.run(id, projectId, "research", provider, status, inputTokens, outputTokens, cost, now, now);
      return id;
    };
    const addUsage = (id: string, provider: string, inputTokens: number, outputTokens: number, cost: number, isEstimate: number) => {
      insertUsage.run(`usage-${id}`, projectId, id, provider, "test", inputTokens, outputTokens, cost, isEstimate, now);
    };

    addGeneration("reported-cost", "openai", 10, 5, 0.25);
    addUsage("reported-cost", "openai", 10, 5, 0.25, 0);
    addGeneration("estimated-cost", "gemini", 10, 5, 0.1);
    addUsage("estimated-cost", "gemini", 10, 5, 0.1, 1);
    addGeneration("unknown-cost", "deepseek", 0, 0, 0, "FAILED");
    addGeneration("mock-cost", "mock", 0, 0, 0);

    const costs = new Map(repository.listGenerations(projectId).map((generation) => [generation.id, generation.costStatus]));
    expect(costs).toEqual(new Map([
      ["reported-cost", "reported"],
      ["estimated-cost", "estimated"],
      ["unknown-cost", "unknown"],
      ["mock-cost", "not_applicable"],
    ]));
  });
});
