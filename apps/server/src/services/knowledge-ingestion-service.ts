import {
  MARKET_RESEARCH_SUPPLEMENT_MAX_BYTES,
  type ImportKnowledgeDocumentInput,
  type MarketResearchSupplement,
} from "@our-platform/shared";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import type { KnowledgeRepository, KnowledgeDocument } from "../repositories/knowledge-repository.js";
import { chunkExtractedDocument, extractKnowledgeDocument, KnowledgeExtractionError } from "./knowledge/index.js";

export class KnowledgeIngestionService {
  private readonly dataRoot: string;

  constructor(private readonly database: AppDatabase, private readonly repository: KnowledgeRepository, dataRoot: string) {
    this.dataRoot = resolve(dataRoot);
  }

  async readResearchSupplement(projectId: string, documentId: string): Promise<MarketResearchSupplement | null> {
    const document = this.repository.getDocument(documentId);
    if (document?.scope !== "PROJECT" || document.projectId !== projectId ||
        document.status !== "READY" || document.documentType !== "markdown" ||
        !document.storedRelativePath || !document.fileSha256 ||
        document.bytes < 1 || document.bytes > MARKET_RESEARCH_SUPPLEMENT_MAX_BYTES) return null;

    try {
      const file = await open(this.safeAbsolutePath(document.storedRelativePath), "r");
      try {
        if ((await file.stat()).size !== document.bytes) return null;
        const buffer = Buffer.alloc(document.bytes);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead !== document.bytes || createHash("sha256").update(buffer).digest("hex") !== document.fileSha256) return null;
        return { documentId, title: document.title, markdown: buffer.toString("utf8") };
      } finally {
        await file.close();
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async import(projectId: string, libraryId: string, input: ImportKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const bytes = decodeInput(input), hash = createHash("sha256").update(bytes).digest("hex");
    const library = this.repository.getLibrary(libraryId, projectId);
    if (!library || (library.scope === "PROJECT" && library.projectId !== projectId)) throw new Error("La biblioteca no existe en este proyecto.");
    if (library.scope === "GLOBAL" && !library.selected) this.repository.selectLibrary(projectId, libraryId, true);
    const extension = safeExtension(input.filename, input.fileType);
    const relativePath = `knowledge/${libraryId}/${hash}${extension}`;
    const absolutePath = this.safeAbsolutePath(relativePath);
    const jobId = this.createJob(projectId, { libraryId, title: input.title, fileType: input.fileType, fileHash: hash });
    let document: KnowledgeDocument | undefined;
    try {
      document = this.repository.createDocument({
        libraryId, title: input.title, documentType: input.fileType === "md" ? "markdown" : input.fileType,
        description: input.description ?? null, mimeType: mimeFor(input.fileType), originalFilename: input.filename ?? null,
        storedRelativePath: relativePath, fileSha256: hash, bytes: bytes.length, importJobId: jobId,
        category: input.category ?? null, tags: input.tags ?? [], metadata: { priority: input.priority ?? library.priority },
      });
      this.startJob(jobId, projectId);
      this.writeOriginal(absolutePath, bytes);
      const extracted = await extractKnowledgeDocument({
        sourceKind: input.fileType, content: input.fileType === "manual" ? input.text ?? "" : bytes,
        ...(input.filename ? { fileName: input.filename } : {}), title: input.title,
      });
      const chunks = extracted.status === "NEEDS_OCR" ? [] : chunkExtractedDocument(extracted);
      const completed = this.repository.replaceChunks(document.id, chunks.map((chunk) => ({
        content: chunk.text, heading: chunk.headingPath.at(-1) ?? null,
        pageNumber: chunk.pageStart ?? null, tokenEstimate: chunk.estimatedTokens,
      })));
      this.completeJob(jobId, projectId, { documentId: completed.id, chunkCount: completed.chunkCount, status: completed.status, warnings: extracted.warnings });
      return completed;
    } catch (error) {
      if (document) this.repository.markDocumentFailed(document.id, errorCode(error), messageOf(error));
      this.failJob(jobId, projectId, errorCode(error), messageOf(error));
      throw error;
    }
  }

  delete(projectId: string, documentId: string): boolean {
    const row = this.database.connection.prepare(`SELECT document.stored_relative_path,document.scope FROM knowledge_documents document
      JOIN knowledge_libraries library ON library.id=document.library_id
      LEFT JOIN project_knowledge_libraries selected ON selected.library_id=library.id AND selected.project_id=?
      WHERE document.id=? AND ((document.scope='PROJECT' AND document.project_id=?) OR (document.scope='GLOBAL' AND selected.library_id IS NOT NULL))`)
      .get(projectId, documentId, projectId) as { stored_relative_path: string | null; scope:"GLOBAL"|"PROJECT" } | undefined;
    if (!row) return false;
    if(row.scope==="GLOBAL")throw new Error("Los documentos globales no pueden borrarse desde un proyecto consumidor.");
    const absolutePath = row.stored_relative_path ? this.safeAbsolutePath(row.stored_relative_path) : undefined;
    const deleted = this.repository.deleteDocument(documentId);
    if (deleted && absolutePath) rmSync(absolutePath, { force: true });
    return deleted;
  }

  private safeAbsolutePath(relativePath: string): string {
    const absolute = resolve(this.dataRoot, relativePath);
    const child = relative(this.dataRoot, absolute);
    if (!child || child === ".." || child.startsWith("../") || child.startsWith("..\\") || isAbsolute(child)) throw new Error("Ruta de conocimiento inválida.");
    return absolute;
  }

  private writeOriginal(path: string, bytes: Buffer): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${uuidv7()}.tmp`;
    writeFileSync(temporary, bytes, { flag: "wx" });
    try { renameSync(temporary, path); } catch (error) {
      rmSync(temporary, { force: true });
      if (!existsSync(path)) throw error;
    }
  }

  private createJob(projectId: string, payload: Record<string, unknown>): string {
    const id = uuidv7(), now = new Date().toISOString();
    this.database.connection.prepare(`INSERT INTO jobs
      (id,project_id,job_type,status,progress,message,payload_json,created_at,updated_at)
      VALUES(?,?,'KNOWLEDGE_IMPORT','QUEUED',0,'En cola',?,?,?)`).run(id, projectId, JSON.stringify(payload), now, now);
    return id;
  }
  private startJob(id: string, projectId: string): void { const now=new Date().toISOString();this.database.connection.prepare("UPDATE jobs SET status='RUNNING',progress=10,message='Extrayendo e indexando',attempts=attempts+1,started_at=?,updated_at=? WHERE id=? AND project_id=? AND status='QUEUED'").run(now,now,id,projectId); }
  private completeJob(id: string, projectId: string, result: Record<string, unknown>): void { const now=new Date().toISOString();this.database.connection.prepare("UPDATE jobs SET status='COMPLETED',progress=100,message='Documento indexado',result_json=?,completed_at=?,updated_at=? WHERE id=? AND project_id=? AND status='RUNNING'").run(JSON.stringify(result),now,now,id,projectId); }
  private failJob(id: string, projectId: string, code: string, message: string): void { const now=new Date().toISOString();this.database.connection.prepare("UPDATE jobs SET status='FAILED',message='Falló la importación',error_code=?,error_message=?,completed_at=?,updated_at=? WHERE id=? AND project_id=? AND status IN ('QUEUED','RUNNING')").run(code,message,now,now,id,projectId); }
}

function decodeInput(input: ImportKnowledgeDocumentInput): Buffer {
  if (input.fileType === "manual") {
    if (!input.text?.trim()) throw new Error("El texto manual es obligatorio.");
    return Buffer.from(input.text, "utf8");
  }
  if (!input.contentBase64) throw new Error("El archivo es obligatorio.");
  const value = Buffer.from(input.contentBase64, "base64");
  if (value.length === 0) throw new Error("El archivo está vacío.");
  return value;
}
function safeExtension(filename: string | undefined, fileType: ImportKnowledgeDocumentInput["fileType"]): string { const candidate=filename?extname(filename).toLowerCase():"";return /^\.[a-z0-9]{1,10}$/.test(candidate)?candidate:fileType==="manual"?".txt":`.${fileType}`; }
function mimeFor(type:ImportKnowledgeDocumentInput["fileType"]):string{return ({pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",txt:"text/plain",md:"text/markdown",html:"text/html",manual:"text/plain"} as const)[type];}
function errorCode(error:unknown):string{return error instanceof KnowledgeExtractionError?error.code:"knowledge_import_failed";}
function messageOf(error:unknown):string{return error instanceof Error?error.message:"No se pudo importar el documento.";}
