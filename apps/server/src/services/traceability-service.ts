import type { AppDatabase } from "../database/database.js";

export interface TraceabilityNode {
  readonly id: string;
  readonly kind: "artifact" | "evidence" | "source" | "knowledge" | "memory";
  readonly label: string;
  readonly subtitle: string | null;
  readonly artifactType: string | null;
  readonly versionNumber: number | null;
  readonly status: string | null;
  readonly freshness: string | null;
  readonly provenance: string | null;
}

export interface TraceabilityEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface TraceabilityGraph {
  readonly rootId: string;
  readonly nodes: readonly TraceabilityNode[];
  readonly edges: readonly TraceabilityEdge[];
  readonly evidenceCount: number;
  readonly sourceCount: number;
  readonly knowledgeCount: number;
  readonly memoryCount: number;
}

interface ArtifactTraceRow {
  id: string;
  artifact_type: string;
  name: string;
  version_number: number;
  status: string;
  freshness: string;
}

interface EvidenceTraceRow {
  id: string;
  target_id: string;
  quote_text: string;
  provenance: string;
  author: string | null;
  source_id: string;
  source_title: string;
  source_type: string;
}

interface EdgeRow {
  parent_version_id: string;
  child_version_id: string;
  relation: string;
}

function compact(value: string, maximum = 110): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

export class TraceabilityService {
  constructor(private readonly database: AppDatabase) {}

  get(projectId: string, rootVersionId: string): TraceabilityGraph | undefined {
    const root = this.database.connection.prepare(
      "SELECT 1 FROM artifact_versions WHERE id = ? AND project_id = ?",
    ).get(rootVersionId, projectId);
    if (!root) return undefined;

    const artifacts = this.database.connection.prepare(`
      WITH RECURSIVE upstream(id) AS (
        SELECT ?
        UNION
        SELECT edge.parent_version_id
        FROM lineage_edges edge
        JOIN upstream current ON edge.child_version_id = current.id
        WHERE edge.project_id = ?
      )
      SELECT version.id, artifact.artifact_type, artifact.name,
        version.version_number, version.status, version.freshness
      FROM upstream
      JOIN artifact_versions version ON version.id = upstream.id AND version.project_id = ?
      JOIN artifacts artifact ON artifact.id = version.artifact_id AND artifact.project_id = version.project_id
      ORDER BY version.created_at DESC
    `).all(rootVersionId, projectId, projectId) as unknown as ArtifactTraceRow[];

    const artifactIds = artifacts.map((item) => item.id);
    const placeholders = artifactIds.map(() => "?").join(",");
    const edges = artifactIds.length === 0 ? [] : this.database.connection.prepare(`
      SELECT parent_version_id, child_version_id, relation
      FROM lineage_edges
      WHERE project_id = ?
        AND parent_version_id IN (${placeholders})
        AND child_version_id IN (${placeholders})
      ORDER BY created_at
    `).all(projectId, ...artifactIds, ...artifactIds) as unknown as EdgeRow[];

    const evidence = artifactIds.length === 0 ? [] : this.database.connection.prepare(`
      SELECT snippet.id, link.target_id, snippet.quote_text, snippet.provenance,
        comment.author, source.id AS source_id, source.title AS source_title,
        source.source_type
      FROM evidence_links link
      JOIN evidence_snippets snippet
        ON snippet.id = link.source_id AND snippet.project_id = link.project_id
      JOIN sources source
        ON source.id = snippet.source_id AND source.project_id = snippet.project_id
      LEFT JOIN comments comment
        ON comment.id = snippet.comment_id AND comment.project_id = snippet.project_id
      WHERE link.project_id = ?
        AND link.target_type = 'artifact_version'
        AND link.source_type = 'evidence_snippet'
        AND link.target_id IN (${placeholders})
      ORDER BY snippet.created_at
    `).all(projectId, ...artifactIds) as unknown as EvidenceTraceRow[];

    const nodes: TraceabilityNode[] = artifacts.map((item) => ({
      id: item.id,
      kind: "artifact",
      label: `${item.name} v${item.version_number}`,
      subtitle: item.artifact_type,
      artifactType: item.artifact_type,
      versionNumber: item.version_number,
      status: item.status,
      freshness: item.freshness,
      provenance: null,
    }));
    const graphEdges: TraceabilityEdge[] = edges.map((item) => ({
      from: item.parent_version_id,
      to: item.child_version_id,
      relation: item.relation,
    }));

    const sourceIds = new Set<string>();
    const evidenceIds = new Set<string>();
    for (const item of evidence) {
      if (!sourceIds.has(item.source_id)) {
        sourceIds.add(item.source_id);
        nodes.push({
          id: item.source_id,
          kind: "source",
          label: item.source_title,
          subtitle: item.source_type === "demo" ? "Fuente Demo" : `Fuente ${item.source_type}`,
          artifactType: null,
          versionNumber: null,
          status: null,
          freshness: null,
          provenance: null,
        });
      }
      if (!evidenceIds.has(item.id)) {
        evidenceIds.add(item.id);
        nodes.push({
          id: item.id,
          kind: "evidence",
          label: compact(item.quote_text),
          subtitle: item.author ? `${item.author} · ${item.source_title}` : item.source_title,
          artifactType: null,
          versionNumber: null,
          status: null,
          freshness: null,
          provenance: item.provenance,
        });
        graphEdges.push({ from: item.source_id, to: item.id, relation: "contains" });
      }
      graphEdges.push({ from: item.id, to: item.target_id, relation: "supports" });
    }

    const knowledgeRows=artifactIds.length===0?[]:this.database.connection.prepare(`
      SELECT item.id,item.knowledge_kind,item.chunk_id,item.memory_id,log.generation_id,
        version.id target_id,chunk.content_text,chunk.heading,chunk.page_number,
        document.title document_title,library.name library_name,memory.artifact_type
      FROM knowledge_retrieval_items item
      JOIN knowledge_retrieval_logs log ON log.id=item.retrieval_log_id AND log.project_id=item.project_id
      JOIN generations generation ON generation.id=log.generation_id AND generation.project_id=log.project_id
      JOIN artifact_versions version ON version.project_id=log.project_id AND json_extract(version.input_snapshot,'$.generationId')=generation.id
      LEFT JOIN knowledge_chunks chunk ON chunk.id=item.chunk_id
      LEFT JOIN knowledge_documents document ON document.id=chunk.document_id
      LEFT JOIN knowledge_libraries library ON library.id=chunk.library_id
      LEFT JOIN approved_output_memory memory ON memory.id=item.memory_id
      WHERE item.project_id=? AND version.id IN (${placeholders}) ORDER BY item.rank_position
    `).all(projectId,...artifactIds) as unknown as Array<{id:string;knowledge_kind:string;chunk_id:string|null;memory_id:string|null;target_id:string;content_text:string|null;heading:string|null;page_number:number|null;document_title:string|null;library_name:string|null;artifact_type:string|null}>;
    const chapterKnowledgeRows=artifactIds.length===0?[]:this.database.connection.prepare(`
      SELECT item.id,item.knowledge_kind,item.chunk_id,item.memory_id,
        document_version.artifact_version_id target_id,chunk.content_text,chunk.heading,chunk.page_number,
        knowledge_document.title document_title,library.name library_name,memory.artifact_type
      FROM knowledge_retrieval_items item
      JOIN knowledge_retrieval_logs log ON log.id=item.retrieval_log_id AND log.project_id=item.project_id
      JOIN product_chapter_versions chapter_version ON chapter_version.retrieval_log_id=log.id AND chapter_version.project_id=log.project_id
      JOIN product_document_versions document_version
        ON json_extract(document_version.metadata_json,'$.sourceChapterVersionId')=chapter_version.id
        AND document_version.project_id=chapter_version.project_id
      LEFT JOIN knowledge_chunks chunk ON chunk.id=item.chunk_id
      LEFT JOIN knowledge_documents knowledge_document ON knowledge_document.id=chunk.document_id
      LEFT JOIN knowledge_libraries library ON library.id=chunk.library_id
      LEFT JOIN approved_output_memory memory ON memory.id=item.memory_id
      WHERE item.project_id=? AND document_version.artifact_version_id IN (${placeholders})
      ORDER BY item.rank_position
    `).all(projectId,...artifactIds) as unknown as typeof knowledgeRows;
    const knowledgeIds=new Set<string>(),memoryIds=new Set<string>();
    for(const item of [...knowledgeRows,...chapterKnowledgeRows]){const nodeId=item.chunk_id??item.memory_id??item.id;if(item.memory_id){if(!memoryIds.has(nodeId)){memoryIds.add(nodeId);nodes.push({id:nodeId,kind:"memory",label:`Memoria aprobada · ${item.artifact_type??"artefacto"}`,subtitle:"Output aprobado reutilizable",artifactType:item.artifact_type,versionNumber:null,status:"approved",freshness:null,provenance:"APPROVED_MEMORY"});}}else if(!knowledgeIds.has(nodeId)){knowledgeIds.add(nodeId);nodes.push({id:nodeId,kind:"knowledge",label:item.document_title??"Documento local",subtitle:[item.library_name,item.heading,item.page_number?`pág. ${item.page_number}`:null].filter(Boolean).join(" · ")||null,artifactType:null,versionNumber:null,status:"READY",freshness:null,provenance:item.knowledge_kind});}if(!graphEdges.some(edge=>edge.from===nodeId&&edge.to===item.target_id&&edge.relation==="influenced"))graphEdges.push({from:nodeId,to:item.target_id,relation:"influenced"});}

    return {
      rootId: rootVersionId,
      nodes,
      edges: graphEdges,
      evidenceCount: evidenceIds.size,
      sourceCount: sourceIds.size,
      knowledgeCount: knowledgeIds.size,
      memoryCount: memoryIds.size,
    };
  }
}
