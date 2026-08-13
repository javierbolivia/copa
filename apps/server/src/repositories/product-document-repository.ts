import type {
  ProductBlock, ProductChapterStatus, ProductDocument, ProductDocumentStatus,
  ProductDocumentType, ProductDocumentVersion, ProductOutlineItem, ProductTheme,
} from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";

export const DEFAULT_PRODUCT_THEME: ProductTheme = {
  template: "minimal", accentColor: "#315EFB", typographyScale: 1,
  spacing: 1, pageSize: "A4", margins: 24,
};

interface DocumentRow {
  id:string; project_id:string; document_artifact_id:string; product_artifact_version_id:string;
  opportunity_artifact_version_id:string|null; mechanism_artifact_version_id:string|null;
  document_type:ProductDocumentType; title:string; subtitle:string|null; language:string;
  length:"short"|"medium"|"long"; level:"beginner"|"intermediate"|"advanced";
  status:ProductDocumentStatus; active_version_id:string; created_at:string; updated_at:string;
  artifact_version_id:string; freshness:"fresh"|"stale"; stale_reason:string|null;
}
interface VersionRow {id:string;document_id:string;artifact_version_id:string;version_number:number;blocks_json:string;outline_json:string;theme_json:string;metadata_json:string;revision_kind:ProductDocumentVersion["revisionKind"];created_at:string}
interface ChapterRow {id:string;document_id:string;project_id:string;title:string;objective:string;position:number;target_words:number;status:ProductChapterStatus;active_version_id:string|null;created_at:string;updated_at:string}

export class ProductDocumentRepository {
  constructor(private readonly database:AppDatabase) {}

  create(input:{
    id:string; projectId:string; documentArtifactId:string; artifactVersionId:string;
    productArtifactVersionId:string; opportunityArtifactVersionId?:string|null; mechanismArtifactVersionId?:string|null;
    documentType:ProductDocumentType; title:string; subtitle?:string|null; language:string;
    length:"short"|"medium"|"long"; level:"beginner"|"intermediate"|"advanced";
    blocks?:readonly ProductBlock[]; outline?:readonly ProductOutlineItem[]; theme?:ProductTheme;
    metadata?:Record<string,unknown>;
  }):ProductDocument {
    const db=this.database.connection,now=new Date().toISOString(),versionId=uuidv7();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO product_documents
        (id,project_id,document_artifact_id,product_artifact_version_id,opportunity_artifact_version_id,
         mechanism_artifact_version_id,document_type,title,subtitle,language,length,level,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',?,?)`).run(
          input.id,input.projectId,input.documentArtifactId,input.productArtifactVersionId,
          input.opportunityArtifactVersionId??null,input.mechanismArtifactVersionId??null,input.documentType,
          input.title.trim(),input.subtitle?.trim()||null,input.language,input.length,input.level,now,now,
        );
      db.prepare(`INSERT INTO product_document_versions
        (id,document_id,project_id,artifact_version_id,version_number,blocks_json,outline_json,theme_json,
         metadata_json,revision_kind,created_at) VALUES(?,?,?,?,1,?,?,?,?, 'WIZARD',?)`).run(
          versionId,input.id,input.projectId,input.artifactVersionId,JSON.stringify(input.blocks??[]),
          JSON.stringify(input.outline??[]),JSON.stringify(input.theme??DEFAULT_PRODUCT_THEME),
          JSON.stringify(input.metadata??{}),now,
        );
      db.prepare("UPDATE product_documents SET active_version_id=? WHERE id=?").run(versionId,input.id);
      db.exec("COMMIT");
      return this.get(input.projectId,input.id)!;
    } catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
  }

  list(projectId:string):ProductDocument[]{
    const rows=this.database.connection.prepare(this.documentSql("WHERE document.project_id=? ORDER BY document.updated_at DESC")).all(projectId) as unknown as DocumentRow[];
    return rows.map(row=>this.mapDocument(row));
  }
  get(projectId:string,id:string):ProductDocument|undefined{
    const row=this.database.connection.prepare(this.documentSql("WHERE document.project_id=? AND document.id=?")).get(projectId,id) as DocumentRow|undefined;
    return row?this.mapDocument(row):undefined;
  }
  getVersion(projectId:string,id:string):ProductDocumentVersion|undefined{
    const row=this.database.connection.prepare("SELECT * FROM product_document_versions WHERE project_id=? AND id=?").get(projectId,id) as VersionRow|undefined;
    return row?mapVersion(row):undefined;
  }
  history(projectId:string,documentId:string):ProductDocumentVersion[]{
    return (this.database.connection.prepare("SELECT * FROM product_document_versions WHERE project_id=? AND document_id=? ORDER BY version_number DESC").all(projectId,documentId) as unknown as VersionRow[]).map(mapVersion);
  }
  getIdempotentVersion(projectId:string,documentId:string,key:string):ProductDocumentVersion|undefined{
    const row=this.database.connection.prepare("SELECT * FROM product_document_versions WHERE project_id=? AND document_id=? AND idempotency_key=?").get(projectId,documentId,key) as VersionRow|undefined;
    return row?mapVersion(row):undefined;
  }

  appendVersion(input:{projectId:string;documentId:string;artifactVersionId:string;blocks:readonly ProductBlock[];outline:readonly ProductOutlineItem[];theme:ProductTheme;metadata:Record<string,unknown>;revisionKind:ProductDocumentVersion["revisionKind"];idempotencyKey?:string}):ProductDocumentVersion {
    const now=new Date().toISOString(),id=uuidv7(),db=this.database.connection,ownsTransaction=!db.isTransaction;
    if(ownsTransaction)db.exec("BEGIN IMMEDIATE");
    try{
      if(input.idempotencyKey){const found=db.prepare("SELECT * FROM product_document_versions WHERE document_id=? AND project_id=? AND idempotency_key=?").get(input.documentId,input.projectId,input.idempotencyKey) as VersionRow|undefined;if(found){if(ownsTransaction)db.exec("COMMIT");return mapVersion(found);}}
      const latest=db.prepare("SELECT COALESCE(MAX(version_number),0) n FROM product_document_versions WHERE document_id=? AND project_id=?").get(input.documentId,input.projectId) as {n:number};
      db.prepare(`INSERT INTO product_document_versions
        (id,document_id,project_id,artifact_version_id,version_number,blocks_json,outline_json,theme_json,
         metadata_json,revision_kind,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id,input.documentId,input.projectId,input.artifactVersionId,latest.n+1,JSON.stringify(input.blocks),
          JSON.stringify(input.outline),JSON.stringify(input.theme),JSON.stringify(input.metadata),
          input.revisionKind,input.idempotencyKey??null,now,
        );
      db.prepare("UPDATE product_documents SET active_version_id=?,updated_at=? WHERE id=? AND project_id=?").run(id,now,input.documentId,input.projectId);
      if(ownsTransaction)db.exec("COMMIT");return this.getVersion(input.projectId,id)!;
    }catch(error){if(ownsTransaction&&db.isTransaction)db.exec("ROLLBACK");throw error;}
  }

  setStatus(projectId:string,id:string,status:ProductDocumentStatus):void{
    const now=new Date().toISOString();
    this.database.connection.prepare(`UPDATE product_documents SET status=?,outline_approved_at=CASE WHEN ?='OUTLINE_APPROVED' THEN COALESCE(outline_approved_at,?) ELSE outline_approved_at END,approved_at=CASE WHEN ?='APPROVED' THEN COALESCE(approved_at,?) ELSE approved_at END,updated_at=? WHERE project_id=? AND id=?`).run(status,status,now,status,now,now,projectId,id);
  }
  delete(projectId:string,id:string):boolean{return Number(this.database.connection.prepare("DELETE FROM product_documents WHERE project_id=? AND id=?").run(projectId,id).changes)===1;}

  listChapters(projectId:string,documentId:string):Array<ProductOutlineItem&{activeVersionId:string|null}>{
    return (this.database.connection.prepare("SELECT * FROM product_chapters WHERE project_id=? AND document_id=? ORDER BY position").all(projectId,documentId) as unknown as ChapterRow[]).map(row=>({id:row.id,title:row.title,objective:row.objective,order:row.position,targetWords:row.target_words,status:row.status,activeVersionId:row.active_version_id}));
  }
  syncOutline(projectId:string,documentId:string,outline:readonly ProductOutlineItem[]):void{
    const db=this.database.connection,now=new Date().toISOString(),ids=new Set(outline.map(item=>item.id)),ownsTransaction=!db.isTransaction;if(ownsTransaction)db.exec("BEGIN IMMEDIATE");
    try{
      const existing=db.prepare("SELECT id FROM product_chapters WHERE project_id=? AND document_id=?").all(projectId,documentId) as unknown as Array<{id:string}>;
      for(const row of existing)if(!ids.has(row.id))db.prepare("DELETE FROM product_chapters WHERE project_id=? AND document_id=? AND id=?").run(projectId,documentId,row.id);
      db.prepare("UPDATE product_chapters SET position=position+100000 WHERE project_id=? AND document_id=?").run(projectId,documentId);
      const insert=db.prepare(`INSERT INTO product_chapters
        (id,document_id,project_id,title,objective,position,target_words,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,objective=excluded.objective,
        position=excluded.position,target_words=excluded.target_words,updated_at=excluded.updated_at
        WHERE product_chapters.document_id=excluded.document_id AND product_chapters.project_id=excluded.project_id`);
      outline.forEach((item,index)=>insert.run(item.id,documentId,projectId,item.title,item.objective,index,item.targetWords,item.status,now,now));
      if(ownsTransaction)db.exec("COMMIT");
    }catch(error){if(ownsTransaction&&db.isTransaction)db.exec("ROLLBACK");throw error;}
  }

  getChapter(projectId:string,documentId:string,chapterId:string):(ProductOutlineItem&{activeVersionId:string|null})|undefined{
    const row=this.database.connection.prepare("SELECT * FROM product_chapters WHERE project_id=? AND document_id=? AND id=?").get(projectId,documentId,chapterId) as ChapterRow|undefined;
    return row?{id:row.id,title:row.title,objective:row.objective,order:row.position,targetWords:row.target_words,status:row.status,activeVersionId:row.active_version_id}:undefined;
  }
  getChapterBlocks(projectId:string,chapterId:string):ProductBlock[]{
    const row=this.database.connection.prepare(`SELECT version.blocks_json FROM product_chapters chapter JOIN product_chapter_versions version ON version.id=chapter.active_version_id WHERE chapter.project_id=? AND chapter.id=?`).get(projectId,chapterId) as {blocks_json:string}|undefined;
    return row?JSON.parse(row.blocks_json) as ProductBlock[]:[];
  }
  appendChapterVersion(input:{projectId:string;documentId:string;chapterId:string;blocks:readonly ProductBlock[];generationId?:string|null;retrievalLogId?:string|null;promptVersion:string;provider:string;model:string}):string{
    const db=this.database.connection,now=new Date().toISOString(),id=uuidv7();
    const latest=db.prepare("SELECT COALESCE(MAX(version_number),0) n FROM product_chapter_versions WHERE chapter_id=? AND project_id=?").get(input.chapterId,input.projectId) as {n:number};
    db.exec("BEGIN IMMEDIATE");try{
      db.prepare("UPDATE product_chapter_versions SET status='SUPERSEDED' WHERE chapter_id=? AND status='APPROVED'").run(input.chapterId);
      db.prepare(`INSERT INTO product_chapter_versions
        (id,chapter_id,document_id,project_id,version_number,blocks_json,generation_id,retrieval_log_id,
         prompt_version,provider,model,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?)`).run(
          id,input.chapterId,input.documentId,input.projectId,latest.n+1,JSON.stringify(input.blocks),
          input.generationId??null,input.retrievalLogId??null,input.promptVersion,input.provider,input.model,now,
        );
      db.prepare("UPDATE product_chapters SET active_version_id=?,status='DRAFT',updated_at=? WHERE id=? AND project_id=? AND document_id=?").run(id,now,input.chapterId,input.projectId,input.documentId);
      db.exec("COMMIT");return id;
    }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
  }
  approveChapter(projectId:string,documentId:string,chapterId:string):boolean{
    const db=this.database.connection,now=new Date().toISOString();db.exec("BEGIN IMMEDIATE");try{
      const chapter=db.prepare("SELECT active_version_id FROM product_chapters WHERE project_id=? AND document_id=? AND id=?").get(projectId,documentId,chapterId) as {active_version_id:string|null}|undefined;
      if(!chapter?.active_version_id){db.exec("ROLLBACK");return false;}
      db.prepare("UPDATE product_chapter_versions SET status='SUPERSEDED' WHERE chapter_id=? AND status='APPROVED'").run(chapterId);
      db.prepare("UPDATE product_chapter_versions SET status='APPROVED' WHERE id=? AND chapter_id=?").run(chapter.active_version_id,chapterId);
      db.prepare("UPDATE product_chapters SET status='APPROVED',approved_at=?,updated_at=? WHERE id=? AND project_id=?").run(now,now,chapterId,projectId);
      db.exec("COMMIT");return true;
    }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
  }
  markChapter(projectId:string,chapterId:string,status:ProductChapterStatus):void{this.database.connection.prepare("UPDATE product_chapters SET status=?,updated_at=? WHERE project_id=? AND id=?").run(status,new Date().toISOString(),projectId,chapterId);}

  composeBlocks(projectId:string,documentId:string):ProductBlock[]{
    const chapters=this.listChapters(projectId,documentId),blocks:ProductBlock[]=[];
    for(const chapter of chapters)blocks.push(...this.getChapterBlocks(projectId,chapter.id));
    return blocks.map((block,index)=>({...block,order:index}));
  }

  private documentSql(tail:string):string{return `SELECT document.*,version.artifact_version_id,artifact_version.freshness,artifact_version.stale_reason
    FROM product_documents document JOIN product_document_versions version ON version.id=document.active_version_id
    JOIN artifact_versions artifact_version ON artifact_version.id=version.artifact_version_id ${tail}`;}
  private mapDocument(row:DocumentRow):ProductDocument{
    const version=this.getVersion(row.project_id,row.active_version_id)!;
    return {id:row.id,projectId:row.project_id,productArtifactVersionId:row.product_artifact_version_id,
      opportunityArtifactVersionId:row.opportunity_artifact_version_id,mechanismArtifactVersionId:row.mechanism_artifact_version_id,
      artifactVersionId:row.artifact_version_id,documentType:row.document_type,title:row.title,subtitle:row.subtitle,
      language:row.language,length:row.length,level:row.level,status:row.freshness==="stale"?"STALE":row.status,
      freshness:row.freshness,staleReason:row.stale_reason,activeVersionId:row.active_version_id,version,
      createdAt:row.created_at,updatedAt:row.updated_at};
  }
}

function mapVersion(row:VersionRow):ProductDocumentVersion{return {id:row.id,documentId:row.document_id,versionNumber:row.version_number,
  blocks:JSON.parse(row.blocks_json) as ProductBlock[],outline:JSON.parse(row.outline_json) as ProductOutlineItem[],
  theme:JSON.parse(row.theme_json) as ProductTheme,metadata:JSON.parse(row.metadata_json) as Record<string,string|number|boolean|null|Array<string|number|boolean|null>>,
  revisionKind:row.revision_kind,createdAt:row.created_at};}
