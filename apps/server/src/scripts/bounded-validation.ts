/** Explicit single-authorization runner. Does not start the app or resume jobs. */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { AppDatabase } from "../database/database.js";
import { WORKSPACE_ROOT } from "../config.js";
import { ModuleService } from "../services/module-service.js";
import { ArtifactRepository } from "../repositories/artifact-repository.js";
import { WorkflowRepository } from "../repositories/workflow-repository.js";
import { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";
import { KnowledgeRepository } from "../repositories/knowledge-repository.js";
import { SemanticVocabularyRepository } from "../repositories/semantic-vocabulary-repository.js";
import { FileExporterService } from "../services/file-exporter-service.js";
import { OpenAIProvider } from "../integrations/openai-provider.js";
import { DeepSeekProvider } from "../integrations/deepseek-provider.js";
import { GeminiProvider } from "../integrations/gemini-provider.js";
import { ValidationSession, VALIDATION_PLAN, authorizedValidationTransport } from "../services/validation-session.js";
import { measurePayload } from "../services/bounded-validation-plan.js";

const nativeFetch=authorizedValidationTransport(globalThis.fetch);
globalThis.fetch=async()=>{throw new Error("UNPLANNED_NETWORK_FORBIDDEN");};
loadEnv({path:resolve(WORKSPACE_ROOT,".env"),quiet:true});
const projectId="01a0289f-9377-70b0-b9ac-a0eb5a9dd35a";
// This identity represents THIS authorization, never a timestamp or random UUID.
const sessionId="hallazia-bounded-validation-47fcb2c7-0842-416d-9c9c-7c066e44ace7";
const databasePath=resolve(WORKSPACE_ROOT,"data/our-platform.db");
const real=process.argv.includes("--run-once");
const git=(...args:string[])=>execFileSync("git",args,{cwd:WORKSPACE_ROOT,encoding:"utf8"}).trim();
if(real && (git("status","--porcelain") || git("log","-1","--format=%s")!=="feat: enforce bounded multi-provider validation flow"))throw new Error("IMPLEMENTATION_COMMIT_AND_CLEAN_WORKTREE_REQUIRED");
if(resolve(WORKSPACE_ROOT,process.env.DATA_DIR??"data","our-platform.db")!==databasePath)throw new Error("DATA_DIR_DOES_NOT_POINT_TO_REAL_DATABASE");
// Read-only preflight must not migrate or write anything.
const database=real?new AppDatabase(databasePath):{connection:new DatabaseSync(databasePath,{readOnly:true}),path:databasePath} as AppDatabase;
try {
  const db=database.connection;
  if(db.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")throw new Error("DB_INTEGRITY_FAILED");
  if(db.prepare("SELECT name FROM projects WHERE id=?").get(projectId)?.name!=="Perros Reactivos – Seed QA")throw new Error("WRONG_REAL_PROJECT");
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='validation_sessions'").get();
  if(exists && db.prepare("SELECT 1 FROM validation_sessions WHERE id=?").get(sessionId))throw new Error("AUTHORIZATION_ALREADY_USED_NO_SECOND_RUN");
  const options={openAI:new OpenAIProvider(),deepSeek:new DeepSeekProvider({apiKey:process.env.DEEPSEEK_API_KEY??"",model:process.env.DEEPSEEK_MODEL?.trim()||"deepseek-v4-flash",thinking:"disabled",fetch:real?nativeFetch:globalThis.fetch}),gemini:new GeminiProvider({apiKey:process.env.GEMINI_API_KEY??"",fetch:real?nativeFetch:globalThis.fetch})};
  const modules=new ModuleService(database,new ArtifactRepository(database),new WorkflowRepository(database),new FileExporterService(database,resolve(WORKSPACE_ROOT,"data")),new ProjectSettingsRepository(database),new KnowledgeRepository(database),new SemanticVocabularyRepository(database),options);
  const plan=modules.prepareValidation(projectId,3359);
  console.log(JSON.stringify({phase:"PRE-REAL-RUN",projectId,database:databasePath,implementationCommit:git("rev-parse","HEAD"),integrity:"ok",snapshotFrozen:true,snapshotHash:plan.snapshotHash,metrics:plan.metrics,mapBatches:plan.maps.length,mapPayloads:plan.maps.map(measurePayload),vocabulary:plan.vocabulary?.vocabularyVersionId??"LOCAL_CORE",deepSeekAvailable:options.deepSeek.configured,geminiAvailable:options.gemini.configured,autoFallback:false,retries:0,externalDiagnostics:0,usedRequests:0,remainingRequests:4,plan:VALIDATION_PLAN},null,2));
  if(real){
    try {await modules.executeValidation(sessionId,plan);console.log("VALIDATION_COMPLETED");}
    catch(error){console.log(JSON.stringify({validation:"STOPPED",error:error instanceof Error?error.message:"VALIDATION_FAILED"}));process.exitCode=1;}
    const session=new ValidationSession(db,sessionId);
    const row=session.row();
    console.log(JSON.stringify({session:{id:sessionId,state:row.state,usedRequests:row.used_requests,problemsStarted:row.problems_started,opportunitiesStarted:row.opportunities_started,problemsVersion:row.problems_version_id,opportunitiesVersion:row.opportunities_version_id,request5Attempted:row.request5_attempted,request5HttpEmitted:false},requests:session.requests()},null,2));
  }
}finally{database.connection.close();}
