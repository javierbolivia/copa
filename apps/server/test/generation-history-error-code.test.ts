import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";

describe("generation history error metadata", () => {
  let database: AppDatabase | undefined;
  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("returns a failed generation error code without exposing its raw error message", () => {
    database = new AppDatabase(":memory:");
    const project = new ProjectRepository(database).create({ name: "History test", niche: "Fixture" });
    database.connection.prepare(`INSERT INTO generations(id,project_id,agent_key,provider,model,status,error_code,error_message,created_at)
      VALUES(?,?,?,?,?,'FAILED',?,?,?)`).run(
        "generation-failed", project.id, "opportunities", "deepseek", "deepseek-flash",
        "transport_error", "No se pudo conectar con DeepSeek.", "2026-10-03T10:00:00.000Z",
      );

    const [generation] = new JobRepository(database).listGenerations(project.id);
    expect(generation?.errorCode).toBe("transport_error");
    expect(generation).not.toHaveProperty("errorMessage");
    expect(generation?.outputData).toBeNull();
  });
});
