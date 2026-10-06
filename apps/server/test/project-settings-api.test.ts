import type { Project, ProjectSettings } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("Project budget API", () => {
  let app: FastifyInstance;
  let url: string;
  let input: Omit<ProjectSettings, "projectId" | "updatedAt">;

  beforeEach(async () => {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    const response = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Budget settings", niche: "Testing" } });
    expect(response.statusCode, response.body).toBe(201);
    url = `/api/projects/${response.json<Project>().id}/settings`;
    const settings = (await app.inject({ method: "GET", url })).json<ProjectSettings>();
    const { projectId: _, updatedAt: __, ...rest } = settings;
    input = rest;
  });
  afterEach(async () => app.close());

  it.each([null, 0, 25.5])("preserves budget %s through save and reload", async (maxBudget) => {
    const saved = await app.inject({ method: "PUT", url, payload: { ...input, maxBudget } });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<ProjectSettings>().maxBudget).toBe(maxBudget);
    const reloaded = await app.inject({ method: "GET", url });
    expect(reloaded.json<ProjectSettings>().maxBudget).toBe(maxBudget);
  });

  it.each([-1, "not-a-budget"])("rejects invalid budget %s without changing the saved value", async (maxBudget) => {
    const saved = await app.inject({ method: "PUT", url, payload: { ...input, maxBudget: 12 } });
    expect(saved.statusCode).toBe(200);
    const rejected = await app.inject({ method: "PUT", url, payload: { ...input, maxBudget } });
    expect(rejected.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url })).json<ProjectSettings>().maxBudget).toBe(12);
  });

  it("does not present a missing project as an empty workflow or artifact history", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    for (const resource of ["workflow", "artifacts"]) {
      const response = await app.inject({ method: "GET", url: `/api/projects/${missing}/${resource}` });
      expect(response.statusCode, `${resource}: ${response.body}`).toBe(404);
      expect(response.json()).toMatchObject({ error: "not_found" });
    }
    const existingBase = url.replace(/\/settings$/, "");
    const workflow = await app.inject({ method: "GET", url: `${existingBase}/workflow` });
    const artifacts = await app.inject({ method: "GET", url: `${existingBase}/artifacts` });
    expect(workflow.statusCode).toBe(200);
    expect(workflow.json<{ steps: unknown[] }>().steps.length).toBeGreaterThan(0);
    expect(artifacts.statusCode).toBe(200);
    expect(artifacts.json()).toMatchObject({ versions: [] });
  });
});
