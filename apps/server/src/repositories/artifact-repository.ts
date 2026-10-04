import type { ArtifactVersion } from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";

interface CreateVersionInput { projectId:string; artifactType:string; name:string; artifactId?:string; inputSnapshot:unknown; outputData:unknown; parentVersionIds?:string[]; status?:"draft"|"approved"; }

export class ArtifactRepository {
  constructor(private readonly database: AppDatabase) {}
  createVersion(input: CreateVersionInput): ArtifactVersion {
    const db=this.database.connection, now=new Date().toISOString();
    const ownsTransaction=!db.isTransaction;
    if(ownsTransaction)db.exec("BEGIN IMMEDIATE");
    try {
      let artifactId=input.artifactId;
      if (!artifactId) { artifactId=uuidv7(); db.prepare("INSERT INTO artifacts (id,project_id,artifact_type,name,created_at) VALUES (?,?,?,?,?)").run(artifactId,input.projectId,input.artifactType,input.name,now); }
      else {
        const artifact=db.prepare("SELECT project_id,artifact_type FROM artifacts WHERE id=?").get(artifactId) as {project_id:string;artifact_type:string}|undefined;
        if(!artifact || artifact.project_id!==input.projectId || artifact.artifact_type!==input.artifactType) throw new Error("El artefacto no pertenece al proyecto o tipo solicitado.");
      }
      for(const parentId of input.parentVersionIds??[]){const parent=db.prepare("SELECT project_id FROM artifact_versions WHERE id=?").get(parentId) as {project_id:string}|undefined;if(!parent||parent.project_id!==input.projectId)throw new Error("La versión padre no pertenece al proyecto.");}
      const previous=db.prepare("SELECT id,version_number FROM artifact_versions WHERE artifact_id=? ORDER BY version_number DESC LIMIT 1").get(artifactId) as {id:string;version_number:number}|undefined;
      const active=db.prepare("SELECT active_version_id id FROM artifacts WHERE id=?").get(artifactId) as {id:string|null}|undefined;
      const id=uuidv7(), versionNumber=(previous?.version_number??0)+1, status=input.status??"approved";
      if(active?.id&&status==="approved") db.prepare("UPDATE artifact_versions SET status='superseded' WHERE id=? AND status='approved'").run(active.id);
      db.prepare(`INSERT INTO artifact_versions (id,project_id,artifact_id,version_number,status,freshness,input_snapshot,output_data,supersedes_version_id,created_at) VALUES (?,?,?,?,?,'fresh',?,?,?,?)`)
        .run(id,input.projectId,artifactId,versionNumber,status,JSON.stringify(input.inputSnapshot),JSON.stringify(input.outputData),status==="approved"?(active?.id??null):(previous?.id??null),now);
      if(status==="approved")db.prepare("UPDATE artifacts SET active_version_id=? WHERE id=?").run(id,artifactId);
      for(const parentId of input.parentVersionIds??[]) db.prepare("INSERT INTO lineage_edges (id,project_id,parent_version_id,child_version_id,relation,created_at) VALUES (?,?,?,?, 'derived_from',?)").run(uuidv7(),input.projectId,parentId,id,now);
      if(active?.id&&status==="approved") this.propagateStale(active.id,id,input.projectId,now);
      if(ownsTransaction)db.exec("COMMIT"); return this.getVersion(id)!;
    } catch(error){if(ownsTransaction&&db.isTransaction)db.exec("ROLLBACK");throw error;}
  }
  approveVersion(projectId:string,id:string,beforeApprove?:()=>void):ArtifactVersion|undefined {
    const db=this.database.connection,now=new Date().toISOString(),ownsTransaction=!db.isTransaction;
    if(ownsTransaction)db.exec("BEGIN IMMEDIATE");
    try{
      const version=db.prepare(`SELECT v.id,v.artifact_id,v.status,v.freshness,a.active_version_id,a.artifact_type FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? AND v.project_id=?`).get(id,projectId) as {id:string;artifact_id:string;status:string;freshness:string;active_version_id:string|null;artifact_type:string}|undefined;
      if(!version){if(ownsTransaction)db.exec("COMMIT");return undefined;}
      if(version.status==="approved"&&version.active_version_id===id){if(ownsTransaction)db.exec("COMMIT");return this.getVersion(id);}
      if(version.status!=="draft")throw new Error("Sólo una versión draft puede aprobarse.");
      if(version.freshness!=="fresh")throw new Error("La versión está obsoleta y no puede aprobarse.");
      const invalidParent=db.prepare(`SELECT parent.id FROM lineage_edges edge
        JOIN artifact_versions parent ON parent.id=edge.parent_version_id
        JOIN artifacts artifact ON artifact.id=parent.artifact_id
        WHERE edge.project_id=? AND edge.child_version_id=?
          AND (parent.freshness<>'fresh' OR artifact.active_version_id IS NULL OR artifact.active_version_id<>parent.id)
        LIMIT 1`).get(projectId,id) as {id:string}|undefined;
      if(invalidParent)throw new Error("La versión padre ya no está vigente; regenera el borrador antes de aprobarlo.");
      beforeApprove?.();
      if(version.active_version_id){db.prepare("UPDATE artifact_versions SET status='superseded' WHERE id=? AND status='approved'").run(version.active_version_id);}
      db.prepare("UPDATE artifact_versions SET status='approved' WHERE id=? AND status='draft'").run(id);
      db.prepare("UPDATE artifacts SET active_version_id=? WHERE id=? AND project_id=?").run(id,version.artifact_id,projectId);
      if(version.active_version_id)this.propagateStale(version.active_version_id,id,projectId,now);
      this.database.connection.prepare("UPDATE workflow_steps SET state='COMPLETED',stale_reason=NULL,updated_at=? WHERE project_id=? AND step_key=?").run(now,projectId,version.artifact_type);
      if(ownsTransaction)db.exec("COMMIT");return this.getVersion(id);
    }catch(error){if(ownsTransaction&&db.isTransaction)db.exec("ROLLBACK");throw error;}
  }
  archiveDraft(projectId:string,id:string):ArtifactVersion|undefined {
    const db=this.database.connection,now=new Date().toISOString();db.exec("BEGIN IMMEDIATE");
    try{
      const version=db.prepare(`SELECT v.artifact_id,v.status,a.active_version_id,a.artifact_type
        FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id
        WHERE v.id=? AND v.project_id=?`).get(id,projectId) as {artifact_id:string;status:string;active_version_id:string|null;artifact_type:string}|undefined;
      if(!version){db.exec("COMMIT");return undefined;}
      if(version.status!=="draft")throw new Error("Sólo un borrador puede archivarse; la versión aprobada permanece activa.");
      const result=db.prepare("UPDATE artifact_versions SET status='archived' WHERE id=? AND project_id=? AND status='draft'").run(id,projectId);
      if(result.changes!==1)throw new Error("El borrador cambió mientras se archivaba; vuelve a cargar el historial.");
      const latest=db.prepare("SELECT id FROM artifact_versions WHERE artifact_id=? ORDER BY version_number DESC LIMIT 1").get(version.artifact_id) as {id:string}|undefined;
      const active=version.active_version_id?db.prepare("SELECT status,freshness FROM artifact_versions WHERE id=? AND project_id=?").get(version.active_version_id,projectId) as {status:string;freshness:string}|undefined:undefined;
      if(latest?.id===id&&active?.status==="approved"&&active.freshness==="fresh"){
        db.prepare("UPDATE workflow_steps SET state='COMPLETED',stale_reason=NULL,updated_at=? WHERE project_id=? AND step_key=? AND state='IN_PROGRESS'").run(now,projectId,version.artifact_type);
      }
      db.exec("COMMIT");return this.getVersion(id);
    }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
  }
  private propagateStale(oldId:string,newId:string,projectId:string,now:string):void {
    const descendants=this.database.connection.prepare(`WITH RECURSIVE d(id) AS (SELECT child_version_id FROM lineage_edges WHERE parent_version_id=? UNION SELECT le.child_version_id FROM lineage_edges le JOIN d ON le.parent_version_id=d.id) SELECT DISTINCT d.id,a.artifact_type FROM d JOIN artifact_versions v ON v.id=d.id JOIN artifacts a ON a.id=v.artifact_id`).all(oldId) as unknown as Array<{id:string;artifact_type:string}>;
    const update=this.database.connection.prepare("UPDATE artifact_versions SET freshness='stale', stale_reason=? WHERE id=?");
    const event=this.database.connection.prepare("INSERT INTO staleness_events (id,project_id,stale_version_id,old_parent_version_id,new_parent_version_id,reason,created_at) VALUES (?,?,?,?,?,?,?)");
    for(const {id,artifact_type} of descendants){const reason=`Depende de una versión reemplazada. Existe una nueva versión del artefacto padre.`;update.run(reason,id);event.run(uuidv7(),projectId,id,oldId,newId,reason,now);this.database.connection.prepare("UPDATE workflow_steps SET state='STALE', stale_reason=?, updated_at=? WHERE project_id=? AND step_key=?").run(reason,now,projectId,artifact_type);}
  }
  list(projectId:string):ArtifactVersion[]{const rows=this.database.connection.prepare(`SELECT v.*,a.artifact_type FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.project_id=? ORDER BY v.created_at DESC`).all(projectId) as unknown as Array<Record<string,unknown>>;return rows.map((r)=>this.map(r));}
  getVersion(id:string):ArtifactVersion|undefined {const r=this.database.connection.prepare(`SELECT v.*,a.artifact_type FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=?`).get(id) as Record<string,unknown>|undefined;return r?this.map(r):undefined;}
  private map(r:Record<string,unknown>):ArtifactVersion{return {id:r.id as string,projectId:r.project_id as string,artifactId:r.artifact_id as string,artifactType:r.artifact_type as string,versionNumber:r.version_number as number,status:r.status as ArtifactVersion["status"],freshness:r.freshness as ArtifactVersion["freshness"],createdAt:r.created_at as string,inputSnapshot:JSON.parse(r.input_snapshot as string),outputData:JSON.parse(r.output_data as string),supersedesVersionId:r.supersedes_version_id as string|null,staleReason:r.stale_reason as string|null};}
}
