import type { AppDatabase } from "../database/database.js";
import { analysisSetSnapshot, deriveResearchFocus, type AnalysisSetSnapshot } from "./problem-quality-engine.js";
import { analysisSnapshotHashFromRows, researchFocusHash, sha256, type SemanticVocabularySnapshot } from "./semantic-vocabulary.js";
import { SemanticVocabularyRepository } from "../repositories/semantic-vocabulary-repository.js";
import { clusterEvidence, type LocalClusteringResult } from "./local-evidence-preprocessor.js";
import { MODULE_OUTPUT_SCHEMAS } from "./module-output-schema.js";

export interface BoundedPlan {
  projectId:string; snapshot:AnalysisSetSnapshot; snapshotHash:string; focus:string|null;
  vocabulary:SemanticVocabularySnapshot|null; clustering:LocalClusteringResult;
  maps:Record<string,unknown>[]; contextHash:string; metrics:Record<string,number>;
}
function context(db:AppDatabase,id:string):unknown {
  return {project:db.connection.prepare("SELECT name,niche,description FROM projects WHERE id=?").get(id),settings:db.connection.prepare("SELECT * FROM project_settings WHERE project_id=?").get(id),parents:db.connection.prepare("SELECT a.artifact_type,a.active_version_id,v.status,v.freshness FROM artifacts a JOIN artifact_versions v ON v.id=a.active_version_id WHERE a.project_id=? AND a.artifact_type IN ('research','sources') ORDER BY a.artifact_type").all(id)};
}
function snapshotHash(s:AnalysisSetSnapshot):string{return sha256(JSON.stringify({...s,rows:[...s.rows].sort((a,b)=>a.id.localeCompare(b.id))}));}
function freeze<T>(value:T):T {
  if(value && typeof value==="object" && !Object.isFrozen(value)){
    if(value instanceof Map){for(const item of value.values())freeze(item);}
    else for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}
export function assertFrozenPlan(db:AppDatabase,plan:BoundedPlan):void {
  if(snapshotHash(analysisSetSnapshot(db,plan.projectId))!==plan.snapshotHash || sha256(JSON.stringify(context(db,plan.projectId)))!==plan.contextHash)throw new Error("VALIDATION_SNAPSHOT_CONFLICT");
}
export function measurePayload(value:unknown):{bytes:number;estimatedTokens:number} {const text=JSON.stringify(value);return {bytes:Buffer.byteLength(text),estimatedTokens:Math.ceil(text.length/3)};}
export function assertCompact(value:unknown,limit=65_000):void {if(measurePayload(value).bytes>limit)throw new Error("VALIDATION_PAYLOAD_TOO_LARGE");}
export function validationProblemSchema(stage:string):Readonly<Record<string,unknown>> {
  const schema=structuredClone(MODULE_OUTPUT_SCHEMAS.problems) as any;
  schema.properties.items.minItems=1;
  schema.properties.items.maxItems=stage==="problems/map"?24:15;
  const p=schema.properties.items.items.properties;
  for(const [key,maxLength] of Object.entries({id:100,name:180,summary:480,category:80}))p[key]={type:"string",minLength:1,maxLength};
  p.evidenceIds={type:"array",minItems:1,maxItems:6,items:{type:"string",maxLength:100}};
  p.semanticSignature={type:"string",maxLength:160};
  return schema;
}
export function prepareBoundedPlan(db:AppDatabase,projectId:string,options:{requireVocabulary?:boolean;expectedEvidence?:number}={}):BoundedPlan {
  const start=Date.now(),snapshot=analysisSetSnapshot(db,projectId);
  if(!snapshot.rows.length || (options.expectedEvidence!==undefined && snapshot.rows.length!==options.expectedEvidence))throw new Error("UNEXPECTED_EVIDENCE_CORPUS");
  const parents=db.connection.prepare("SELECT a.artifact_type,v.status,v.freshness FROM artifacts a JOIN artifact_versions v ON v.id=a.active_version_id WHERE a.project_id=? AND a.artifact_type IN ('research','sources')").all(projectId);
  if(parents.length!==2 || parents.some(p=>p.status!=="approved"||p.freshness!=="fresh"))throw new Error("REQUIRED_PARENTS_NOT_READY");
  const project=db.connection.prepare("SELECT niche FROM projects WHERE id=?").get(projectId)!;
  const focus=(db.connection.prepare("SELECT research_focus FROM project_settings WHERE project_id=?").get(projectId)?.research_focus??null) as string|null;
  const vocabulary=new SemanticVocabularyRepository(db).loadActiveVocabularySnapshot(projectId,researchFocusHash(deriveResearchFocus([],String(project.niche),focus)),analysisSnapshotHashFromRows(snapshot.rows));
  if(vocabulary && !vocabulary.concepts.length)throw new Error("CORRUPT_VOCABULARY");
  if(!vocabulary && options.requireVocabulary)throw new Error("VOCABULARY_EXTERNAL_GENERATION_REQUIRED");
  const clustering=clusterEvidence(snapshot.rows,{strict:true});
  const traced=clustering.clusters.flatMap(c=>c.evidenceIds);
  if(traced.length!==snapshot.rows.length || new Set(traced).size!==snapshot.rows.length || snapshot.rows.some(row=>!traced.includes(row.id)))throw new Error("INCOMPLETE_LOCAL_CORPUS_PARTITION");
  // Every row stays in the local disjoint manifest. Low-information clusters are
  // explicitly excluded from LLM selection, never advertised as semantic coverage.
  const candidates=clustering.clusters.filter(c=>c.representativeEvidenceIds.length>0).slice(0,120);
  const summaries=candidates.map(c=>({clusterId:c.clusterId,evidenceCount:c.frequency,authorCount:c.authorCount,sourceCount:c.sourceCount,dominantTokens:c.dominantTokens.slice(0,5),representativeEvidenceIds:c.representativeEvidenceIds,representativeQuotes:c.representativeQuotes}));
  if(summaries.length<2)throw new Error("CANNOT_BUILD_TWO_MAP_BATCHES");
  const halves:[typeof summaries,typeof summaries]=[[],[]];
  for(const s of summaries){
    const half=halves[measurePayload(halves[0]).bytes<=measurePayload(halves[1]).bytes?0:1];
    if(measurePayload([...half,s]).bytes<=53_000)half.push(s);
  }
  const selectedIds=new Set(halves.flat().map(c=>c.clusterId));
  if(halves.some(h=>h.length===0))throw new Error("CANNOT_BUILD_TWO_MAP_BATCHES");
  const maps=halves.map((clusters,index)=>({stage:"map",researchFocus:focus??project.niche,clusters,batch:{index:index+1,total:2},localCoverage:{processed:snapshot.rows.length,eligible:snapshot.rows.length,selectedClusters:selectedIds.size,excludedClusters:clustering.clusters.length-selectedIds.size}}));
  maps.forEach(m=>assertCompact(m,55_000));
  const selected=candidates.filter(c=>selectedIds.has(c.clusterId));
  const metrics={eligibleEvidence:snapshot.rows.length,localEvidenceProcessed:traced.length,deduplicatedGroups:clustering.duplicateQuoteGroups,clusterCount:clustering.clusters.length,selectedClusterCount:selectedIds.size,evidenceInSelectedClusters:selected.reduce((n,c)=>n+c.frequency,0),representativeCount:selected.reduce((n,c)=>n+c.representativeEvidenceIds.length,0),localProcessingMs:Date.now()-start,corpusCoverage:traced.length/snapshot.rows.length*100};
  return freeze({projectId,snapshot:structuredClone(snapshot),snapshotHash:snapshotHash(snapshot),focus,vocabulary:vocabulary??null,clustering,maps,contextHash:sha256(JSON.stringify(context(db,projectId))),metrics});
}
export function compactValidationPayload(stage:string,input:Record<string,unknown>):Record<string,unknown> {
  if(stage==="problems/map"){assertCompact(input,55_000);return input;}
  if(stage==="problems/global_reduce"){
    const candidates=(input.candidates as Record<string,unknown>[]).map(c=>({id:c.id,name:c.name,category:c.category,summary:c.summary,semanticSignature:c.semanticSignature,evidenceIds:c.evidenceIds}));
    const result={stage:"global_reduce",researchFocus:input.researchFocus,candidates};assertCompact(result);return result;
  }
  const parents=input.parentOutputs as Record<string,unknown>;
  const result={moduleKey:"opportunities",project:input.project,parentOutputs:{problems:parents.problems}};assertCompact(result);return result;
}
