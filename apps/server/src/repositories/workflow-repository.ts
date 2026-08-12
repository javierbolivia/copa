import type { WorkflowState, WorkflowStep } from "@our-platform/shared";
import type { AppDatabase } from "../database/database.js";

export class WorkflowRepository {
  constructor(private readonly database: AppDatabase) {}
  list(projectId: string): WorkflowStep[] {
    const rows = this.database.connection.prepare("SELECT * FROM workflow_steps WHERE project_id=? ORDER BY position").all(projectId) as unknown as Array<Record<string,unknown>>;
    return rows.map((r) => ({ id:r.id as string, projectId:r.project_id as string, stepKey:r.step_key as string, label:r.label as string,
      position:r.position as number, state:r.state as WorkflowState, staleReason:r.stale_reason as string|null, updatedAt:r.updated_at as string }));
  }
  update(projectId: string, stepKey: string, state: WorkflowState): WorkflowStep | undefined {
    const now = new Date().toISOString();
    this.database.connection.prepare("UPDATE workflow_steps SET state=?, stale_reason=NULL, updated_at=? WHERE project_id=? AND step_key=?").run(state, now, projectId, stepKey);
    return this.list(projectId).find((step) => step.stepKey === stepKey);
  }
}
