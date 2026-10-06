import { ApiErrorSchema, ArtifactVersionListSchema, BackupListSchema, BackupSchema, ProjectSettingsSchema, RestoreBackupSchema, UpdateProjectSettingsSchema, WorkflowSchema,
  type ApiError,type ArtifactVersion,type BackupInfo,type ProjectSettings,type RestoreBackupInput,type UpdateProjectSettingsInput,type Workflow } from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";
import type { ProjectRepository } from "../repositories/project-repository.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";
import type { BackupService } from "../services/backup-service.js";
import type { ModuleService } from "../services/module-service.js";

const Params=Type.Object({id:Type.String({format:"uuid"})});

export function registerProjectSystemRoutes(app:FastifyInstance, projects:ProjectRepository, settings:ProjectSettingsRepository, workflow:WorkflowRepository, backups:BackupService, modules:ModuleService):void {
  app.get<{Params:{id:string};Reply:ProjectSettings|ApiError}>("/api/projects/:id/settings",{schema:{params:Params,response:{200:ProjectSettingsSchema,404:ApiErrorSchema}}},async(req,reply)=>settings.get(req.params.id)??reply.code(404).send({error:"not_found",message:"Proyecto no encontrado."}));
  app.put<{Params:{id:string};Body:UpdateProjectSettingsInput;Reply:ProjectSettings|ApiError}>("/api/projects/:id/settings",{schema:{params:Params,body:UpdateProjectSettingsSchema,response:{200:ProjectSettingsSchema,404:ApiErrorSchema}}},async(req,reply)=>settings.update(req.params.id,req.body)??reply.code(404).send({error:"not_found",message:"Proyecto no encontrado."}));
  app.get<{Params:{id:string};Reply:Workflow|ApiError}>("/api/projects/:id/workflow",{schema:{params:Params,response:{200:WorkflowSchema,404:ApiErrorSchema}}},async(req,reply)=>projects.get(req.params.id)?{steps:workflow.list(req.params.id)}:reply.code(404).send({error:"not_found",message:"Proyecto no encontrado."}));
  app.get<{Params:{id:string};Reply:{versions:ArtifactVersion[]}|ApiError}>("/api/projects/:id/artifacts",{schema:{params:Params,response:{200:ArtifactVersionListSchema,404:ApiErrorSchema}}},async(req,reply)=>projects.get(req.params.id)?{versions:modules.artifactVersions(req.params.id)}:reply.code(404).send({error:"not_found",message:"Proyecto no encontrado."}));
  app.get<{Reply:{backups:BackupInfo[]}}>("/api/backups",{schema:{response:{200:BackupListSchema}}},async()=>({backups:backups.list()}));
  app.post<{Reply:BackupInfo}>("/api/backups",{schema:{response:{201:BackupSchema}}},async(_req,reply)=>reply.code(201).send(await backups.create()));
  app.post<{Body:RestoreBackupInput;Reply:{restored:BackupInfo;safetyBackup:BackupInfo}}>("/api/backups/restore",{schema:{body:RestoreBackupSchema}},async(req)=>backups.restore(req.body.filename));
}
