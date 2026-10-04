import type { WorkflowState, WorkflowStep } from "@our-platform/shared";
import type { AppDatabase } from "../database/database.js";

export function effectiveWorkflowState(database:AppDatabase,projectId:string,stepKey:string,state:WorkflowState,updatedAt:string):WorkflowState {
  if(state!=="IN_PROGRESS")return state;
  const row=database.connection.prepare(`SELECT active.status AS active_status,active.freshness AS active_freshness,latest.status AS latest_status,latest.created_at AS latest_created_at
    FROM artifacts artifact
    JOIN artifact_versions active ON active.id=artifact.active_version_id
    JOIN artifact_versions latest ON latest.artifact_id=artifact.id
    WHERE artifact.project_id=? AND artifact.artifact_type=?
    ORDER BY latest.version_number DESC LIMIT 1`).get(projectId,stepKey) as {active_status:string;active_freshness:string;latest_status:string;latest_created_at:string}|undefined;
  return row?.active_status==="approved"&&row.active_freshness==="fresh"&&row.latest_status==="archived"&&row.latest_created_at>=updatedAt?"COMPLETED":state;
}

export class WorkflowRepository {
  constructor(private readonly database: AppDatabase) {}
  list(projectId: string): WorkflowStep[] {
    const rows = this.database.connection.prepare("SELECT * FROM workflow_steps WHERE project_id=? AND step_key<>'emails' ORDER BY position").all(projectId) as unknown as Array<Record<string,unknown>>;
    return rows.map((r) => ({ id:r.id as string, projectId:r.project_id as string, stepKey:r.step_key as string, label:r.label as string,
      position:r.position as number, state:effectiveWorkflowState(this.database,projectId,r.step_key as string,r.state as WorkflowState,r.updated_at as string), staleReason:r.stale_reason as string|null, updatedAt:r.updated_at as string }));
  }
  update(projectId: string, stepKey: string, state: WorkflowState): WorkflowStep | undefined {
    const now = new Date().toISOString();
    this.database.connection.prepare("UPDATE workflow_steps SET state=?, stale_reason=NULL, updated_at=? WHERE project_id=? AND step_key=?").run(state, now, projectId, stepKey);
    return this.list(projectId).find((step) => step.stepKey === stepKey);
  }
}
