import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
  WorkflowState,
} from "@our-platform/shared";
import type { StatementResultingChanges } from "node:sqlite";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import { effectiveWorkflowState } from "./workflow-repository.js";

interface ProjectRow {
  id: string;
  name: string;
  niche: string;
  description: string | null;
  status: "active" | "archived";
  language: string;
  region: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    description: row.description,
    status: row.status,
    language: row.language,
    region: row.region,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    workflowStage: "Investigación",
    workflowCompletedSteps: 0,
    workflowTotalSteps: 13,
  };
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  return value.trim();
}

export class ProjectRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: CreateProjectInput): Project {
    const id = uuidv7();
    const now = new Date().toISOString();
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      this.database.connection
        .prepare(
          `
        INSERT INTO projects (
          id, name, niche, description, status, language, currency,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', 'es', 'USD', ?, ?)
      `,
        )
        .run(
          id,
          input.name.trim(),
          input.niche.trim(),
          normalizeDescription(input.description),
          now,
          now,
        );

      this.database.connection
        .prepare(
          `
      INSERT INTO project_settings (project_id, language, currency, content_language, updated_at)
      VALUES (?, 'es', 'USD', 'es', ?)
    `,
        )
        .run(id, now);
      const workflowSteps = [
        ["research", "Investigación"],
        ["sources", "Fuentes"],
        ["problems", "Problemas"],
        ["opportunities", "Oportunidades"],
        ["product", "Producto"],
        ["avatar", "Avatar"],
        ["mechanism", "Mecanismo"],
        ["beliefs", "Creencias"],
        ["offer", "Oferta"],
        ["landing", "Landing"],
        ["funnel", "Funnel"],
        ["content", "Contenido"],
        ["final_product", "Producto final"],
      ];
      const insertStep = this.database.connection.prepare(`
      INSERT INTO workflow_steps (id, project_id, step_key, label, position, state, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
      for (const [index, [stepKey, label]] of workflowSteps.entries()) {
        insertStep.run(
          uuidv7(),
          id,
          stepKey!,
          label!,
          index + 1,
          index === 0 ? "READY" : "PENDING",
          now,
        );
      }
      this.database.connection.exec("COMMIT");
      return this.getRequired(id);
    } catch (error) {
      if (this.database.connection.isTransaction)
        this.database.connection.exec("ROLLBACK");
      throw error;
    }
  }

  list(includeArchived = false): Project[] {
    const statement = includeArchived
      ? this.database.connection.prepare(
          "SELECT * FROM projects ORDER BY updated_at DESC",
        )
      : this.database.connection.prepare(
          "SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC",
        );

    return (statement.all() as unknown as ProjectRow[]).map((row) =>
      this.withWorkflow(toProject(row)),
    );
  }

  get(id: string): Project | undefined {
    const row = this.database.connection
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;
    return row === undefined ? undefined : this.withWorkflow(toProject(row));
  }

  update(id: string, input: UpdateProjectInput): Project | undefined {
    if (this.get(id) === undefined) {
      return undefined;
    }

    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
      fields.push("name = ?");
      values.push(input.name.trim());
    }
    if (input.niche !== undefined) {
      fields.push("niche = ?");
      values.push(input.niche.trim());
    }
    if (input.description !== undefined) {
      fields.push("description = ?");
      values.push(normalizeDescription(input.description));
    }

    fields.push("updated_at = ?");
    values.push(new Date().toISOString(), id);

    this.database.connection
      .prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getRequired(id);
  }

  archive(id: string): Project | undefined {
    const now = new Date().toISOString();
    const result = this.database.connection
      .prepare(
        `
        UPDATE projects
        SET status = 'archived', archived_at = ?, updated_at = ?
        WHERE id = ? AND status = 'active'
      `,
      )
      .run(now, now, id) as StatementResultingChanges;

    if (result.changes === 0) {
      return this.get(id);
    }
    return this.getRequired(id);
  }

  restore(id: string): Project | undefined {
    const now = new Date().toISOString();
    this.database.connection
      .prepare(
        `UPDATE projects SET status='active', archived_at=NULL, updated_at=? WHERE id=?`,
      )
      .run(now, id);
    return this.get(id);
  }

  deletePermanently(id: string): boolean {
    const project = this.get(id);
    if (project === undefined || project.status !== "archived") return false;
    const rawFiles = this.database.connection
      .prepare(
        `
      SELECT document.stored_relative_path path
      FROM knowledge_documents document
      JOIN knowledge_libraries library ON library.id=document.library_id
      WHERE library.scope='PROJECT' AND library.project_id=? AND document.stored_relative_path IS NOT NULL
      UNION
      SELECT relative_path path FROM product_assets WHERE project_id=?
      UNION
      SELECT relative_path path FROM generated_files WHERE project_id=?
    `,
      )
      .all(id, id, id) as unknown as Array<{ path: string }>;
    const result = this.database.connection
      .prepare("DELETE FROM projects WHERE id = ?")
      .run(id) as StatementResultingChanges;
    if (result.changes === 1 && this.database.path !== ":memory:") {
      const root = resolve(dirname(this.database.path));
      const allowedRoots = [
        resolve(root, "knowledge"),
        resolve(root, "assets"),
        resolve(root, "generated"),
      ];
      for (const item of rawFiles) {
        const absolute = resolve(root, item.path);
        if (
          allowedRoots.some(
            (base) => absolute === base || absolute.startsWith(`${base}\\`),
          )
        )
          rmSync(absolute, { force: true });
      }
      rmSync(resolve(root, "assets", id), { recursive: true, force: true });
      rmSync(resolve(root, "generated", id), { recursive: true, force: true });
    }
    return result.changes === 1;
  }

  private withWorkflow(project: Project): Project {
    const rows = this.database.connection
      .prepare(
        `SELECT step_key, label, state, updated_at FROM workflow_steps WHERE project_id=? AND step_key<>'emails' ORDER BY position`,
      )
      .all(project.id) as unknown as Array<{ step_key:string; label: string; state: WorkflowState; updated_at:string }>;
    const completed = rows.filter((row) => effectiveWorkflowState(this.database,project.id,row.step_key,row.state,row.updated_at) === "COMPLETED").length;
    const current =
      rows.find((row) => effectiveWorkflowState(this.database,project.id,row.step_key,row.state,row.updated_at) !== "COMPLETED")?.label ?? "Completado";
    return {
      ...project,
      workflowStage: current,
      workflowCompletedSteps: completed,
      workflowTotalSteps: rows.length || 13,
    };
  }

  private getRequired(id: string): Project {
    const project = this.get(id);
    if (project === undefined) {
      throw new Error(`No se pudo recuperar el proyecto ${id}.`);
    }
    return project;
  }
}
