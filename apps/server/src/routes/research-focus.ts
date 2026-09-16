import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AppDatabase } from "../database/database.js";
import type { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";

const Params=Type.Object({id:Type.String({format:"uuid"})});
const Focus=Type.Object({value:Type.String({minLength:3,maxLength:240}),source:Type.Optional(Type.Union([Type.Literal("user"),Type.Literal("youtube_query")]))},{additionalProperties:false});

export function registerResearchFocusRoutes(app:FastifyInstance,settings:ProjectSettingsRepository,database:AppDatabase):void {
  app.get<{Params:{id:string}}>("/api/projects/:id/research-focus",{schema:{params:Params}},async(req,reply)=>{
    const focus=settings.researchFocus(req.params.id);return focus??reply.code(404).send({error:"not_found",message:"Proyecto no encontrado."});
  });
  app.put<{Params:{id:string};Body:{value:string;source?:"user"|"youtube_query"}}>("/api/projects/:id/research-focus",{schema:{params:Params,body:Focus}},async(req,reply)=>{
    const db=database.connection;
    db.exec("BEGIN IMMEDIATE");
    try{
      const previous=settings.researchFocus(req.params.id);
      const focus=settings.setResearchFocus(req.params.id,req.body.value,req.body.source??"user");
      if(!focus){db.exec("ROLLBACK");return reply.code(404).send({error:"not_found",message:"Proyecto no encontrado."});}
      if(previous?.value!==focus.value){
        // Focus changes invalidate interpretations, never sources or their evidence.
        const reason="El Research Focus cambió; vuelve a validar las interpretaciones con el foco actual.";
        db.prepare(`WITH RECURSIVE affected(id,artifact_type) AS (
          SELECT version.id,artifact.artifact_type
          FROM artifact_versions version
          JOIN artifacts artifact ON artifact.id=version.artifact_id
          WHERE artifact.project_id=? AND (artifact.artifact_type='problems'
            OR (artifact.artifact_type='research' AND json_type(version.input_snapshot,'$.researchBrief')='object'))
            AND (artifact.active_version_id=version.id OR version.status='draft')
          UNION
          SELECT edge.child_version_id,artifact.artifact_type FROM lineage_edges edge JOIN affected parent ON parent.id=edge.parent_version_id JOIN artifact_versions version ON version.id=edge.child_version_id JOIN artifacts artifact ON artifact.id=version.artifact_id
        ) UPDATE artifact_versions SET freshness='stale',stale_reason=? WHERE project_id=? AND id IN (SELECT id FROM affected)`).run(req.params.id,reason,req.params.id);
        db.prepare("UPDATE workflow_steps SET state='STALE',stale_reason=?,updated_at=? WHERE project_id=? AND step_key IN ('problems','opportunities','product','avatar','mechanism','beliefs','offer','landing','funnel','emails','content','final_product') AND state='COMPLETED'").run(reason,new Date().toISOString(),req.params.id);
        db.prepare(`UPDATE workflow_steps SET state='STALE',stale_reason=?,updated_at=?
          WHERE project_id=? AND step_key IN ('research','sources') AND EXISTS (
            SELECT 1 FROM artifacts a JOIN artifact_versions v ON v.id=a.active_version_id
            WHERE a.project_id=workflow_steps.project_id AND a.artifact_type=workflow_steps.step_key AND v.freshness='stale'
          )`).run(reason,new Date().toISOString(),req.params.id);
      }
      db.exec("COMMIT");
      return focus;
    }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
  });
}
