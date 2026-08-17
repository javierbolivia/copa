import type { AppDatabase } from "../database/database.js";
import type { SemanticVocabularySnapshot } from "./semantic-vocabulary.js";
import { domainConceptsOf } from "./semantic-vocabulary-matcher.js";

export type SupportType="DIRECT"|"INFERRED"|"CONTEXT_ONLY"|"NOT_SUPPORTED";
export type CommentKind="PROBLEM_REPORT"|"QUESTION"|"SOLUTION"|"PRAISE"|"NEUTRAL_CONTEXT";
export type ProblemStrength="SIGNAL"|"EMERGING"|"PATTERN"|"STRONG_PATTERN";
export type ResearchRelevance="CORE"|"RELATED"|"TANGENTIAL"|"OUT_OF_SCOPE";
export type ClusterAuditDecision="VALIDATED"|"REJECTED_LOW_COHESION"|"REJECTED_LOW_PRECISION"|"REJECTED_NO_SUPPORT"|"REJECTED_OUT_OF_SCOPE"|"REJECTED_MISCELLANEOUS"|"REJECTED_LOW_INTERNAL_COHERENCE";
export const PROBLEM_BATCH_SIZE=60;
export const PROBLEM_QUALITY_CONFIG={emergingAuthors:2,patternAuthors:4,strongAuthors:6,strongSources:2,coreRelevance:80,relatedRelevance:60,tangentialRelevance:40,validatedPrecision:60,tentativePrecision:40,patternStrength:55,strongStrength:75,minCohesion:55} as const;
const STOP_WORDS=new Set("de del la el los las y o en para por con un una que como sobre sus se al a es son no mi tu su this that from into foto fotos fotografia fotografias tutorial video problema usuarios user".split(" "));
const tokens=(value:string)=>new Set(value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/gu,"").match(/[\p{L}\p{N}]{3,}/gu)?.filter(word=>!STOP_WORDS.has(word))??[]);
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(word=>b.has(word));
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const text=(value:string)=>value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/gu,"");
const problemWords=/\b(no puedo|dificult|confus|lento|tarda|descart|pierdo|perdi|ruido|error|falla|limitaci|incompat|requisit|hardware|problema|costoso)\b/u;
const instructionWords=/\b(paso|duplicar|capa|desenfoque|gaussiano|haz|aplica|primero|segundo|tutorial|atajo)\b/u;
const praiseWords=/\b(gracias|excelente|genial|me encanto|utilidad|agrado|muy util|felicitaciones)\b/u;
const miscellaneousWords=/\b(varios|varias|adicionales|miscellaneous|otros problemas|etc)\b/u;
interface EvidenceRow{id:string;commentId:string;quoteText:string;author:string;sourceId:string;sourceTitle:string;likes:number;isReply:number;threadId:string|null;}
interface Candidate{id:string;name:string;summary:string;category:string;evidenceIds:string[];semanticSignature:string;relevanceScore?:number;}
export type CoreQualityConcept="PERFORMANCE_TIME"|"HARDWARE_COMPUTE"|"FILE_FORMAT";
/**
 * A quality concept is either one of the CORE GLOBAL concepts (unchanged behavior)
 * or a dynamic domain concept key coming from a vocabulary snapshot. Domain keys
 * are DATA, never hard-coded in production code, so the union is open.
 */
export type QualityConcept=CoreQualityConcept|string;
const CORE_CONCEPTS=new Set<string>(["PERFORMANCE_TIME","HARDWARE_COMPUTE","FILE_FORMAT"]);
export interface EvidenceQualityAudit {evidenceId:string;supportType:SupportType;commentKind:CommentKind;lexicalTokensShared:string[];semanticConceptsClaim:QualityConcept[];semanticConceptsEvidence:QualityConcept[];semanticConceptsShared:QualityConcept[];classifierRule:string;cohesionContribution:number;includedInCohesionDenominator:boolean;}
interface ValidatedEvidence extends EvidenceRow{supportType:SupportType;commentKind:CommentKind;quality:Omit<EvidenceQualityAudit,"evidenceId"|"cohesionContribution"|"includedInCohesionDenominator">;}
export interface ProblemPipelineMetrics {activeSources:number;rawComments:number;analysisEligibleComments:number;commentsSelectedForSemanticAnalysis:number;batchesSentToGemini:number;commentsPerBatch:number;candidateInsights:number;candidateEvidenceLinks:number;clustersBeforeValidation:number;clustersAfterMerge:number;finalProblems:number;signals:number;emerging:number;patterns:number;strongPatterns:number;corpusCoverage:number;candidateClusters:number;clustersSplitForLowCohesion:number;clustersRejectedForLowPrecision:number;evidenceRejectedInstructionOnly:number;evidenceRejectedContextOnly:number;positiveOnlyCommentsExcluded:number;validatedProblems:number;clustersRejectedNoSupport:number;clustersRejectedOutOfScope:number;clustersRejectedMiscellaneous:number;mapCandidateCount:number;postMergeClusterCount:number;validatedProblemCount:number;clustersRejectedInternalCoherence:number;}
export interface ClusterAuditRecord {clusterId:string;canonicalProblem:string;summary:string;claim:string;semanticSignature:string;category:string;evidenceIds:string[];candidateEvidenceCount:number;resolvedEvidenceCount:number;unresolvedEvidenceCount:number;unresolvedEvidenceIds:string[];evidenceCount:number;supportedEvidenceCount:number;internalComponentCount:number;largestInternalComponentSize:number;internalConnected:boolean;uniqueAuthors:number;uniqueSources:number;uniqueThreads:number;directEvidenceCount:number;inferredEvidenceCount:number;researchRelevanceScore:number;researchRelevanceLevel:ResearchRelevance;evidencePrecisionScore:number|null;cohesionScore:number|null;strengthScore:number|null;strengthLevel:ProblemStrength|null;finalDecision:ClusterAuditDecision;rejectionReason:string;evidenceQuality:EvidenceQualityAudit[];}

/** Human focus only: source titles are intentionally never turned into keyword soup. */
export function deriveResearchFocus(_titles:readonly string[],fallback:string,explicit?:string|null):string{return explicit?.trim().replace(/\s+/gu," ")||fallback.trim().replace(/\s+/gu," ")||"Investigación del proyecto";}
export function relevanceLevel(score:number):ResearchRelevance{return score>=PROBLEM_QUALITY_CONFIG.coreRelevance?"CORE":score>=PROBLEM_QUALITY_CONFIG.relatedRelevance?"RELATED":score>=PROBLEM_QUALITY_CONFIG.tangentialRelevance?"TANGENTIAL":"OUT_OF_SCOPE";}
export function createProblemBatches<T>(items:readonly T[],size=PROBLEM_BATCH_SIZE):T[][]{if(size<1)throw new Error("El tamaño de batch debe ser positivo.");const result:T[][]=[];for(let i=0;i<items.length;i+=size)result.push([...items.slice(i,i+size)]);return result;}
export function classifyCommentKind(quote:string):CommentKind{const value=text(quote);const hasProblem=problemWords.test(value);if(praiseWords.test(value)&&!hasProblem)return"PRAISE";if(instructionWords.test(value)&&!hasProblem)return"SOLUTION";if(/^\s*(que|como|cual|puedo|funciona|por que|\?)/u.test(value)||value.includes("?")||value.includes("¿"))return"QUESTION";return hasProblem?"PROBLEM_REPORT":"NEUTRAL_CONTEXT";}
const conceptMatchers:ReadonlyArray<readonly [QualityConcept,RegExp]>=[
  ["PERFORMANCE_TIME",/\b(tard\w*|demor\w*|lent\w*|rapid\w*|minut\w*|segund\w*|tiempo|tom[ao]\w*|proces\w*|rendimiento)\b/iu],
  ["HARDWARE_COMPUTE",/\b(pc|computadora\w*|ordenador\w*|equipo\w*|hardware|cpu|procesador\w*|ryzen|intel|gpu|grafica\w*|nvidia|radeon|ram)\b/iu],
  ["FILE_FORMAT",/\b(raw|jpg|jpeg|dng|tiff|formato\w*|archivo\w*)\b/iu],
];
export function normalizeQualityText(value:string,vocabularySnapshot?:SemanticVocabularySnapshot|null):{lexicalTokens:string[];semanticConcepts:QualityConcept[]}{const normalized=text(value);const core=conceptMatchers.filter(([,matcher])=>matcher.test(normalized)).map(([concept])=>concept);const domain=vocabularySnapshot?domainConceptsOf(vocabularySnapshot,value):[];return{lexicalTokens:[...tokens(value)],semanticConcepts:[...core,...domain]};}
const intersect=(a:readonly string[],b:readonly string[])=>a.filter(value=>b.includes(value));
export function analyzeEvidenceSupport(claim:string,quote:string,focus:string,vocabularySnapshot?:SemanticVocabularySnapshot|null):Omit<EvidenceQualityAudit,"evidenceId"|"cohesionContribution"|"includedInCohesionDenominator">{const commentKind=classifyCommentKind(quote),claimQuality=normalizeQualityText(claim,vocabularySnapshot),evidenceQuality=normalizeQualityText(quote,vocabularySnapshot),lexicalTokensShared=intersect(claimQuality.lexicalTokens,evidenceQuality.lexicalTokens),semanticConceptsShared=intersect(claimQuality.semanticConcepts,evidenceQuality.semanticConcepts) as QualityConcept[],hasPerformancePair=claimQuality.semanticConcepts.includes("PERFORMANCE_TIME")&&claimQuality.semanticConcepts.includes("HARDWARE_COMPUTE")&&evidenceQuality.semanticConcepts.includes("PERFORMANCE_TIME")&&evidenceQuality.semanticConcepts.includes("HARDWARE_COMPUTE");let supportType:SupportType="NOT_SUPPORTED",classifierRule="NO_SUPPORT";if(commentKind==="SOLUTION"||commentKind==="PRAISE"){supportType="CONTEXT_ONLY";classifierRule="COMMENT_KIND_CONTEXT_ONLY";}else if(hasPerformancePair){supportType="DIRECT";classifierRule="SEMANTIC_PERFORMANCE_HARDWARE_PAIR";}else if(lexicalTokensShared.length>=2){supportType="DIRECT";classifierRule="LEXICAL_OVERLAP_2";}else if(commentKind==="PROBLEM_REPORT"&&lexicalTokensShared.length===1){supportType="INFERRED";classifierRule="PROBLEM_REPORT_LEXICAL_OVERLAP_1";}else if(commentKind==="QUESTION"&&lexicalTokensShared.length>=1){supportType="DIRECT";classifierRule="QUESTION_LEXICAL_OVERLAP_1";}else if(semanticConceptsShared.length>0&&(commentKind==="QUESTION"||commentKind==="PROBLEM_REPORT")){supportType="INFERRED";classifierRule="SEMANTIC_CONCEPT_QUESTION_OR_PROBLEM_REPORT";}else if(semanticConceptsShared.length>0&&lexicalTokensShared.length>0&&commentKind!=="NEUTRAL_CONTEXT"){supportType="INFERRED";classifierRule="SEMANTIC_AND_LEXICAL_SUPPORT";}else if(intersect(normalizeQualityText(focus).lexicalTokens,evidenceQuality.lexicalTokens).length>0){supportType="CONTEXT_ONLY";classifierRule="FOCUS_CONTEXT_ONLY";}return{supportType,commentKind,lexicalTokensShared,semanticConceptsClaim:claimQuality.semanticConcepts,semanticConceptsEvidence:evidenceQuality.semanticConcepts,semanticConceptsShared,classifierRule};}
export function classifyEvidenceSupport(claim:string,quote:string,focus:string,vocabularySnapshot?:SemanticVocabularySnapshot|null):SupportType{return analyzeEvidenceSupport(claim,quote,focus,vocabularySnapshot).supportType;}
export function scoreProblem(input:{precision:number;uniqueAuthors:number;uniqueSources:number;uniqueThreads?:number;totalLikes:number;relevance:number}):number{const recurrence=Math.min(100,input.uniqueAuthors*14+Math.max(0,input.uniqueSources-1)*16+Math.max(0,(input.uniqueThreads??input.uniqueAuthors)-1)*6);const engagement=Math.min(100,Math.log10(input.totalLikes+1)*20);let score=Math.round(input.precision*.4+recurrence*.34+input.relevance*.22+engagement*.04);if(input.uniqueAuthors<=1)score=Math.min(score,35);if(input.precision<PROBLEM_QUALITY_CONFIG.tentativePrecision)score=Math.min(score,39);if(input.relevance<PROBLEM_QUALITY_CONFIG.tangentialRelevance)score=Math.min(score,30);if(input.uniqueSources===1)score=Math.min(score,74);return Math.max(0,Math.min(100,score));}
export function strengthLevel(authors:number,sources:number,strength=100):ProblemStrength{if(authors>=PROBLEM_QUALITY_CONFIG.strongAuthors&&sources>=PROBLEM_QUALITY_CONFIG.strongSources&&strength>=PROBLEM_QUALITY_CONFIG.strongStrength)return"STRONG_PATTERN";if(authors>=PROBLEM_QUALITY_CONFIG.patternAuthors&&strength>=PROBLEM_QUALITY_CONFIG.patternStrength)return"PATTERN";if(authors>=PROBLEM_QUALITY_CONFIG.emergingAuthors)return"EMERGING";return"SIGNAL";}
function normalizeSignature(value:string):string{return [...tokens(value)].sort().join("_");}
function candidate(value:unknown,index:number):Candidate|undefined{if(!isRecord(value)||typeof value.name!=="string"||typeof value.summary!=="string")return;const evidenceIds=Array.isArray(value.evidenceIds)?value.evidenceIds.filter((id):id is string=>typeof id==="string"):[];const signature=typeof value.semanticSignature==="string"&&value.semanticSignature.trim()?value.semanticSignature:normalizeSignature(`${value.name} ${value.summary}`);return{id:typeof value.id==="string"?value.id:`problem-${index+1}`,name:value.name.trim(),summary:value.summary.trim(),category:typeof value.category==="string"?value.category:"problem",evidenceIds:[...new Set(evidenceIds)],semanticSignature:normalizeSignature(signature),...(typeof value.researchRelevanceScore==="number"?{relevanceScore:Math.max(0,Math.min(100,Math.round(value.researchRelevanceScore)))}:{})};}
function similar(a:Candidate,b:Candidate):boolean{if(a.semanticSignature&&a.semanticSignature===b.semanticSignature)return true;const at=tokens(`${a.name} ${a.summary}`),bt=tokens(`${b.name} ${b.summary}`),shared=overlap(at,bt).length;return shared>=2&&shared/Math.max(1,Math.min(at.size,bt.size))>=.65;}
function isMiscellaneous(item:Candidate):boolean{return miscellaneousWords.test(text(`${item.name} ${item.summary} ${item.semanticSignature}`));}
function parsedCandidates(values:readonly unknown[]):Candidate[]{return values.map(candidate).filter((value):value is Candidate=>!!value);}
/** Global reduce merges only candidates with a coherent shared semantic signature. */
export function mergeProblemCandidates(values:readonly unknown[]):Candidate[]{const merged:Candidate[]=[];for(const item of parsedCandidates(values)){if(isMiscellaneous(item))continue;const existing=merged.find(other=>similar(item,other));if(existing){existing.evidenceIds=[...new Set([...existing.evidenceIds,...item.evidenceIds])];existing.relevanceScore=Math.max(existing.relevanceScore??0,item.relevanceScore??0);}else merged.push({...item});}return merged;}
export interface AnalysisSetSnapshot{rows:EvidenceRow[];activeSources:number;rawComments:number;eligibleComments:number}
export function analysisSetSnapshot(database:AppDatabase,projectId:string):AnalysisSetSnapshot{const db=database.connection;const rows=db.prepare(`SELECT e.id,e.comment_id commentId,e.quote_text quoteText,c.author,e.source_id sourceId,s.title sourceTitle,c.likes,c.is_reply isReply,c.thread_id threadId FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')`).all(projectId) as unknown as EvidenceRow[];const counts=db.prepare(`SELECT COUNT(DISTINCT CASE WHEN s.include_in_analysis=1 AND s.status IN ('ready','completed') THEN s.id END) activeSources,COUNT(DISTINCT c.id) rawComments,COUNT(DISTINCT CASE WHEN s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') THEN c.id END) eligibleComments FROM sources s LEFT JOIN comments c ON c.source_id=s.id AND c.project_id=s.project_id WHERE s.project_id=?`).get(projectId) as {activeSources:number;rawComments:number;eligibleComments:number};return{rows,activeSources:counts.activeSources,rawComments:counts.rawComments,eligibleComments:counts.eligibleComments};}
function relevance(claim:string,focus:string):number{const shared=overlap(tokens(claim),tokens(focus)).length;return Math.max(PROBLEM_QUALITY_CONFIG.relatedRelevance,Math.min(100,shared*34+(shared?18:10)));}
function cohesionBreakdown(evidence:readonly ValidatedEvidence[],vocabularySnapshot?:SemanticVocabularySnapshot|null):{score:number|null;details:EvidenceQualityAudit[]}{const supported=evidence.filter(row=>row.supportType==="DIRECT"||row.supportType==="INFERRED");if(!supported.length)return{score:null,details:evidence.map(row=>({...row.quality,evidenceId:row.id,cohesionContribution:0,includedInCohesionDenominator:false}))};const domainWeights=new Map<string,number>();if(vocabularySnapshot)for(const concept of vocabularySnapshot.concepts)domainWeights.set(concept.conceptKey,concept.cohesionWeight);const details=evidence.map(row=>{const included=row.supportType==="DIRECT"||row.supportType==="INFERRED",lexicalContribution=Math.min(1,row.quality.lexicalTokensShared.length/2),coreShared=row.quality.semanticConceptsShared.filter(concept=>CORE_CONCEPTS.has(concept)),domainShared=row.quality.semanticConceptsShared.filter(concept=>!CORE_CONCEPTS.has(concept)),coreContribution=Math.min(1,coreShared.length/2),domainContribution=Math.min(1,domainShared.reduce((sum,key)=>sum+(domainWeights.get(key)??0),0)),semanticContribution=Math.min(1,coreContribution+domainContribution),contribution=included?Math.max(lexicalContribution,semanticContribution):0;return{...row.quality,evidenceId:row.id,cohesionContribution:contribution,includedInCohesionDenominator:included};});const score=Math.round(details.filter(row=>row.includedInCohesionDenominator).reduce((sum,row)=>sum+row.cohesionContribution,0)/supported.length*100);return{score,details};}
/** Cohesion averages only DIRECT/INFERRED evidence; CONTEXT_ONLY and NOT_SUPPORTED are excluded from the denominator. */
function cohesion(evidence:readonly ValidatedEvidence[]):number{return cohesionBreakdown(evidence).score??0;}

interface InternalCoherenceResult{supportedEvidenceCount:number;internalComponentCount:number;largestInternalComponentSize:number;internalConnected:boolean;}
const sharedCount=(a:Set<string>,b:Set<string>)=>[...a].reduce((sum,value)=>b.has(value)?sum+1:sum,0);
/**
 * INTERNAL TOPICAL COHERENCE — deterministic, provider-free gate over the
 * evidence-to-evidence graph of a cluster's SUPPORTED evidence (DIRECT/INFERRED).
 *
 * Claim↔evidence cohesion answers "does each piece of evidence support the
 * claim?". It does NOT answer "do the pieces of evidence represent the same
 * problem as each other?". A composite claim `A + B` can get DIRECT support from
 * evidence for A and from evidence for B and still score cohesion 100 while the
 * two topics are disconnected.
 *
 * This gate closes that gap: every supported evidence is a node, and two nodes
 * are bridged only when they share independent topical signal:
 *   - lexical bridge: >= 2 shared normalized meaningful tokens (reuses `tokens()`
 *     which already drops stopwords and folds case/accents), OR
 *   - semantic bridge: >= 1 shared semantic concept, using the EXACT core
 *     semantics + vocabulary snapshot of this run (`normalizeQualityText`).
 * A bridge is NEVER the mere fact that two evidences support different parts of
 * the same claim.
 *
 * A cluster is internally coherent iff its supported evidence forms a single
 * connected component (transitive connectivity is allowed). 0 or 1 supported
 * evidence is never rejected by this gate.
 */
function internalCoherence(supported:readonly ValidatedEvidence[],vocabularySnapshot?:SemanticVocabularySnapshot|null):InternalCoherenceResult{
  const count=supported.length;
  if(count<=1)return{supportedEvidenceCount:count,internalComponentCount:count,largestInternalComponentSize:count,internalConnected:true};
  const profiles=supported.map(row=>normalizeQualityText(row.quoteText,vocabularySnapshot));
  const lexical=profiles.map(profile=>new Set(profile.lexicalTokens));
  const semantic=profiles.map(profile=>new Set(profile.semanticConcepts));
  const bridges=(a:number,b:number)=>sharedCount(lexical[a]!,lexical[b]!)>=2||sharedCount(semantic[a]!,semantic[b]!)>=1;
  const visited=new Array<boolean>(count).fill(false);
  let internalComponentCount=0,largestInternalComponentSize=0;
  for(let start=0;start<count;start++){
    if(visited[start])continue;
    internalComponentCount++;
    let size=0;const queue=[start];visited[start]=true;
    while(queue.length){const current=queue.shift()!;size++;for(let next=0;next<count;next++){if(!visited[next]&&bridges(current,next)){visited[next]=true;queue.push(next);}}}
    if(size>largestInternalComponentSize)largestInternalComponentSize=size;
  }
  return{supportedEvidenceCount:count,internalComponentCount,largestInternalComponentSize,internalConnected:internalComponentCount<=1};
}

export function qualityProblems(database:AppDatabase,projectId:string,raw:unknown,options?:{researchFocus?:string|null;metrics?:Partial<ProblemPipelineMetrics>;vocabularySnapshot?:SemanticVocabularySnapshot|null;analysisSetSnapshot?:AnalysisSetSnapshot|null}):Record<string,unknown>{
  const output=isRecord(raw)?raw:{};
  const snapshot=options?.analysisSetSnapshot ?? analysisSetSnapshot(database,projectId);
  const byId=new Map(snapshot.rows.map(row=>[row.id,row]));
  const project=database.connection.prepare("SELECT niche FROM projects WHERE id=?").get(projectId) as {niche:string}|undefined;
  const stored=database.connection.prepare("SELECT research_focus FROM project_settings WHERE project_id=?").get(projectId) as {research_focus:string|null}|undefined;
  const focus=deriveResearchFocus([],project?.niche??"",options?.researchFocus??stored?.research_focus);
  const vocabularySnapshot=options?.vocabularySnapshot??null;
  const candidates=Array.isArray(output.items)?output.items:[];
  const parsed=parsedCandidates(candidates),miscellaneous=parsed.filter(isMiscellaneous),merged=mergeProblemCandidates(candidates);
  let lowPrecision=0,instructions=0,contextOnly=0,praise=0,lowCohesion=0,noSupport=0,outOfScope=0,internalCoherenceRejected=0;
  const preMergeRejectedCandidates:ClusterAuditRecord[]=miscellaneous.map(item=>{const resolvedEvidenceIds=item.evidenceIds.filter(id=>byId.has(id)),unresolvedEvidenceIds=item.evidenceIds.filter(id=>!byId.has(id));return {clusterId:item.id,canonicalProblem:item.name,summary:item.summary,claim:`${item.name} ${item.summary}`,semanticSignature:item.semanticSignature,category:item.category,evidenceIds:item.evidenceIds,candidateEvidenceCount:item.evidenceIds.length,resolvedEvidenceCount:resolvedEvidenceIds.length,unresolvedEvidenceCount:unresolvedEvidenceIds.length,unresolvedEvidenceIds,evidenceCount:0,supportedEvidenceCount:0,internalComponentCount:0,largestInternalComponentSize:0,internalConnected:true,uniqueAuthors:0,uniqueSources:0,uniqueThreads:0,directEvidenceCount:0,inferredEvidenceCount:0,researchRelevanceScore:item.relevanceScore??relevance(`${item.name} ${item.summary}`,focus),researchRelevanceLevel:relevanceLevel(item.relevanceScore??relevance(`${item.name} ${item.summary}`,focus)),evidencePrecisionScore:null,cohesionScore:null,strengthScore:null,strengthLevel:null,finalDecision:"REJECTED_MISCELLANEOUS",rejectionReason:"Candidate represented a miscellaneous multi-problem cluster",evidenceQuality:[]};});
  const audits:ClusterAuditRecord[]=[];
  const items=merged.flatMap(item=>{
    const claim=`${item.name} ${item.summary}`;
    const classified:ValidatedEvidence[]=item.evidenceIds.flatMap(id=>{
      const row=byId.get(id);if(!row)return[];
      const quality=analyzeEvidenceSupport(claim,row.quoteText,focus,vocabularySnapshot),commentKind=quality.commentKind;
      if(commentKind==="SOLUTION")instructions++;
      if(commentKind==="PRAISE")praise++;
      const supportType=quality.supportType;
      if(supportType==="CONTEXT_ONLY")contextOnly++;
      return[{...row,commentKind,supportType,quality}];
    });
    const supported=classified.filter(row=>row.supportType==="DIRECT"||row.supportType==="INFERRED"),direct=supported.filter(row=>row.supportType==="DIRECT"),inferred=supported.filter(row=>row.supportType==="INFERRED"),authors=new Set(supported.map(row=>row.author.trim().toLocaleLowerCase("es"))),sources=new Set(supported.map(row=>row.sourceId)),threads=new Set(supported.map(row=>row.threadId??row.commentId));
    const internal=internalCoherence(supported,vocabularySnapshot);
    const relevanceScore=item.relevanceScore??relevance(claim,focus),relevanceKind=relevanceLevel(relevanceScore);
    const precision=supported.length?Math.round((direct.length+inferred.length*.7)/Math.max(1,classified.length)*100):null;
    const cohesionResult=cohesionBreakdown(classified,vocabularySnapshot),cohesionScore=cohesionResult.score;
    const likes=supported.reduce((sum,row)=>sum+row.likes,0);
    const strength=precision===null?null:scoreProblem({precision,uniqueAuthors:authors.size,uniqueSources:sources.size,uniqueThreads:threads.size,totalLikes:likes,relevance:relevanceScore});
    const level=strength===null?null:strengthLevel(authors.size,sources.size,strength);
    let finalDecision:ClusterAuditDecision="VALIDATED",rejectionReason="Validated by support, cohesion, precision and relevance gates";
    if(!supported.length){finalDecision="REJECTED_NO_SUPPORT";rejectionReason="No DIRECT/INFERRED evidence remained after validation";noSupport++;}
    else if(cohesionScore===null||cohesionScore<PROBLEM_QUALITY_CONFIG.minCohesion){finalDecision="REJECTED_LOW_COHESION";rejectionReason=`Cohesion ${cohesionScore??0} < minimum ${PROBLEM_QUALITY_CONFIG.minCohesion}`;lowCohesion++;}
    else if(precision!<PROBLEM_QUALITY_CONFIG.validatedPrecision){finalDecision="REJECTED_LOW_PRECISION";rejectionReason=`Precision ${precision} < minimum ${PROBLEM_QUALITY_CONFIG.validatedPrecision}`;lowPrecision++;}
    else if(relevanceKind==="OUT_OF_SCOPE"){finalDecision="REJECTED_OUT_OF_SCOPE";rejectionReason="Research relevance classified OUT_OF_SCOPE";outOfScope++;}
    else if(!internal.internalConnected){finalDecision="REJECTED_LOW_INTERNAL_COHERENCE";rejectionReason=`Internal topical coherence failed: ${internal.internalComponentCount} disconnected evidence components (largest ${internal.largestInternalComponentSize} of ${internal.supportedEvidenceCount} supported)`;internalCoherenceRejected++;}
    audits.push({clusterId:item.id,canonicalProblem:item.name,summary:item.summary,claim,semanticSignature:item.semanticSignature,category:item.category,evidenceIds:item.evidenceIds,candidateEvidenceCount:item.evidenceIds.length,resolvedEvidenceCount:classified.length,unresolvedEvidenceCount:item.evidenceIds.length-classified.length,unresolvedEvidenceIds:item.evidenceIds.filter(id=>!byId.has(id)),evidenceCount:classified.length,supportedEvidenceCount:supported.length,internalComponentCount:internal.internalComponentCount,largestInternalComponentSize:internal.largestInternalComponentSize,internalConnected:internal.internalConnected,uniqueAuthors:authors.size,uniqueSources:sources.size,uniqueThreads:threads.size,directEvidenceCount:direct.length,inferredEvidenceCount:inferred.length,researchRelevanceScore:relevanceScore,researchRelevanceLevel:relevanceKind,evidencePrecisionScore:precision,cohesionScore,strengthScore:strength,strengthLevel:level,finalDecision,rejectionReason,evidenceQuality:cohesionResult.details});
    if(finalDecision!=="VALIDATED")return[];
    return[{id:item.id,name:item.name,summary:item.summary,category:item.category,tags:[...new Set([item.category])],semanticSignature:item.semanticSignature,evidenceIds:supported.map(row=>row.id),quotes:supported.map(row=>row.quoteText),evidenceCount:supported.length,uniqueAuthors:authors.size,uniqueSources:sources.size,uniqueThreads:threads.size,directEvidenceCount:direct.length,inferredEvidenceCount:inferred.length,totalLikes:likes,evidencePrecisionScore:precision!,clusterCohesionScore:cohesionScore!,relevanceScore,relevanceLevel:relevanceKind,problemStrengthScore:strength!,strengthLevel:level!,evidence:supported.map(row=>({evidenceId:row.id,commentId:row.commentId,quote:row.quoteText,author:row.author,sourceTitle:row.sourceTitle,likes:row.likes,isReply:row.isReply===1,supportType:row.supportType,commentKind:row.commentKind}))}];
  });
  const count=(level:ProblemStrength)=>items.filter(item=>item.strengthLevel===level).length,selected=options?.metrics?.commentsSelectedForSemanticAnalysis??snapshot.eligibleComments;
  const metrics:ProblemPipelineMetrics={activeSources:snapshot.activeSources,rawComments:snapshot.rawComments,analysisEligibleComments:snapshot.eligibleComments,commentsSelectedForSemanticAnalysis:selected,batchesSentToGemini:options?.metrics?.batchesSentToGemini??0,commentsPerBatch:options?.metrics?.commentsPerBatch??PROBLEM_BATCH_SIZE,candidateInsights:options?.metrics?.candidateInsights??candidates.length,candidateEvidenceLinks:options?.metrics?.candidateEvidenceLinks??parsed.reduce((n,item)=>n+item.evidenceIds.length,0),clustersBeforeValidation:options?.metrics?.clustersBeforeValidation??merged.length,clustersAfterMerge:items.length,finalProblems:items.length,signals:count("SIGNAL"),emerging:count("EMERGING"),patterns:count("PATTERN"),strongPatterns:count("STRONG_PATTERN"),corpusCoverage:snapshot.eligibleComments?Number((selected/snapshot.eligibleComments*100).toFixed(1)):0,candidateClusters:merged.length,clustersSplitForLowCohesion:lowCohesion,clustersRejectedForLowPrecision:lowPrecision,evidenceRejectedInstructionOnly:instructions,evidenceRejectedContextOnly:contextOnly,positiveOnlyCommentsExcluded:praise,validatedProblems:items.length,clustersRejectedNoSupport:noSupport,clustersRejectedOutOfScope:outOfScope,clustersRejectedMiscellaneous:miscellaneous.length,mapCandidateCount:options?.metrics?.candidateInsights??candidates.length,postMergeClusterCount:merged.length,validatedProblemCount:items.length,clustersRejectedInternalCoherence:internalCoherenceRejected};
  return{...output,schemaVersion:typeof output.schemaVersion==="number"?output.schemaVersion:1,qualityAlgorithmVersion:"problem-quality-v3-hardened",researchFocus:focus,analysisMetrics:metrics,analysisAudit:{postMergeClusters:audits,preMergeRejectedCandidates},items};
}
