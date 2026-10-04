import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { WorkflowRepository } from "../src/repositories/workflow-repository.js";

describe("workflow read projection", () => {
  let database: AppDatabase | undefined;
  afterEach(() => { database?.close(); database = undefined; });

  it("shows an approved fresh Avatar as completed after its latest review draft is archived", () => {
    database = new AppDatabase(":memory:");
    const projects = new ProjectRepository(database);
    const project = projects.create({ name: "Workflow QA", niche: "Perros reactivos" });
    const artifacts = new ArtifactRepository(database);
    const workflow = new WorkflowRepository(database);
    const approved = artifacts.createVersion({ projectId: project.id, artifactType: "avatar", name: "Avatar", inputSnapshot: {}, outputData: {}, status: "approved" });
    const pending = artifacts.createVersion({ projectId: project.id, artifactType: "avatar", name: "Avatar", artifactId: approved.artifactId, inputSnapshot: {}, outputData: {}, status: "draft" });
    workflow.update(project.id, "avatar", "IN_PROGRESS");

    expect(workflow.list(project.id).find(step => step.stepKey === "avatar")?.state).toBe("IN_PROGRESS");
    const archived = artifacts.archiveDraft(project.id, pending.id)!;

    expect(approved.freshness).toBe("fresh");
    expect(archived.status).toBe("archived");
    expect(database.connection.prepare("SELECT state FROM workflow_steps WHERE project_id=? AND step_key='avatar'").get(project.id)).toMatchObject({ state: "COMPLETED" });
    expect(workflow.list(project.id).find(step => step.stepKey === "avatar")?.state).toBe("COMPLETED");
    expect(projects.get(project.id)?.workflowCompletedSteps).toBe(1);

    const legacyStateAt = new Date(Date.parse(archived.createdAt) - 1).toISOString();
    database.connection.prepare("UPDATE workflow_steps SET state='IN_PROGRESS',updated_at=? WHERE project_id=? AND step_key='avatar'").run(legacyStateAt, project.id);
    expect(workflow.list(project.id).find(step => step.stepKey === "avatar")?.state).toBe("COMPLETED");
  });
});
