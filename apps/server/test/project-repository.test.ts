import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { WorkflowRepository } from "../src/repositories/workflow-repository.js";

describe("ProjectRepository", () => {
  let database: AppDatabase;
  let repository: ProjectRepository;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    repository = new ProjectRepository(database);
  });

  afterEach(() => database.close());

  it("crea, lista, obtiene y actualiza un proyecto", () => {
    const created = repository.create({
      name: "  Fotos ordenadas  ",
      niche: "  Organización personal  ",
      description: "  Producto de prueba  ",
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe("Fotos ordenadas");
    expect(created.niche).toBe("Organización personal");
    expect(repository.list()).toHaveLength(1);
    expect(repository.get(created.id)?.description).toBe("Producto de prueba");

    const updated = repository.update(created.id, {
      name: "Fototeca personal",
      description: null,
    });
    expect(updated?.name).toBe("Fototeca personal");
    expect(updated?.description).toBeNull();
  });

  it("archiva sin borrar y excluye el proyecto de la lista activa", () => {
    const project = repository.create({ name: "Proyecto", niche: "Nicho" });
    const archived = repository.archive(project.id);

    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).not.toBeNull();
    expect(repository.list()).toEqual([]);
    expect(repository.list(true)).toHaveLength(1);
    expect(repository.get(project.id)?.status).toBe("archived");
  });

  it("hides the deprecated Emails step from active workflow without deleting its legacy row", () => {
    const project = repository.create({ name: "Legacy workflow", niche: "Nicho" });
    const now = new Date().toISOString();
    database.connection.prepare("UPDATE workflow_steps SET position=100 WHERE project_id=? AND step_key='content'").run(project.id);
    database.connection.prepare("UPDATE workflow_steps SET position=101 WHERE project_id=? AND step_key='final_product'").run(project.id);
    database.connection.prepare("INSERT INTO workflow_steps (id,project_id,step_key,label,position,state,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), project.id, "emails", "Emails", 12, "PENDING", now);
    database.connection.prepare("UPDATE workflow_steps SET position=13 WHERE project_id=? AND step_key='content'").run(project.id);
    database.connection.prepare("UPDATE workflow_steps SET position=14 WHERE project_id=? AND step_key='final_product'").run(project.id);

    const visible = new WorkflowRepository(database).list(project.id);
    const refreshed = repository.get(project.id)!;
    const legacyRow = database.connection.prepare("SELECT step_key,state FROM workflow_steps WHERE project_id=? AND step_key='emails'").get(project.id) as { step_key: string; state: string };

    expect(visible).toHaveLength(13);
    expect(visible.some((step) => step.stepKey === "emails")).toBe(false);
    expect(visible.find((step) => step.stepKey === "content")?.position).toBe(13);
    expect(refreshed.workflowTotalSteps).toBe(13);
    expect(refreshed.workflowCompletedSteps).toBe(0);
    expect(refreshed.workflowStage).toBe("Investigación");
    expect(legacyRow).toEqual({ step_key: "emails", state: "PENDING" });
  });

  it("sólo elimina proyectos archivados y permite el cascade de vocabulario activo", () => {
    const project = repository.create({ name: "Eliminar", niche: "Nicho" });
    expect(repository.deletePermanently(project.id)).toBe(false);
    expect(repository.get(project.id)).toBeDefined();

    database.connection.prepare(`
      INSERT INTO semantic_vocabulary_versions(
        id,project_id,research_focus,research_focus_hash,analysis_snapshot_hash,
        version,content_hash,status,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?)
    `).run(crypto.randomUUID(),project.id,"foco","focus-hash","snapshot-hash",1,"content-hash","active",new Date().toISOString());

    expect(repository.archive(project.id)?.status).toBe("archived");
    expect(repository.deletePermanently(project.id)).toBe(true);
    expect(repository.get(project.id)).toBeUndefined();
  });
});
