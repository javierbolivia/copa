import type {
  CreateProductDocumentInput,
  ProductAutosaveInput,
  ProductBlock,
  ProductDocument,
  ProductOutlineItem,
  ProductOutlineOperation,
  LlmGenerateResult,
} from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";
import type { ArtifactRepository } from "../repositories/artifact-repository.js";
import type { JobRepository } from "../repositories/job-repository.js";
import type { KnowledgeRepository } from "../repositories/knowledge-repository.js";
import type { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";
import type { OpenAIProvider } from "../integrations/openai-provider.js";
import type { DeepSeekProvider } from "../integrations/deepseek-provider.js";
import type { GeminiProvider } from "../integrations/gemini-provider.js";
import {
  ProductDocumentRepository,
  DEFAULT_PRODUCT_THEME,
} from "../repositories/product-document-repository.js";
import { getAgentKnowledgePolicy } from "./knowledge/index.js";

export class ProductStudioConflictError extends Error {}

export class ProductStudioService {
  // Cancelling a job does not finish the chapter request already in flight.
  private readonly runningBatchDocuments = new Set<string>();

  constructor(
    private readonly database: AppDatabase,
    private readonly documents: ProductDocumentRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly jobs: JobRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly settings: ProjectSettingsRepository,
    private readonly openAI: OpenAIProvider,
    private readonly deepSeek: DeepSeekProvider,
    private readonly gemini: GeminiProvider,
  ) {}

  list(projectId: string): ProductDocument[] {
    return this.documents.list(projectId);
  }
  get(projectId: string, id: string): ProductDocument | undefined {
    return this.documents.get(projectId, id);
  }
  history(projectId: string, id: string) {
    return this.documents.history(projectId, id);
  }
  estimate(projectId: string, id: string) {
    const document = this.get(projectId, id);
    if (!document) throw new Error("El documento no existe.");
    const chapters = document.version.outline.filter((item) =>
        ["PENDING", "FAILED"].includes(item.status),
      ),
      outputTokens = Math.ceil(
        chapters.reduce((sum, item) => sum + item.targetWords, 0) * 1.4,
      ),
      inputTokens = chapters.length * 2300,
      llm = this.generationProvider(projectId),
      provider = llm?.name ?? "mock",
      estimatedCost =
        llm
          ? Number(((inputTokens * 1.25 + outputTokens * 10) / 1_000_000).toFixed(4))
          : 0,
      maxBudget = this.settings.get(projectId)?.maxBudget ?? null,
      spent = (
        this.database.connection
          .prepare(
            "SELECT COALESCE(SUM(estimated_cost),0) total FROM llm_usage WHERE project_id=?",
          )
          .get(projectId) as { total: number }
      ).total;
    return {
      provider,
      model: llm ? this.generationModel(projectId, llm) : "demo-deterministic-v1",
      chapters: chapters.length,
      inputTokens,
      outputTokens,
      estimatedCost,
      currency: "USD",
      maxBudget,
      remainingBudget:
        maxBudget === null ? null : Math.max(0, maxBudget - spent),
    };
  }
  delete(projectId: string, id: string): boolean {
    const row = this.database.connection
      .prepare(
        `SELECT document.document_artifact_id,
      (SELECT COUNT(*) FROM product_assets asset WHERE asset.document_id=document.id) asset_count,
      (SELECT COUNT(*) FROM product_exports export_record WHERE export_record.document_id=document.id) export_count
      FROM product_documents document WHERE document.project_id=? AND document.id=?`,
      )
      .get(projectId, id) as
      | {
          document_artifact_id: string;
          asset_count: number;
          export_count: number;
        }
      | undefined;
    if (!row) return false;
    if (row.asset_count || row.export_count)
      throw new ProductStudioConflictError(
        "Elimina primero los assets y exports físicos mediante Product Studio.",
      );
    return (
      Number(
        this.database.connection
          .prepare(
            "DELETE FROM artifacts WHERE project_id=? AND id=? AND artifact_type='product_document'",
          )
          .run(projectId, row.document_artifact_id).changes,
      ) === 1
    );
  }

  create(
    projectId: string,
    input: CreateProductDocumentInput,
  ): ProductDocument {
    const product = this.resolveParent(
      projectId,
      "product",
      input.productArtifactVersionId,
    );
    if (!product)
      throw new Error(
        "Completa y aprueba Product antes de crear el documento.",
      );
    const opportunity = this.resolveParent(projectId, "opportunities");
    const mechanism = this.resolveParent(projectId, "mechanism");
    this.validateSelectedLibraries(
      projectId,
      input.selectedGlobalLibraryIds ?? [],
    );
    const productData = product.outputData as Record<string, unknown>;
    const selected = selectProduct(productData);
    const title =
      input.title?.trim() || stringValue(selected?.name) || "Producto digital";
    // The document can use every upstream stage when producing its outline and
    // chapters.  Capture those exact versions now: resolving the active stage
    // again during a later generation would silently mix newer research into an
    // older document and would leave that document outside stale propagation.
    const upstreamParents = this.snapshotParents(projectId, {
      product,
      ...(opportunity ? { opportunities: opportunity } : {}),
      ...(mechanism ? { mechanism } : {}),
    });
    const parentIds = [...new Set(Object.values(upstreamParents))];
    const documentId = uuidv7();
    const db = this.database.connection;
    db.exec("BEGIN IMMEDIATE");
    try {
      this.assertUpstreamContextCurrent(projectId, upstreamParents);
      const artifact = this.artifacts.createVersion({
        projectId,
        artifactType: "product_document",
        name: title,
        inputSnapshot: {
          source: "product_studio_wizard",
          documentId,
          parentVersionIds: parentIds,
          upstreamParentVersionIds: upstreamParents,
          selectedGlobalLibraryIds: input.selectedGlobalLibraryIds ?? [],
        },
        outputData: { documentId, title, documentType: input.documentType },
        parentVersionIds: parentIds,
        status: "draft",
      });
      const document = this.documents.create({
        id: documentId,
        projectId,
        documentArtifactId: artifact.artifactId,
        artifactVersionId: artifact.id,
        productArtifactVersionId: product.id,
        opportunityArtifactVersionId: opportunity?.id ?? null,
        mechanismArtifactVersionId: mechanism?.id ?? null,
        documentType: input.documentType,
        title,
        subtitle: input.subtitle ?? null,
        language: input.language,
        length: input.length,
        level: input.level,
        theme: DEFAULT_PRODUCT_THEME,
        metadata: {
          selectedGlobalLibraryIds: input.selectedGlobalLibraryIds ?? [],
          // ProductDocumentVersion metadata is intentionally scalar/flat for
          // its public schema; retain the structured lineage snapshot as JSON.
          upstreamParentVersionIds: JSON.stringify(upstreamParents),
        },
      });
      db.exec("COMMIT");
      return document;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  async generateOutline(
    projectId: string,
    documentId: string,
  ): Promise<ProductDocument> {
    const current = this.requireFresh(projectId, documentId);
    const product = this.artifacts.getVersion(
      current.productArtifactVersionId,
    )!;
    const selected = selectProduct(
      product.outputData as Record<string, unknown>,
    );
    const modules = Array.isArray(selected?.modules)
      ? selected.modules.filter(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        )
      : [];
    const titles = [
      "Introducción",
      ...(modules.length ? modules : defaultChapters(current.documentType)),
      ...(current.documentType === "workbook" ? ["Ejercicios"] : []),
      ...(current.documentType === "checklist" ? ["Checklist de acción"] : []),
      "Conclusión",
    ];
    const target = targetWords(current.length, titles.length),
      query = `${current.title} ${current.documentType} estructura ${current.level}`;
    const used = this.retrieveKnowledge(
      projectId,
      query,
      selectedGlobalIds(current),
    );
    let outline: ProductOutlineItem[], generation: RecordedGeneration;
    const llm = this.generationProvider(projectId);
    if (llm) {
      const input = {
        document: {
          title: current.title,
          type: current.documentType,
          level: current.level,
          length: current.length,
          language: current.language,
        },
        product: selected,
        parents: this.parentContext(projectId, current),
        knowledge: used.map((item, index) => ({
          citationId: `K${index + 1}`,
          title: item.title,
          content: item.content,
        })),
      };
      const startedAt = Date.now(),
        model = this.generationModel(projectId, llm);
      this.assertRequestBudget(projectId, JSON.stringify(input), 4000);
      const result = await llm.generate<{
          chapters: Array<{
            title: string;
            objective: string;
            targetWords: number;
          }>;
        }>({
          provider: llm.name,
          model,
          systemInstructions:
            "Diseña el índice y la estructura de un Ebook completo, vendible y fundamentado. Usa la investigación y contexto aprobado del proyecto, organizando la obra en introducción, capítulos temáticos prácticos, accionables y con sustancia, y conclusión. No inventes fuentes y devuelve JSON estructurado.",
          input: JSON.stringify(input),
          structuredOutput: {
            name: "product_outline",
            jsonSchema: OUTLINE_OUTPUT_SCHEMA,
            retryOnInvalidSchema: false,
          },
          maxOutputTokens: 4000,
        });
      outline = normalizeOutline(result.output.chapters, target);
      generation = this.recordProviderGeneration(
        projectId,
        "product_outline",
        query,
        input,
        outline,
        used,
        `product-outline-${llm.name}-v1`,
        model,
        result,
        Date.now() - startedAt,
        [],
        llm.name,
      );
    } else {
      outline = titles.map((title, index): ProductOutlineItem => ({
        id: uuidv7(),
        title,
        objective: `${objectiveFor(title, current.title)}${used[index % Math.max(1, used.length)] ? ` Considerar ${used[index % used.length]!.title}.` : ""}`,
        order: index,
        targetWords: target,
        status: "PENDING",
      }));
      generation = this.recordMockGeneration(
        projectId,
        "product_outline",
        query,
        outline,
        used,
        "product-outline-mock-v1",
      );
    }
    const latest = this.requireFresh(projectId, documentId);
    if (latest.activeVersionId !== current.activeVersionId)
      throw new ProductStudioConflictError(
        "El documento cambió durante la generación del outline; se conservaron tus ediciones.",
      );
    return this.saveDocumentRevision(
      current,
      [],
      outline,
      "OUTLINE",
      {
        ...current.version.metadata,
        outlineProvider: generation.provider,
        outlinePromptVersion: generation.promptVersion,
        generationId: generation.generationId,
        ...(generation.retrievalLogId
          ? { retrievalLogId: generation.retrievalLogId }
          : {}),
      },
      "OUTLINE_READY",
    );
  }

  editOutline(
    projectId: string,
    documentId: string,
    operation: ProductOutlineOperation,
  ): ProductDocument {
    const current = this.requireFresh(projectId, documentId);
    if (current.status === "APPROVED")
      throw new ProductStudioConflictError(
        "El documento aprobado no puede cambiar su outline.",
      );
    let outline = current.version.outline.map((item) => ({ ...item }));
    if (operation.operation === "add") {
      const after = operation.afterId
        ? outline.findIndex((item) => item.id === operation.afterId)
        : -1;
      const item: ProductOutlineItem = {
        id: uuidv7(),
        title: operation.title,
        objective: operation.objective ?? "",
        targetWords: operation.targetWords ?? 600,
        status: "PENDING",
        order: 0,
      };
      outline.splice(after < 0 ? outline.length : after + 1, 0, item);
    } else {
      const index = outline.findIndex((item) => item.id === operation.itemId);
      if (index < 0) throw new Error("El capítulo no existe.");
      if (operation.operation === "update")
        outline[index] = {
          ...outline[index]!,
          ...(operation.title !== undefined ? { title: operation.title } : {}),
          ...(operation.objective !== undefined
            ? { objective: operation.objective }
            : {}),
          ...(operation.targetWords !== undefined
            ? { targetWords: operation.targetWords }
            : {}),
        };
      if (operation.operation === "move") {
        const [item] = outline.splice(index, 1);
        outline.splice(Math.min(operation.toIndex, outline.length), 0, item!);
      }
      if (operation.operation === "duplicate") {
        const source = outline[index]!;
        outline.splice(index + 1, 0, {
          ...source,
          id: uuidv7(),
          title: `${source.title} (copia)`,
          status: "PENDING",
        });
      }
      if (operation.operation === "delete") outline.splice(index, 1);
    }
    outline = outline.map((item, index) => ({ ...item, order: index }));
    const blocks = operation.operation === "delete"
      ? current.version.blocks
          .filter((block) => block.metadata.chapterId !== operation.itemId)
          .map((block, order) => ({ ...block, order }))
      : current.version.blocks;
    return this.saveDocumentRevision(
      current,
      blocks,
      outline,
      "OUTLINE",
      current.version.metadata,
      "OUTLINE_READY",
    );
  }

  approveOutline(projectId: string, documentId: string): ProductDocument {
    const current = this.requireFresh(projectId, documentId);
    if (!current.version.outline.length)
      throw new Error("Genera el outline antes de aprobarlo.");
    return this.saveDocumentRevision(
      current,
      current.version.blocks,
      current.version.outline,
      "APPROVAL",
      current.version.metadata,
      "OUTLINE_APPROVED",
    );
  }

  autosave(
    projectId: string,
    documentId: string,
    input: ProductAutosaveInput,
  ): ProductDocument {
    const db = this.database.connection;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (
        this.documents.getIdempotentVersion(
          projectId,
          documentId,
          input.idempotencyKey,
        )
      ) {
        const replay = this.documents.get(projectId, documentId)!;
        db.exec("COMMIT");
        return replay;
      }
      const current = this.requireFresh(projectId, documentId);
      if (current.version.versionNumber !== input.baseVersionNumber)
        throw new ProductStudioConflictError(
          `Conflicto de autosave: la versión activa es ${current.version.versionNumber}.`,
        );
      validateBlocks(input.blocks);
      const saved = this.saveDocumentRevision(
        current,
        input.blocks,
        current.version.outline,
        "AUTOSAVE",
        {
          ...current.version.metadata,
          ...input.metadata,
          autosaveKey: input.idempotencyKey,
        },
        current.status === "APPROVED" ? "IN_PROGRESS" : current.status,
        input.idempotencyKey,
        input.theme,
      );
      db.exec("COMMIT");
      return saved;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  async generateChapter(
    projectId: string,
    documentId: string,
    chapterId: string,
  ): Promise<ProductDocument> {
    const current = this.requireFresh(projectId, documentId);
    if (!["OUTLINE_APPROVED", "IN_PROGRESS"].includes(current.status))
      throw new Error("Aprueba el outline antes de generar capítulos.");
    const chapter = this.documents.getChapter(projectId, documentId, chapterId);
    if (!chapter) throw new Error("El capítulo no existe.");
    if (chapter.status === "GENERATING")
      throw new ProductStudioConflictError("El capítulo ya se está generando.");
    this.documents.markChapter(projectId, chapterId, "GENERATING");
    try {
      const now = new Date().toISOString(),
        query = [current.title, chapter.title, chapter.objective].join(" ");
      const used = [
        ...this.retrieveKnowledge(projectId, query, selectedGlobalIds(current)),
        ...this.retrieveVideoContext(projectId, query),
      ];
      const evidence = this.retrieveEvidence(projectId, query);
      let blocks: ProductBlock[], generation: RecordedGeneration;
      const llm = this.generationProvider(projectId);
      if (llm) {
        const input = {
          document: {
            title: current.title,
            type: current.documentType,
            level: current.level,
            language: current.language,
          },
          chapter,
          outline: current.version.outline,
          parents: compactChapterParents(this.parentContext(projectId, current)),
          evidence: evidence.map((item, index) => ({
            citationId: `E${index + 1}`,
            evidenceId: item.id,
            quote: item.quoteText,
          })),
          knowledge: used.map((item, index) => ({
            citationId: `K${index + 1}`,
            title: item.title,
            content: item.content,
          })),
        };
        const startedAt = Date.now(),
          model = this.generationModel(projectId, llm),
          maxOutputTokens = Math.min(
            12_000,
            Math.max(5000, chapter.targetWords * 4),
          );
        this.assertRequestBudget(
          projectId,
          JSON.stringify(input),
          maxOutputTokens,
        );
        const result = await llm.generate<{
            blocks: Array<{
              type: ProductBlock["type"];
              content: ProductBlock["content"];
              provenance?: string;
              evidenceId?: string;
              evidenceIds?: string[];
              referenceId?: string;
            }>;
          }>({
            provider: llm.name,
            model,
            systemInstructions:
              "Escribe un capítulo práctico y desarrollado de este Ebook. No inventes casos ni atribuciones. No incluyas citas directas ni frases entrecomilladas reconstruidas; solo puedes citar literalmente un texto entregado en la entrada y enlazarlo con su UUID exacto. Para evidencia usa únicamente el UUID exacto del campo evidenceId entregado, en evidenceId/evidenceIds del bloque; nunca alias como item-1 o E1 en campos ni texto. Si no puedes asociar una afirmación con seguridad, omite la cita y marca el bloque AI_INFERENCE. No atribuyas afirmaciones a 'muchos tutores' ni al corpus sin UUID válido. Para conocimiento usa solo el referenceId exacto entregado. Nunca incluyas HTML ejecutable.",
            input: JSON.stringify(input),
            structuredOutput: {
              name: "product_chapter",
              jsonSchema: CHAPTER_OUTPUT_SCHEMA,
              retryOnInvalidSchema: false,
            },
            maxOutputTokens,
          });
        blocks = normalizeGeneratedBlocks(
          result.output.blocks,
          chapter,
          new Set(evidence.map((item) => item.id)),
          new Set(
            used.flatMap((item) =>
              [item.chunkId, item.memoryId].filter((id): id is string =>
                Boolean(id),
              ),
            ),
          ),
        );
        generation = this.recordProviderGeneration(
          projectId,
          "product_chapter",
          query,
          { documentId, chapterId, ...input },
          blocks,
          used,
          `product-chapter-${llm.name}-v4`,
          model,
          result,
          Date.now() - startedAt,
          evidence.map((item) => item.id),
          llm.name,
        );
      } else {
        blocks = mockChapterBlocks(
          chapter,
          current.title,
          used.map((item) => ({
            title: item.title,
            referenceId: item.chunkId ?? item.memoryId!,
          })),
          evidence,
        );
        generation = this.recordMockGeneration(
          projectId,
          "product_chapter",
          query,
          blocks,
          used,
          "product-chapter-mock-v1",
          {
            documentId,
            chapterId,
            evidenceIds: evidence.map((item) => item.id),
          },
        );
      }
      const latest = this.requireFresh(projectId, documentId);
      const latestChapter = this.documents.getChapter(projectId, documentId, chapterId);
      const chapterContent = (document: ProductDocument) => JSON.stringify(
        document.version.blocks
          .filter((block) => block.metadata.chapterId === chapterId)
          .map((block) => ({ ...block, order: 0 })),
      );
      if (!latestChapter || latestChapter.title !== chapter.title ||
          latestChapter.objective !== chapter.objective ||
          latestChapter.targetWords !== chapter.targetWords ||
          chapterContent(latest) !== chapterContent(current))
        throw new ProductStudioConflictError(
          "El capítulo cambió durante la generación; se conservaron tus ediciones.",
        );
      const chapterVersionId = this.documents.appendChapterVersion({
        projectId,
        documentId,
        chapterId,
        blocks,
        generationId: generation.generationId,
        retrievalLogId: generation.retrievalLogId ?? null,
        promptVersion: generation.promptVersion,
        provider: generation.provider,
        model: generation.model,
      });
      const merged = mergeChapterBlocks(
        latest.version.blocks,
        blocks,
        chapterId,
        latest.version.outline,
      );
      const saved = this.saveDocumentRevision(
        latest,
        merged,
        latest.version.outline.map((item) =>
          item.id === chapterId ? { ...item, status: "DRAFT" } : item,
        ),
        "CHAPTER",
        {
          ...latest.version.metadata,
          sourceChapterVersionId: chapterVersionId,
          generationId: generation.generationId,
        },
        "IN_PROGRESS",
      );
      for (const item of evidence)
        this.database.connection
          .prepare(
            `INSERT OR IGNORE INTO evidence_links(id,project_id,target_type,target_id,source_type,source_id,relation,created_at) VALUES(?,?,'artifact_version',?,'evidence_snippet',?,'supports',?)`,
          )
          .run(uuidv7(), projectId, saved.artifactVersionId, item.id, now);
      return saved;
    } catch (error) {
      this.documents.markChapter(projectId, chapterId, "FAILED");
      throw error;
    }
  }

  async generatePending(
    projectId: string,
    documentId: string,
  ): Promise<{ jobId: string; document: ProductDocument }> {
    const current = this.requireFresh(projectId, documentId);
    this.assertBatchIdle(documentId);
    const pending = this.documents
      .listChapters(projectId, documentId)
      .filter((item) => ["PENDING", "FAILED"].includes(item.status));
    const jobId = this.jobs.createGeneric(
      projectId,
      "product_chapters",
      {
        documentId,
        pendingChapterIds: pending.map((item) => item.id),
        nextIndex: 0,
      },
      "Capítulos pendientes en cola",
    ).id;
    this.jobs.start(projectId, jobId, "Generando capítulos pendientes");
    this.runningBatchDocuments.add(documentId);
    try {
      for (const [index, chapter] of pending.entries()) {
        if (this.jobs.isCancelled(projectId, jobId)) break;
        await this.generateChapter(projectId, documentId, chapter.id);
        this.jobs.checkpoint(
          projectId,
          jobId,
          {
            documentId,
            pendingChapterIds: pending.map((item) => item.id),
            nextIndex: index + 1,
          },
          Math.floor(((index + 1) / Math.max(1, pending.length)) * 99),
          `Capítulo ${index + 1} de ${pending.length}`,
        );
      }
      if (!this.jobs.isCancelled(projectId, jobId))
        this.jobs.complete(projectId, jobId, {
          documentId,
          completed: pending.length,
        });
    } catch (error) {
      this.jobs.fail(
        projectId,
        jobId,
        "chapter_generation_failed",
        error instanceof Error
          ? error.message
          : "Falló la generación por lote.",
      );
      throw error;
    } finally {
      this.runningBatchDocuments.delete(documentId);
    }
    return {
      jobId,
      document: this.documents.get(projectId, documentId) ?? current,
    };
  }

  async resumeBatch(
    projectId: string,
    jobId: string,
  ): Promise<{ jobId: string; document: ProductDocument }> {
    const job = this.jobs.getRecord(projectId, jobId);
    if (!job || job.jobType !== "product_chapters")
      throw new Error("El job no existe.");
    const documentId = String(job.payload.documentId);
    if (job.status === "COMPLETED") {
      const document = this.documents.get(projectId, documentId);
      if (!document) throw new Error("El documento no existe.");
      return { jobId, document };
    }
    this.assertBatchIdle(documentId);
    if (job.status === "RUNNING")
      throw new ProductStudioConflictError("El lote ya se está ejecutando.");
    this.requireFresh(projectId, documentId);
    if (job.status === "FAILED" || job.status === "CANCELLED")
      this.jobs.retry(projectId, jobId);
    const started = this.jobs.start(projectId, jobId, "Reanudando capítulos pendientes");
    if (started?.status !== "RUNNING")
      throw new ProductStudioConflictError("El lote agotó sus reintentos.");
    const ids = Array.isArray(job.payload.pendingChapterIds)
        ? job.payload.pendingChapterIds.map(String)
        : [],
      start = Number(job.payload.nextIndex ?? 0);
    this.runningBatchDocuments.add(documentId);
    try {
      for (let index = start; index < ids.length; index++) {
        if (this.jobs.isCancelled(projectId, jobId)) break;
        const chapter = this.documents.getChapter(projectId, documentId, ids[index]!);
        if (!chapter) throw new Error("El capítulo del lote ya no existe.");
        // Cancellation can arrive after the chapter was saved but before its checkpoint.
        if (!["DRAFT", "APPROVED"].includes(chapter.status))
          await this.generateChapter(projectId, documentId, chapter.id);
        this.jobs.checkpoint(
          projectId,
          jobId,
          { ...job.payload, nextIndex: index + 1 },
          Math.floor(((index + 1) / Math.max(1, ids.length)) * 99),
          `Capítulo ${index + 1} de ${ids.length}`,
        );
      }
      if (!this.jobs.isCancelled(projectId, jobId))
        this.jobs.complete(projectId, jobId, {
          documentId,
          completed: ids.length,
        });
    } catch (error) {
      this.jobs.fail(
        projectId,
        jobId,
        "chapter_generation_failed",
        error instanceof Error ? error.message : "Falló la reanudación.",
      );
      throw error;
    } finally {
      this.runningBatchDocuments.delete(documentId);
    }
    return { jobId, document: this.documents.get(projectId, documentId)! };
  }

  private assertBatchIdle(documentId: string): void {
    if (this.runningBatchDocuments.has(documentId)) {
      throw new ProductStudioConflictError("El lote anterior aún está terminando; espera antes de reanudar o generar otro lote.");
    }
  }

  approveChapter(
    projectId: string,
    documentId: string,
    chapterId: string,
  ): ProductDocument {
    const current = this.requireFresh(projectId, documentId);
    if (!this.documents.approveChapter(projectId, documentId, chapterId))
      throw new Error("Genera el capítulo antes de aprobarlo.");
    return this.saveDocumentRevision(
      current,
      current.version.blocks,
      current.version.outline.map((item) =>
        item.id === chapterId ? { ...item, status: "APPROVED" } : item,
      ),
      "APPROVAL",
      current.version.metadata,
      "IN_PROGRESS",
    );
  }
  approveDocument(projectId: string, documentId: string): ProductDocument {
    const current = this.requireFresh(projectId, documentId),
      chapters = this.documents.listChapters(projectId, documentId);
    if (
      !chapters.length ||
      chapters.some((chapter) => chapter.status !== "APPROVED")
    )
      throw new Error(
        "Aprueba todos los capítulos antes de aprobar el documento.",
      );
    const saved = this.saveDocumentRevision(
      current,
      current.version.blocks,
      current.version.outline.map((item) => ({ ...item, status: "APPROVED" })),
      "APPROVAL",
      current.version.metadata,
      "APPROVED",
    );
    this.artifacts.approveVersion(projectId, saved.artifactVersionId);
    return this.documents.get(projectId, documentId)!;
  }

  private saveDocumentRevision(
    current: ProductDocument,
    blocks: readonly ProductBlock[],
    outline: readonly ProductOutlineItem[],
    revisionKind: "OUTLINE" | "AUTOSAVE" | "CHAPTER" | "APPROVAL",
    metadata: Record<string, unknown>,
    status: ProductDocument["status"],
    idempotencyKey?: string,
    theme = current.version.theme,
  ): ProductDocument {
    validateBlocks(blocks);
    const db = this.database.connection,
      ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
    try {
      const upstreamParents = this.documentUpstreamParents(current, metadata);
      this.assertUpstreamContextCurrent(current.projectId, upstreamParents);
      const artifactRow = db
        .prepare(
          "SELECT document_artifact_id id FROM product_documents WHERE id=? AND project_id=?",
        )
        .get(current.id, current.projectId) as { id: string };
      const artifact = this.artifacts.createVersion({
        projectId: current.projectId,
        artifactType: "product_document",
        name: current.title,
        artifactId: artifactRow.id,
        inputSnapshot: {
          documentId: current.id,
          revisionKind,
          sourceVersionId: current.artifactVersionId,
          upstreamParentVersionIds: upstreamParents,
          ...(typeof metadata.generationId === "string"
            ? { generationId: metadata.generationId }
            : {}),
        },
        outputData: {
          documentId: current.id,
          blocks,
          outline,
          theme,
          metadata,
        },
        parentVersionIds: [...new Set(Object.values(upstreamParents))],
        status: "draft",
      });
      const version = this.documents.appendVersion({
        projectId: current.projectId,
        documentId: current.id,
        artifactVersionId: artifact.id,
        blocks,
        outline,
        theme,
        metadata,
        revisionKind,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      this.documents.syncOutline(current.projectId, current.id, outline);
      this.documents.setStatus(current.projectId, current.id, status);
      const saved = this.documents.get(current.projectId, current.id)!;
      if (ownsTransaction) db.exec("COMMIT");
      return saved;
    } catch (error) {
      if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  private resolveParent(projectId: string, type: string, versionId?: string) {
    if (versionId) {
      const row = this.database.connection
        .prepare(
          "SELECT active_version_id id FROM artifacts WHERE project_id=? AND artifact_type=? AND active_version_id=?",
        )
        .get(projectId, type, versionId) as { id: string } | undefined;
      const version = row ? this.artifacts.getVersion(row.id) : undefined;
      return version?.freshness === "fresh" ? version : undefined;
    }
    const row = this.database.connection
      .prepare(
        "SELECT active_version_id id FROM artifacts WHERE project_id=? AND artifact_type=? AND active_version_id IS NOT NULL ORDER BY created_at LIMIT 1",
      )
      .get(projectId, type) as { id: string } | undefined;
    const version = row ? this.artifacts.getVersion(row.id) : undefined;
    return version?.freshness === "fresh" ? version : undefined;
  }
  private requireFresh(projectId: string, documentId: string): ProductDocument {
    const current = this.documents.get(projectId, documentId);
    if (!current) throw new Error("El documento no existe.");
    if (current.freshness === "stale")
      throw new ProductStudioConflictError(
        "El documento está obsoleto; conserva sus datos pero requiere revisión.",
      );
    this.assertUpstreamContextCurrent(
      projectId,
      this.documentUpstreamParents(current, current.version.metadata),
    );
    return current;
  }

  private documentUpstreamParents(
    document: ProductDocument,
    metadata: Record<string, unknown>,
  ): Record<string, string> {
    const stored = recordValue(metadata).upstreamParentVersionIds;
    const snapshot = recordValue(
      typeof stored === "string" ? safeJson(stored) : stored,
    );
    const parents = Object.fromEntries(
      Object.entries(snapshot).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].length > 0,
      ),
    );
    if (Object.keys(parents).length) return parents;
    // Legacy documents predate the complete lineage snapshot.
    return Object.fromEntries(
      [
        ["product", document.productArtifactVersionId],
        ["opportunities", document.opportunityArtifactVersionId],
        ["mechanism", document.mechanismArtifactVersionId],
      ].filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  }

  private assertUpstreamContextCurrent(
    projectId: string,
    parents: Record<string, string>,
  ): void {
    const db = this.database.connection;
    const labels: Record<string, string> = {
      avatar: "Avatar",
      beliefs: "Creencias",
      mechanism: "Mecanismo",
      offer: "Oferta",
      landing: "Landing",
      funnel: "Funnel",
      content: "Contenido",
    };
    for (const [stage, versionId] of Object.entries(parents)) {
      const parent = db.prepare(`SELECT version.freshness,artifact.active_version_id activeVersionId
        FROM artifact_versions version JOIN artifacts artifact ON artifact.id=version.artifact_id
        WHERE version.id=? AND version.project_id=? AND artifact.artifact_type=?`)
        .get(versionId, projectId, stage) as { freshness: string; activeVersionId: string | null } | undefined;
      if (!parent || parent.freshness !== "fresh" || parent.activeVersionId !== versionId) {
        throw new ProductStudioConflictError(
          `La etapa ${labels[stage] ?? stage} cambió o quedó obsoleta; actualiza el contexto del documento.`,
        );
      }
      const drafts = db.prepare(`SELECT version.input_snapshot inputSnapshot
        FROM artifact_versions version JOIN artifacts artifact ON artifact.id=version.artifact_id
        WHERE version.project_id=? AND artifact.artifact_type=?
          AND version.status='draft' AND version.freshness='fresh'`).all(projectId, stage) as unknown as Array<{ inputSnapshot: string }>;
      for (const draft of drafts) {
        const snapshot = recordValue(JSON.parse(draft.inputSnapshot));
        const expected = snapshot.source === "user"
          ? snapshot.editedFromVersionId
          : snapshot.activeVersionIdAtStart;
        if (expected === undefined || expected === versionId) {
          throw new ProductStudioConflictError(
            `${labels[stage] ?? stage} tiene un borrador vigente pendiente de aprobación; revísalo antes de crear o generar el documento.`,
          );
        }
      }
    }
  }
  private validateSelectedLibraries(
    projectId: string,
    ids: readonly string[],
  ): void {
    const visible = new Set(
      this.knowledge
        .listLibraries(projectId)
        .filter((item) => item.scope === "GLOBAL" && item.selected)
        .map((item) => item.id),
    );
    if (ids.some((id) => !visible.has(id)))
      throw new Error(
        "Una biblioteca global seleccionada no está disponible o habilitada para este proyecto.",
      );
  }
  private retrieveKnowledge(
    projectId: string,
    query: string,
    selectedGlobalLibraryIds: readonly string[] = [],
  ): StudioContextItem[] {
    const policy = getAgentKnowledgePolicy("final_product"),
      plain = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const terms = [
      ...new Set(plain.match(/[\p{L}\p{N}]{4,}/gu)?.slice(0, 20) ?? []),
    ];
    if (!terms.length) return [];
    const allowedGlobals = new Set(selectedGlobalLibraryIds),
      found = new Map<string, StudioContextItem>();
    for (const term of terms) {
      try {
        for (const item of this.knowledge.search({
          projectId,
          query: term.replaceAll('"', ""),
          limit: policy.maxChunks * 2,
        })) {
          if (
            item.kind === "GLOBAL_KNOWLEDGE" &&
            allowedGlobals.size > 0 &&
            !allowedGlobals.has(item.libraryId)
          )
            continue;
          found.set(item.chunkId, { ...item });
        }
        for (const item of this.knowledge.searchMemory(
          projectId,
          term,
          policy.maxPerKind.approved_memory,
        ))
          found.set(item.memoryId, {
            kind: "APPROVED_MEMORY",
            content: JSON.stringify(item.output),
            title: `Memoria aprobada · ${item.artifactType}`,
            rawScore: item.rawScore,
            memoryId: item.memoryId,
            artifactVersionId: item.artifactVersionId,
          });
      } catch {
        continue;
      }
      if (found.size >= policy.maxChunks * 3) break;
    }
    const selected: StudioContextItem[] = [],
      perKind = new Map<string, number>();
    let remaining = policy.maxContextTokens * 4;
    for (const item of [...found.values()].sort(
      (a, b) => a.rawScore - b.rawScore,
    )) {
      const policyKind =
          item.kind === "PROJECT_KNOWLEDGE"
            ? "project_knowledge"
            : item.kind === "GLOBAL_KNOWLEDGE"
              ? "global_knowledge"
              : "approved_memory",
        count = perKind.get(policyKind) ?? 0;
      if (count >= policy.maxPerKind[policyKind] || remaining <= 0) continue;
      const content = item.content.slice(0, remaining);
      if (!content.trim()) continue;
      selected.push({ ...item, content });
      perKind.set(policyKind, count + 1);
      remaining -= content.length;
      if (selected.length >= policy.maxChunks) break;
    }
    return selected;
  }
  private retrieveEvidence(
    projectId: string,
    query: string,
  ): Array<{ id: string; quoteText: string }> {
    const terms = [
      ...new Set(
        query
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .match(/[\p{L}\p{N}]{5,}/gu) ?? [],
      ),
    ].slice(0, 12);
    if (!terms.length) return [];
    const clauses = terms.map(() => "lower(quote_text) LIKE ?").join(" OR ");
    return this.database.connection
      .prepare(
        `SELECT id,quote_text quoteText FROM evidence_snippets WHERE project_id=? AND (${clauses}) ORDER BY created_at LIMIT 4`,
      )
      .all(projectId, ...terms.map((term) => `%${term}%`)) as unknown as Array<{
      id: string;
      quoteText: string;
    }>;
  }
  /**
   * Video transcript segments as KNOWLEDGE context only. This is explicitly
   * NOT a form of evidence: it never touches evidence_snippets/evidence_links
   * and callers must always attribute it with provenance "KNOWLEDGE", never
   * "EVIDENCE_BACKED". A transcript describes what a video says, not
   * independent market-demand evidence. Only READY transcripts on sources
   * still included in analysis are eligible, matching the Knowledge Index's
   * own eligibility gate so a stale/removed source cannot leak in here.
   */
  private retrieveVideoContext(
    projectId: string,
    query: string,
  ): StudioContextItem[] {
    const terms = [
      ...new Set(
        query
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .match(/[\p{L}\p{N}]{4,}/gu) ?? [],
      ),
    ].slice(0, 12);
    if (!terms.length) return [];
    const clauses = terms.map(() => "lower(segment.text) LIKE ?").join(" OR ");
    const rows = this.database.connection
      .prepare(
        `SELECT segment.id segmentId, segment.source_id sourceId, segment.video_id videoId,
                segment.start_seconds startSeconds, segment.end_seconds endSeconds, segment.text text
         FROM video_transcript_segments segment
         JOIN video_transcripts transcript ON transcript.id=segment.transcript_id AND transcript.project_id=segment.project_id
         JOIN sources s ON s.id=segment.source_id AND s.project_id=segment.project_id
         WHERE segment.project_id=? AND transcript.status='ready'
           AND s.include_in_analysis=1 AND s.status IN ('ready','completed')
           AND (${clauses})
         ORDER BY segment.start_seconds LIMIT 4`,
      )
      .all(projectId, ...terms.map((term) => `%${term}%`)) as unknown as Array<{
      segmentId: string;
      sourceId: string;
      videoId: string;
      startSeconds: number;
      endSeconds: number;
      text: string;
    }>;
    const timestamp = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    return rows.map((row) => ({
      kind: "PROJECT_KNOWLEDGE" as const,
      content: row.text,
      title: `Video ${row.videoId} · ${timestamp(row.startSeconds)}–${timestamp(row.endSeconds)}`,
      rawScore: 0,
      chunkId: `video_transcript:${row.segmentId}`,
    }));
  }
  private generationProvider(projectId: string): OpenAIProvider | DeepSeekProvider | GeminiProvider | undefined {
    const preferred = this.settings.get(projectId)?.preferredLlmProvider;
    if (preferred === "mock") return undefined;
    if (preferred === "openai") {
      if (!this.openAI.configured) throw new ProductStudioConflictError("OpenAI fue seleccionado pero no está configurado.");
      return this.openAI;
    }
    if (preferred === "deepseek") {
      if (!this.deepSeek.configured) throw new ProductStudioConflictError("DeepSeek fue seleccionado pero no está configurado.");
      return this.deepSeek;
    }
    if (preferred === "gemini") {
      if (!this.gemini.configured) throw new ProductStudioConflictError("Gemini fue seleccionado pero no está configurado.");
      return this.gemini;
    }
    if (preferred && preferred !== "") {
      throw new ProductStudioConflictError(`Product Studio no admite el proveedor seleccionado: ${preferred}.`);
    }
    // Match the application-wide default provider order; legacy/demo projects
    // with no configured LLM retain their deterministic demo behavior.
    if (this.deepSeek.configured) return this.deepSeek;
    if (this.openAI.configured) return this.openAI;
    return undefined;
  }
  private generationModel(projectId: string, provider: OpenAIProvider | DeepSeekProvider | GeminiProvider): string {
    if (provider.name === "deepseek") return provider.effectiveModel;
    if (provider.name === "gemini") return provider.defaultModel;
    return this.powerfulModel(projectId);
  }
  private powerfulModel(projectId: string): string {
    return (
      this.settings.get(projectId)?.powerfulModel?.trim() ||
      process.env.OPENAI_POWERFUL_MODEL ||
      "gpt-5"
    );
  }
  private parentContext(
    projectId: string,
    document: ProductDocument,
  ): Record<string, unknown> {
    const storedParents = recordValue(document.version.metadata)
      .upstreamParentVersionIds;
    const snapshot = recordValue(
      typeof storedParents === "string" ? safeJson(storedParents) : storedParents,
    );
    const ids = Object.values(snapshot).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    const parents: Record<string, unknown> = Object.fromEntries(
      ids.map((id) => {
        const item = this.artifacts.getVersion(id);
        return [item?.artifactType ?? id, item?.outputData ?? null];
      }),
    );
    // Legacy documents predate the complete snapshot and retain their original
    // behavior. New documents always use the captured, lineage-linked context.
    const upstreamStages = [
      "research",
      "sources",
      "problems",
      "opportunities",
      "product",
      "avatar",
      "mechanism",
      "beliefs",
      "offer",
      "landing",
      "funnel",
      "content",
    ];
    for (const stage of snapshot && Object.keys(snapshot).length ? [] : upstreamStages) {
      if (!parents[stage]) {
        const resolved = this.resolveParent(projectId, stage);
        if (resolved) parents[stage] = resolved.outputData;
      }
    }
    return parents;
  }
  private snapshotParents(
    projectId: string,
    pinned: Record<string, { id: string }>,
  ): Record<string, string> {
    const stages = [
      "research", "sources", "problems", "opportunities", "product", "avatar",
      "mechanism", "beliefs", "offer", "landing", "funnel", "content",
    ];
    const result: Record<string, string> = {};
    for (const stage of stages) {
      const version = pinned[stage] ?? this.resolveParent(projectId, stage);
      if (version) result[stage] = version.id;
    }
    return result;
  }
  private recordMockGeneration(
    projectId: string,
    agentKey: string,
    query: string,
    output: unknown,
    used: readonly StudioContextItem[],
    promptVersion: string,
    extraSnapshot: Record<string, unknown> = {},
  ): RecordedGeneration {
    const generationId = uuidv7(),
      now = new Date().toISOString(),
      model = "demo-deterministic-v1";
    this.database.connection
      .prepare(
        `INSERT INTO generations(id,project_id,agent_key,provider,model,status,input_snapshot,output_data,prompt_version,input_tokens,output_tokens,estimated_cost,duration_ms,created_at,completed_at) VALUES(?,?,?,'mock',?,'COMPLETED',?,?,?,0,0,0,0,?,?)`,
      )
      .run(
        generationId,
        projectId,
        agentKey,
        model,
        JSON.stringify({ query, knowledgeUsed: used, ...extraSnapshot }),
        JSON.stringify(output),
        promptVersion,
        now,
        now,
      );
    return {
      generationId,
      ...this.recordRetrieval(projectId, generationId, agentKey, query, used),
      provider: "mock",
      model,
      promptVersion,
    };
  }
  private recordProviderGeneration(
    projectId: string,
    agentKey: string,
    query: string,
    inputSnapshot: unknown,
    output: unknown,
    used: readonly StudioContextItem[],
    promptVersion: string,
    model: string,
    result: LlmGenerateResult<unknown>,
    durationMs: number,
    evidenceIds: string[] = [],
    providerName = "openai",
  ): RecordedGeneration {
    const generationId = uuidv7(),
      now = new Date().toISOString(),
      inputTokens =
        result.usage.inputTokens ??
        Math.ceil(JSON.stringify(inputSnapshot).length / 4),
      outputTokens =
        result.usage.outputTokens ??
        Math.ceil(JSON.stringify(output).length / 4),
      estimatedCost =
        result.usage.estimatedCost ??
        Number(
          ((inputTokens * 1.25 + outputTokens * 10) / 1_000_000).toFixed(8),
        );
    this.assertBudget(projectId, estimatedCost);
    const db=this.database.connection,ownsTransaction=!db.isTransaction;if(ownsTransaction)db.exec("BEGIN IMMEDIATE");
    try{
      db.prepare(`INSERT INTO generations(id,project_id,agent_key,provider,model,status,input_snapshot,output_data,prompt_version,input_tokens,output_tokens,estimated_cost,duration_ms,created_at,completed_at) VALUES(?,?,?,?,?,'COMPLETED',?,?,?,?,?,?,?,?,?)`).run(generationId,projectId,agentKey,providerName,result.reportedModel??model,JSON.stringify({...asRecord(inputSnapshot),query,evidenceIds,knowledgeUsed:used}),JSON.stringify(output),promptVersion,inputTokens,outputTokens,estimatedCost,durationMs,now,now);
      db.prepare(`INSERT INTO llm_usage(id,project_id,generation_id,provider,model,input_tokens,output_tokens,estimated_cost,currency,is_estimate,recorded_at) VALUES(?,?,?,?,?,?,?,?, 'USD',?,?)`).run(uuidv7(),projectId,generationId,providerName,result.reportedModel??model,inputTokens,outputTokens,estimatedCost,result.usage.estimatedCost!==undefined&&result.usage.usageKind==="provider_reported"?0:1,now);
      const retrieval=this.recordRetrieval(projectId,generationId,agentKey,query,used);if(ownsTransaction)db.exec("COMMIT");return{generationId,...retrieval,provider:providerName,model:result.reportedModel??model,promptVersion};
    }catch(error){if(ownsTransaction&&db.isTransaction)db.exec("ROLLBACK");throw error;}
  }
  private recordRetrieval(
    projectId: string,
    generationId: string,
    agentKey: string,
    query: string,
    used: readonly StudioContextItem[],
  ): { retrievalLogId?: string } {
    // knowledge_retrieval_items enforces a real FK to knowledge_chunks/
    // approved_output_memory: only document/memory-backed items can be logged
    // there. Video transcript segments (synthetic "video_transcript:" chunkId,
    // no real chunk row) stay out of this relational log; they are still
    // preserved in the generation's own input_snapshot JSON (knowledgeUsed).
    const loggable = used.filter(
      (item) =>
        (item.chunkId && !item.chunkId.startsWith("video_transcript:")) ||
        item.memoryId,
    );
    if (!loggable.length) return {};
    const policy = getAgentKnowledgePolicy("final_product"),
      retrievalLogId = this.knowledge.createRetrievalLog({
        projectId,
        generationId,
        agentKey,
        query,
        policy: { ...policy, retrieval: "fts5_bm25" },
        selectedLibraryIds: [
          ...new Set(
            loggable.flatMap((item) => (item.libraryId ? [item.libraryId] : [])),
          ),
        ],
        maxChunks: policy.maxChunks,
        maxContextTokens: policy.maxContextTokens,
        contextTokenEstimate: Math.ceil(
          loggable.reduce((sum, item) => sum + item.content.length, 0) / 4,
        ),
        items: loggable.map((item) =>
          item.chunkId
            ? {
                kind: item.kind as "PROJECT_KNOWLEDGE" | "GLOBAL_KNOWLEDGE",
                chunkId: item.chunkId,
                rawScore: item.rawScore,
                tokenEstimate: Math.ceil(item.content.length / 4),
                citation: {
                  documentId: item.documentId,
                  title: item.title,
                  libraryId: item.libraryId,
                  heading: item.heading,
                  pageNumber: item.pageNumber,
                  chunkIndex: item.chunkIndex,
                  excerpt: item.content,
                },
              }
            : {
                kind: "APPROVED_MEMORY",
                memoryId: item.memoryId!,
                rawScore: item.rawScore,
                tokenEstimate: Math.ceil(item.content.length / 4),
                citation: {
                  title: item.title,
                  artifactVersionId: item.artifactVersionId,
                  excerpt: item.content,
                },
              },
        ),
      });
    return { retrievalLogId };
  }
  private assertBudget(projectId: string, nextCost: number): void {
    const max = this.settings.get(projectId)?.maxBudget;
    if (max === null || max === undefined) return;
    const spent = (
      this.database.connection
        .prepare(
          "SELECT COALESCE(SUM(estimated_cost),0) total FROM llm_usage WHERE project_id=?",
        )
        .get(projectId) as { total: number }
    ).total;
    if (spent + nextCost > max)
      throw new ProductStudioConflictError(
        `El coste estimado excede el presupuesto del proyecto (${max} USD).`,
      );
  }
  private assertRequestBudget(
    projectId: string,
    input: string,
    maxOutputTokens: number,
  ): void {
    const conservativeInputTokens = Math.max(
        100,
        Math.ceil((input.length / 4) * 1.2),
      ),
      estimated = Number(
        (
          (conservativeInputTokens * 1.25 + maxOutputTokens * 10) /
          1_000_000
        ).toFixed(8),
      );
    this.assertBudget(projectId, estimated);
  }
}

function selectProduct(
  output: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const items = Array.isArray(output.proposals)
    ? (output.proposals as Record<string, unknown>[])
    : [];
  return items.find((item) => item.id === output.selectedId) ?? items[0];
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function defaultChapters(type: string): string[] {
  return type === "checklist"
    ? ["Preparación", "Acciones", "Verificación"]
    : ["Fundamentos", "Plan de acción", "Implementación", "Revisión"];
}
function targetWords(length: string, count: number): number {
  return Math.max(
    200,
    Math.round(
      ({ short: 3000, medium: 7000, long: 14000 }[length] ?? 7000) /
        Math.max(1, count),
    ),
  );
}
function objectiveFor(title: string, documentTitle: string): string {
  return `Desarrollar ${title.toLowerCase()} para ayudar al lector de ${documentTitle}.`;
}
function validateBlocks(blocks: readonly ProductBlock[]): void {
  const ids = new Set<string>();
  for (const [index, block] of blocks.entries()) {
    if (ids.has(block.id)) throw new Error("Los bloques no pueden repetir id.");
    ids.add(block.id);
    if (block.order !== index)
      throw new Error("El orden de bloques debe ser continuo.");
    const serialized = JSON.stringify(block);
    if (/<\s*script|javascript\s*:|\bon[a-z]+\s*=/i.test(serialized))
      throw new Error("El bloque contiene contenido ejecutable no permitido.");
  }
}
interface StudioContextItem {
  kind: "PROJECT_KNOWLEDGE" | "GLOBAL_KNOWLEDGE" | "APPROVED_MEMORY";
  content: string;
  title: string;
  rawScore: number;
  chunkId?: string;
  memoryId?: string;
  documentId?: string;
  libraryId?: string;
  heading?: string | null;
  pageNumber?: number | null;
  chunkIndex?: number;
  artifactVersionId?: string;
}
interface RecordedGeneration {
  generationId: string;
  retrievalLogId?: string;
  provider: string;
  model: string;
  promptVersion: string;
}
const BLOCK_TYPES: ProductBlock["type"][] = [
  "heading",
  "paragraph",
  "bulletList",
  "numberedList",
  "checklist",
  "quote",
  "callout",
  "image",
  "table",
  "divider",
  "pageBreak",
  "exercise",
  "question",
  "keyTakeaway",
  "diagram",
  "sourceReference",
  "CTA",
];
const OUTLINE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: {
    chapters: {
      type: "array",
      minItems: 2,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "objective", "targetWords"],
        properties: {
          title: { type: "string" },
          objective: { type: "string" },
          targetWords: { type: "integer" },
        },
      },
    },
  },
} as const;
const CHAPTER_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["blocks"],
  properties: {
    blocks: {
      type: "array",
      minItems: 2,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "content"],
        properties: {
          type: { type: "string", enum: BLOCK_TYPES },
          content: { type: "string" },
          provenance: {
            type: "string",
            enum: ["AI_INFERENCE", "EVIDENCE_BACKED", "KNOWLEDGE"],
          },
          evidenceId: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" }, maxItems: 20 },
          referenceId: { type: "string" },
        },
      },
    },
  },
} as const;
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { input: value };
}

/**
 * Chapter prompts need a small project brief, not every raw upstream record.
 * In particular, Problems artifacts can embed hundreds of full comments per
 * item. Sending those verbatim costs tokens without helping chapter drafting.
 */
export function compactChapterParents(
  parents: Record<string, unknown>,
): Record<string, unknown> {
  const omitKey = /^(?:evidence|evidenceIds|quotes?|comments?|rawText|transcript)$/iu;
  const compact = (
    value: unknown,
    stringLimit: number,
    arrayLimit: number,
    depth: number,
    key = "",
  ): unknown => {
    if (omitKey.test(key) || depth > 6) return undefined;
    if (typeof value === "string") return value.slice(0, stringLimit);
    if (value === null || typeof value === "number" || typeof value === "boolean")
      return value;
    if (Array.isArray(value))
      return value.slice(0, arrayLimit).map((item) =>
        compact(item, stringLimit, arrayLimit, depth + 1),
      );
    if (typeof value !== "object") return undefined;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .flatMap(([childKey, child]) => {
          const result = compact(child, stringLimit, arrayLimit, depth + 1, childKey);
          return result === undefined ? [] : [[childKey, result]];
        }),
    );
  };

  const result: Record<string, unknown> = {};
  for (const [stage, value] of Object.entries(parents)) {
    for (const [stringLimit, arrayLimit] of [[400, 5], [180, 3], [80, 2]] as const) {
      const candidate = compact(value, stringLimit, arrayLimit, 0);
      if (JSON.stringify(candidate).length <= 1_600) {
        result[stage] = candidate;
        break;
      }
    }
  }
  return result;
}

function normalizeOutline(
  items: Array<{ title: string; objective: string; targetWords: number }>,
  fallbackTarget: number,
): ProductOutlineItem[] {
  return items
    .slice(0, 40)
    .map((item, index) => ({
      id: uuidv7(),
      title: String(item.title).trim().slice(0, 300) || `Capítulo ${index + 1}`,
      objective: String(item.objective).trim().slice(0, 2000),
      order: index,
      targetWords: Number.isInteger(item.targetWords)
        ? Math.max(50, Math.min(50_000, item.targetWords))
        : fallbackTarget,
      status: "PENDING",
    }));
}
export function normalizeGeneratedBlocks(
  items: Array<{
    type: ProductBlock["type"];
    content: ProductBlock["content"];
    provenance?: string;
    evidenceId?: string;
    evidenceIds?: string[];
    referenceId?: string;
  }>,
  chapter: ProductOutlineItem,
  evidenceIds: Set<string>,
  referenceIds: Set<string>,
): ProductBlock[] {
  const now = new Date().toISOString();
  const blocks = items.slice(0, 100).map((item, index): ProductBlock => {
    const type = BLOCK_TYPES.includes(item.type) ? item.type : "paragraph",
      validEvidenceIds = [...new Set([
        ...(item.evidenceIds ?? []),
        ...(item.evidenceId ? [item.evidenceId] : []),
      ].filter((id) => evidenceIds.has(id)))].slice(0, 20),
      evidenceId = validEvidenceIds[0],
      referenceId =
        item.referenceId && referenceIds.has(item.referenceId)
          ? item.referenceId
          : undefined,
      content = typeof item.content === "string" ? item.content : "",
      hasVerifiedReference = validEvidenceIds.length > 0 || Boolean(referenceId),
      provenance = evidenceId
        ? "EVIDENCE_BACKED"
        : referenceId
          ? "KNOWLEDGE"
          : "AI_INFERENCE";
    if (/\bitem-\d+\b|\bitems?\s+\d+(?:\s*[,;]\s*\d+)+/iu.test(content))
      throw new Error("La salida incluye alias de evidencia no permitidos.");
    if (!hasVerifiedReference && (
      type === "quote" || type === "sourceReference" ||
      /["“][^"”\n]{25,}["”]|(?<!\p{L})['‘][^'’\n]{25,}['’](?!\p{L})/u.test(content) ||
      /\b(?:en|seg[uú]n)\s+(?:(?:los|las|el|la)\s+)?(?:relatos|testimonios|comentarios|corpus|experiencias)\b|\b(?:un|una|otro|otra|muchos|varios)\s+(?:tutor(?:es)?|dueñ[oa]s?|personas?|usuarios?|comentarios?|relatos?|testimonios?|casos?)\s+(?:describe|describen|reporta|reportan|relata|relatan|explica|explican|pregunta|preguntan|comenta|comentan|señala|señalan|menciona|mencionan|recoge|recogen)\b|\b(?:los relatos|se reporta|se recoge|como menciona un tutor)\b/iu.test(content)
    ))
      throw new Error("La salida incluye una cita o atribución sin referencia verificable.");
    return {
      id: uuidv7(),
      type,
      content,
      order: index,
      metadata: {
        chapterId: chapter.id,
        provenance,
        ...(evidenceId ? { evidenceId } : {}),
        ...(validEvidenceIds.length ? { evidenceIds: validEvidenceIds } : {}),
        ...(referenceId ? { referenceId } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
  });
  validateBlocks(blocks);
  if (!blocks.length) throw new Error("OpenAI no produjo bloques utilizables.");
  return blocks;
}
function selectedGlobalIds(document: ProductDocument): string[] {
  const value = document.version.metadata.selectedGlobalLibraryIds;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}
function mockChapterBlocks(
  chapter: ProductOutlineItem,
  title: string,
  sources: ReadonlyArray<{ title: string; referenceId: string }>,
  evidence: ReadonlyArray<{ id: string; quoteText: string }>,
): ProductBlock[] {
  const now = new Date().toISOString();
  const make = (
    type: ProductBlock["type"],
    content: ProductBlock["content"],
    metadata: ProductBlock["metadata"] = {},
  ): ProductBlock => ({
    id: uuidv7(),
    type,
    content,
    order: 0,
    metadata: { ...metadata, chapterId: chapter.id },
    createdAt: now,
    updatedAt: now,
  });
  const blocks = [
    make("heading", chapter.title, { level: 1 }),
    make(
      "paragraph",
      `${chapter.objective} Este capítulo forma parte de ${title} y propone un avance práctico y verificable.`,
      { provenance: "AI_INFERENCE" },
    ),
    make(
      "keyTakeaway",
      `Convierte ${chapter.title.toLowerCase()} en una acción pequeña, observable y revisable.`,
      { provenance: "AI_INFERENCE" },
    ),
  ];
  for (const item of evidence.slice(0, 2))
    blocks.push(
      make("quote", item.quoteText, {
        evidenceId: item.id,
        provenance: "EVIDENCE_BACKED",
      }),
    );
  for (const source of sources.slice(0, 2))
    blocks.push(
      make("sourceReference", source.title, {
        referenceId: source.referenceId,
        provenance: "KNOWLEDGE",
      }),
    );
  return blocks.map((block, index) => ({ ...block, order: index }));
}
function mergeChapterBlocks(
  existing: readonly ProductBlock[],
  replacement: readonly ProductBlock[],
  chapterId: string,
  outline: readonly ProductOutlineItem[],
): ProductBlock[] {
  const kept = existing.filter(
      (block) => block.metadata.chapterId !== chapterId,
    ),
    oldIndex = existing.findIndex(
      (block) => block.metadata.chapterId === chapterId,
    );
  let insertAt = oldIndex < 0 ? kept.length : Math.min(oldIndex, kept.length);
  if (oldIndex < 0) {
    const position = outline.findIndex((item) => item.id === chapterId);
    let foundPrevious = false;
    for (let index = position - 1; index >= 0; index--) {
      const previousId = outline[index]!.id,
        last = kept
          .map((block) => block.metadata.chapterId)
          .lastIndexOf(previousId);
      if (last >= 0) {
        insertAt = last + 1;
        foundPrevious = true;
        break;
      }
    }
    if (!foundPrevious) {
      const nextIds = new Set(outline.slice(position + 1).map((item) => item.id)),
        next = kept.findIndex(
          (block) =>
            typeof block.metadata.chapterId === "string" &&
            nextIds.has(block.metadata.chapterId),
        );
      if (next >= 0) insertAt = next;
    }
  }
  const merged = [
    ...kept.slice(0, insertAt),
    ...replacement,
    ...kept.slice(insertAt),
  ];
  return merged.map((block, index) => ({ ...block, order: index }));
}
