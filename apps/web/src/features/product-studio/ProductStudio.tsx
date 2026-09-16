import type {
  CreateProductDocumentInput,
  ProductBlock,
  ProductBlockType,
  ProductDocument,
  ProductDocumentVersion,
  ProductTheme,
  Generation,
} from "@our-platform/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type React from "react";
import {
  api,
  type ProductAsset,
  type ProductExport,
  type ProductValidation,
  type KnowledgeUsed,
  type ProductGenerationEstimate,
} from "../../api/client";
import "./product-studio.css";

const blockTypes: ProductBlockType[] = [
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
type View = "studio" | "cover" | "assets" | "export" | "versions";
type ProductMetadata = ProductDocumentVersion["metadata"];
type ExportFormat = "html" | "docx" | "pdf";
type ExportFeedback =
  | { status: "exporting"; format: ExportFormat }
  | { status: "success"; format: ExportFormat; item: ProductExport }
  | { status: "error"; format: ExportFormat; message: string };

export function ProductStudio({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<ProductDocument[]>([]),
    [document, setDocument] = useState<ProductDocument | null>(null),
    [view, setView] = useState<View>("studio");
  const [blocks, setBlocks] = useState<ProductBlock[]>([]),
    [activeChapter, setActiveChapter] = useState<string | null>(null),
    [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [theme, setTheme] = useState<ProductTheme | null>(null),
    [metadata, setMetadata] = useState<ProductMetadata>({}),
    [retryNonce, setRetryNonce] = useState(0);
  const [assets, setAssets] = useState<ProductAsset[]>([]),
    [exports, setExports] = useState<ProductExport[]>([]),
    [validation, setValidation] = useState<ProductValidation | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProductDocumentVersion[]>([]);
  const [context, setContext] = useState<KnowledgeUsed | null>(null),
    [generation, setGeneration] = useState<Generation | null>(null),
    [estimate, setEstimate] = useState<ProductGenerationEstimate | null>(null);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback | null>(
    null,
  );
  const hydrated = useRef(false),
    saveTimer = useRef<number | undefined>(undefined),
    retryTimer = useRef<number | undefined>(undefined),
    persisted = useRef(""),
    savingPromise = useRef<Promise<ProductDocument> | null>(null),
    draftRef = useRef({ blocks, theme, metadata });
  draftRef.current = { blocks, theme, metadata };
  const draftKey = (documentId: string) =>
    `product-studio-draft:${projectId}:${documentId}`;
  const serialize = (
    nextBlocks: ProductBlock[],
    nextTheme: ProductTheme,
    nextMetadata: ProductMetadata,
  ) => JSON.stringify({ blocks: nextBlocks, theme: nextTheme, metadata: nextMetadata });
  const applyDocument = (next: ProductDocument, restoreLocal = false) => {
    const serverSerialized = serialize(
      next.version.blocks,
      next.version.theme,
      next.version.metadata,
    );
    let restoredBlocks = next.version.blocks,
      restoredTheme = next.version.theme,
      restoredMetadata = next.version.metadata;
    if (restoreLocal) {
      try {
        const raw = window.localStorage.getItem(draftKey(next.id));
        if (raw) {
          const local = JSON.parse(raw) as {
            blocks: ProductBlock[];
            theme: ProductTheme;
            metadata: ProductMetadata;
          };
          restoredBlocks = local.blocks;
          restoredTheme = local.theme;
          restoredMetadata = local.metadata;
        }
      } catch {
        window.localStorage.removeItem(draftKey(next.id));
      }
    }
    persisted.current = serverSerialized;
    setDocument(next);
    setBlocks(restoredBlocks);
    setTheme(restoredTheme);
    setMetadata(restoredMetadata);
    setActiveChapter(next.version.outline[0]?.id ?? null);
  };
  const load = async () => {
    const response = await api.productDocuments(projectId);
    setDocuments(response.documents);
    const current = response.documents[0] ?? null;
    if (current) applyDocument(current, true);
    else {
      setDocument(null);
      setBlocks([]);
      setTheme(null);
      setMetadata({});
      persisted.current = "";
    }
    hydrated.current = true;
  };
  useEffect(() => {
    void load().catch((e) => setError(message(e)));
  }, [projectId]);
  useEffect(() => {
    if (!document || !theme || !hydrated.current) return;
    const serialized = serialize(blocks, theme, metadata);
    if (serialized === persisted.current) return;
    window.localStorage.setItem(draftKey(document.id), serialized);
    window.clearTimeout(saveTimer.current);
    window.clearTimeout(retryTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveState("saving");
      const request = api.autosaveProductDocument(projectId, document.id, {
        baseVersionNumber: document.version.versionNumber,
        idempotencyKey: crypto.randomUUID(),
        blocks,
        theme,
        metadata,
      });
      savingPromise.current = request;
      void request
        .then((next) => {
          persisted.current = serialize(
            next.version.blocks,
            next.version.theme,
            next.version.metadata,
          );
          setDocument(next);
          setDocuments((current) => [
            next,
            ...current.filter((item) => item.id !== next.id),
          ]);
          const latest = draftRef.current;
          if (
            latest.theme &&
            serialize(latest.blocks, latest.theme, latest.metadata) ===
              serialized
          ) {
            window.localStorage.removeItem(draftKey(next.id));
            setBlocks(next.version.blocks);
            setTheme(next.version.theme);
            setMetadata(next.version.metadata);
            setSaveState("saved");
          }
        })
        .catch((cause) => {
          setSaveState("error");
          setError(message(cause));
          retryTimer.current = window.setTimeout(
            () => setRetryNonce((value) => value + 1),
            1500,
          );
        })
        .finally(() => {
          if (savingPromise.current === request) savingPromise.current = null;
        });
    }, 700);
    return () => window.clearTimeout(saveTimer.current);
  }, [
    blocks,
    theme,
    metadata,
    document?.id,
    document?.version.versionNumber,
    retryNonce,
  ]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!document || !theme) return;
      if (serialize(blocks, theme, metadata) === persisted.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [blocks, theme, metadata, document?.id]);
  const flushCurrent = async (): Promise<ProductDocument | null> => {
    window.clearTimeout(saveTimer.current);
    window.clearTimeout(retryTimer.current);
    let base = document;
    if (savingPromise.current) base = await savingPromise.current;
    const current = draftRef.current;
    if (!base || !current.theme) return base;
    const serialized = serialize(current.blocks, current.theme, current.metadata);
    if (serialized === persisted.current) return base;
    setSaveState("saving");
    const request = api.autosaveProductDocument(projectId, base.id, {
      baseVersionNumber: base.version.versionNumber,
      idempotencyKey: crypto.randomUUID(),
      blocks: current.blocks,
      theme: current.theme,
      metadata: current.metadata,
    });
    savingPromise.current = request;
    try {
      const saved = await request;
      persisted.current = serialize(saved.version.blocks, saved.version.theme, saved.version.metadata);
      window.localStorage.removeItem(draftKey(saved.id));
      setDocument(saved);
      setBlocks(saved.version.blocks);
      setTheme(saved.version.theme);
      setMetadata(saved.version.metadata);
      setDocuments((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSaveState("saved");
      return saved;
    } catch (cause) {
      setSaveState("error");
      setError(message(cause));
      throw cause;
    } finally {
      if (savingPromise.current === request) savingPromise.current = null;
    }
  };
  const act = async (fn: () => Promise<ProductDocument>) => {
    setBusy(true);
    setError(null);
    try {
      await flushCurrent();
      const next = await fn();
      window.localStorage.removeItem(draftKey(next.id));
      applyDocument(next);
      setDocuments((current) => [
        next,
        ...current.filter((item) => item.id !== next.id),
      ]);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  if (!document)
    return (
      <Wizard
        busy={busy}
        error={error}
        onCreate={(input) =>
          act(() => api.createProductDocument(projectId, input))
        }
      />
    );
  const chapter =
    document.version.outline.find((item) => item.id === activeChapter) ??
    document.version.outline[0];
  const visible = chapter
    ? blocks.filter(
        (block) => String(block.metadata.chapterId ?? "") === chapter.id,
      )
    : blocks;
  const updateBlock = (next: ProductBlock) =>
    setBlocks((current) =>
      current.map((item) =>
        item.id === next.id
          ? { ...next, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  const addBlock = (type: ProductBlockType) => {
    const now = new Date().toISOString();
    setBlocks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type,
        content: defaultContent(type),
        order: current.length,
        metadata: { ...(chapter ? { chapterId: chapter.id } : {}) },
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const remove = (id: string) =>
    setBlocks((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index })),
    );
  const duplicate = (block: ProductBlock) => {
    const now = new Date().toISOString();
    setBlocks((current) => [
      ...current,
      {
        ...block,
        id: crypto.randomUUID(),
        order: current.length,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const insertAsset = (asset: ProductAsset) => {
    const now = new Date().toISOString();
    setBlocks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: asset.kind,
        content: asset.title,
        order: current.length,
        metadata: {
          assetId: asset.id,
          ...(chapter ? { chapterId: chapter.id } : {}),
        },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setView("studio");
  };
  const move = (id: string, direction: -1 | 1) =>
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === id),
        to = index + direction;
      if (index < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next.map((item, order) => ({ ...item, order }));
    });
  const refreshFiles = async () => {
    const [assetResult, exportResult] = await Promise.all([
      api.productAssets(projectId),
      api.productExports(projectId, document.id),
    ]);
    setAssets(assetResult.assets);
    setExports(exportResult.exports);
  };
  const exportDocument = async (format: ExportFormat) => {
    setBusy(true);
    setError(null);
    setExportFeedback({ status: "exporting", format });
    try {
      const item = await api.exportProductDocument(
        projectId,
        document.id,
        format,
      );
      await refreshFiles();
      setExportFeedback({ status: "success", format, item });
    } catch (cause) {
      const detail = message(cause);
      setError(detail);
      setExportFeedback({ status: "error", format, message: detail });
    } finally {
      setBusy(false);
    }
  };
  const refreshContext = async () => {
    if (!chapter) return;
    const result = await api.generations(projectId);
    const latest = result.generations.find((item) => {
      if (
        item.agentKey !== "product_chapter" ||
        !Array.isArray(item.outputData)
      )
        return false;
      return (item.outputData as ProductBlock[]).some(
        (block) => block.metadata.chapterId === chapter.id,
      );
    });
    setGeneration(latest ?? null);
    if (!latest) return setContext(null);
    try {
      setContext(await api.knowledgeUsed(projectId, latest.id));
    } catch {
      setContext(null);
    }
  };
  const runPending = () =>
    act(async () => {
      const result = await api.generatePendingProductChapters(
        projectId,
        document.id,
      );
      setEstimate(null);
      return "version" in result
        ? result
        : api.productDocument(projectId, document.id);
    });
  const preparePending = async () => {
    try {
      const next = await api.productGenerationEstimate(projectId, document.id);
      if (next.provider === "mock") return void runPending();
      setEstimate(next);
    } catch (cause) {
      setError(message(cause));
    }
  };
  return (
    <section className="ps-root">
      {estimate && (
        <div className="ps-cost-bar" role="status">
          <div>
            <strong>Estimación antes del lote</strong>
            <span>
              {estimate.chapters} capítulos · {estimate.model} · aprox. $
              {estimate.estimatedCost.toFixed(4)} {estimate.currency}
              {estimate.remainingBudget !== null
                ? ` · disponible $${estimate.remainingBudget.toFixed(2)}`
                : ""}
            </span>
          </div>
          <button
            className="button secondary"
            onClick={() => setEstimate(null)}
          >
            Cancelar
          </button>
          <button className="button primary" onClick={() => void runPending()}>
            Confirmar generación
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner inline" role="alert">
          <strong>{error}</strong>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      <header className="ps-top">
        <div>
          <span>FINAL PRODUCT STUDIO</span>
          <h2>{document.title}</h2>
          <p>
            {label(document.documentType)} · v{document.version.versionNumber} ·{" "}
            {document.status} · {document.freshness}
          </p>
        </div>
        <div className="ps-top-actions">
          <select
            aria-label="Documento activo"
            value={document.id}
            onChange={(event) => {
              const next = documents.find(
                (item) => item.id === event.target.value,
              );
              if (next) void (async () => {
                try {
                  await flushCurrent();
                  applyDocument(next, true);
                } catch {
                  // Keep the current document and its recoverable local draft.
                }
              })();
            }}
          >
            {documents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button
            className="button secondary"
            onClick={() => void (async () => {
              try {
                await flushCurrent();
                setDocument(null);
                setBlocks([]);
                setTheme(null);
                setMetadata({});
                persisted.current = "";
              } catch {
                // Do not leave the document when its pending edit could not be saved.
              }
            })()}
          >
            Nuevo
          </button>
          <div className={`ps-save is-${saveState}`}>
            {saveState === "saving"
              ? "Guardando…"
              : saveState === "error"
                ? "Error al guardar"
                : "Guardado"}
          </div>
        </div>
      </header>
      <nav className="ps-tabs">
        {(["studio", "cover", "assets", "export", "versions"] as View[]).map(
          (item) => (
            <button
              className={view === item ? "active" : ""}
              key={item}
              onClick={() => {
                setView(item);
                if (item === "assets" || item === "export") void refreshFiles();
                if (item === "versions")
                  void api
                    .productDocumentVersions(projectId, document.id)
                    .then((result) => setVersions(result.versions))
                    .catch((e) => setError(message(e)));
              }}
            >
              {label(item)}
            </button>
          ),
        )}
      </nav>
      {view === "studio" && (
        <div className="ps-layout">
          <Outline
            document={document}
            activeId={chapter?.id ?? null}
            busy={busy}
            onSelect={setActiveChapter}
            onAction={(op) =>
              act(() => api.updateProductOutline(projectId, document.id, op))
            }
            onGenerate={() =>
              act(() => api.generateProductOutline(projectId, document.id))
            }
            onApprove={() =>
              act(() => api.approveProductOutline(projectId, document.id))
            }
            onGeneratePending={() => void preparePending()}
          />
          <main className="ps-editor">
            <div className="ps-editor-head">
              <div>
                <span>EDITOR</span>
                <h3>{chapter?.title ?? "Documento"}</h3>
              </div>
              {chapter && (
                <div>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api.generateProductChapter(
                          projectId,
                          document.id,
                          chapter.id,
                        ),
                      )
                    }
                  >
                    Generar / Regenerar
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api.approveProductChapter(
                          projectId,
                          document.id,
                          chapter.id,
                        ),
                      )
                    }
                  >
                    Aprobar
                  </button>
                </div>
              )}
            </div>
            <div className="ps-blocks">
              {visible.map((block) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  onChange={updateBlock}
                  onDelete={() => remove(block.id)}
                  onDuplicate={() => duplicate(block)}
                  onMove={move}
                />
              ))}
            </div>
            <div className="ps-add">
              <span>Añadir bloque</span>
              {blockTypes.map((type) => (
                <button key={type} onClick={() => addBlock(type)}>
                  + {label(type)}
                </button>
              ))}
            </div>
          </main>
          <aside className="ps-panel">
            <span>PANEL</span>
            <h3>Fuentes y control</h3>
            <section>
              <strong>Evidence</strong>
              {visible.flatMap((block) =>
                typeof block.metadata.evidenceId === "string"
                  ? [String(block.metadata.evidenceId)]
                  : [],
              ).length ? (
                visible.map((block) =>
                  typeof block.metadata.evidenceId === "string" ? (
                    <code key={block.id}>
                      {String(block.metadata.evidenceId)}
                    </code>
                  ) : null,
                )
              ) : (
                <p>No hay Evidence enlazada en este capítulo.</p>
              )}
            </section>
            <section>
              <strong>Knowledge Used</strong>
              <button
                className="button secondary"
                onClick={() => void refreshContext()}
              >
                Ver contexto exacto
              </button>
              {context ? (
                <div className="ps-context-list">
                  <small>{context.contextTokenEstimate} tokens estimados</small>
                  {context.items.map((item, index) => (
                    <details key={`${item.kind}-${index}`}>
                      <summary>
                        {item.kind} · {item.title ?? "Sin título"}
                      </summary>
                      <p>{item.content}</p>
                    </details>
                  ))}
                </div>
              ) : (
                <p>
                  Project Knowledge → global seleccionado → memoria aprobada.
                </p>
              )}
            </section>
            <section>
              <strong>AI inference</strong>
              <p>
                {generation
                  ? `${generation.provider} · ${generation.model} · ${generation.promptVersion ?? "prompt sin versión"} · $${generation.estimatedCost.toFixed(4)}`
                  : "Las inferencias requieren revisión humana. Mock: $0 Demo."}
              </p>
            </section>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(() => api.approveProductDocument(projectId, document.id))
              }
            >
              Aprobar documento
            </button>
          </aside>
        </div>
      )}
      {view === "cover" && (
        <Cover
          document={document}
          theme={theme ?? document.version.theme}
          metadata={metadata}
          onChange={(nextTheme, nextMetadata) => {
            setTheme(nextTheme);
            setMetadata(nextMetadata);
          }}
        />
      )}
      {view === "assets" && (
        <Assets
          projectId={projectId}
          assets={assets}
          onChanged={refreshFiles}
          onInsert={insertAsset}
          onError={(value) => setError(message(value))}
        />
      )}
      {view === "export" && (
        <ExportPanel
          busy={busy}
          exports={exports}
          validation={validation}
          feedback={exportFeedback}
          onValidate={() =>
            void api
              .validateProductDocument(projectId, document.id)
              .then(setValidation)
              .catch((e) => setError(message(e)))
          }
          onExport={(format) => void exportDocument(format)}
        />
      )}
      {view === "versions" && <Versions versions={versions} />}
    </section>
  );
}

function Wizard({
  busy,
  error,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCreate: (input: CreateProductDocumentInput) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      title = String(data.get("title")).trim();
    onCreate({
      documentType: String(
        data.get("type"),
      ) as CreateProductDocumentInput["documentType"],
      language: String(data.get("language")),
      length: String(
        data.get("length"),
      ) as CreateProductDocumentInput["length"],
      level: String(data.get("level")) as CreateProductDocumentInput["level"],
      ...(title ? { title } : {}),
    });
  };
  return (
    <form className="ps-wizard detail-card" onSubmit={submit}>
      <span>PRODUCT STUDIO</span>
      <h2>Empieza por la estructura del Ebook</h2>
      <p>El contenido se genera después, capítulo por capítulo con sustancia práctica y rigor.</p>
      {error && <div className="error-banner inline">{error}</div>}
      <label>
        Tipo
        <select name="type">
          <option value="ebook">Ebook</option>
          <option value="guide">Guía</option>
          <option value="workbook">Workbook</option>
          <option value="checklist">Checklist</option>
          <option value="lead_magnet">Lead Magnet</option>
        </select>
      </label>
      <label>
        Título
        <input
          name="title"
          placeholder="Se toma del producto activo si se deja vacío"
        />
      </label>
      <label>
        Idioma
        <input name="language" defaultValue="es" />
      </label>
      <label>
        Longitud
        <select name="length">
          <option value="short">Corta</option>
          <option value="medium">Media</option>
          <option value="long">Extensa</option>
        </select>
      </label>
      <label>
        Nivel
        <select name="level">
          <option value="beginner">Principiante</option>
          <option value="intermediate">Intermedio</option>
          <option value="advanced">Avanzado</option>
        </select>
      </label>
      <div className="ps-checks">
        <label>
          <input type="checkbox" checked readOnly /> Project Knowledge
        </label>
        <label>
          <input type="checkbox" checked readOnly /> Librerías globales
          seleccionadas
        </label>
      </div>
      <button className="button primary" disabled={busy}>
        Crear estructura
      </button>
    </form>
  );
}

function Outline({
  document,
  activeId,
  busy,
  onSelect,
  onAction,
  onGenerate,
  onApprove,
  onGeneratePending,
}: {
  document: ProductDocument;
  activeId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onAction: (op: any) => void;
  onGenerate: () => void;
  onApprove: () => void;
  onGeneratePending: () => void;
}) {
  const items = document.version.outline;
  return (
    <aside className="ps-outline">
      <span>OUTLINE</span>
      <h3>Capítulos</h3>
      {items.map((item, index) => (
        <article
          className={activeId === item.id ? "active" : ""}
          key={`${item.id}-${item.title}`}
          onClick={() => onSelect(item.id)}
        >
          <input
            defaultValue={item.title}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== item.title)
                onAction({ operation: "update", itemId: item.id, title });
            }}
          />
          <small>
            {item.targetWords} palabras · {item.status}
          </small>
          <div>
            <button
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                onAction({
                  operation: "move",
                  itemId: item.id,
                  toIndex: index - 1,
                });
              }}
            >
              ↑
            </button>
            <button
              disabled={index === items.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                onAction({
                  operation: "move",
                  itemId: item.id,
                  toIndex: index + 1,
                });
              }}
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction({ operation: "duplicate", itemId: item.id });
              }}
            >
              ⧉
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction({ operation: "delete", itemId: item.id });
              }}
            >
              ×
            </button>
          </div>
        </article>
      ))}
      <button
        className="button secondary"
        onClick={() =>
          onAction({
            operation: "add",
            title: "Nuevo capítulo",
            targetWords: 500,
          })
        }
      >
        + Capítulo
      </button>
      <button className="button secondary" disabled={busy} onClick={onGenerate}>
        Generar outline
      </button>
      <button
        className="button secondary"
        disabled={busy || !items.length}
        onClick={onApprove}
      >
        Aprobar outline
      </button>
      <button
        className="button primary"
        disabled={busy || !items.length}
        onClick={onGeneratePending}
      >
        Generar pendientes
      </button>
    </aside>
  );
}

function BlockEditor({
  block,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
}: {
  block: ProductBlock;
  onChange: (block: ProductBlock) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const value =
    typeof block.content === "string"
      ? block.content
      : Array.isArray(block.content)
        ? block.content.join("\n")
        : JSON.stringify(block.content, null, 2);
  return (
    <article className={`ps-block ps-${block.type}`}>
      <header>
        <select
          value={block.type}
          onChange={(e) =>
            onChange({ ...block, type: e.target.value as ProductBlockType })
          }
        >
          {blockTypes.map((type) => (
            <option value={type} key={type}>
              {label(type)}
            </option>
          ))}
        </select>
        <div>
          <button onClick={() => onMove(block.id, -1)}>↑</button>
          <button onClick={() => onMove(block.id, 1)}>↓</button>
          <button onClick={onDuplicate}>Duplicar</button>
          <button onClick={onDelete}>Eliminar</button>
        </div>
      </header>
      {block.type === "divider" ? (
        <hr />
      ) : block.type === "pageBreak" ? (
        <div className="ps-page-break">SALTO DE PÁGINA</div>
      ) : (
        <textarea
          rows={["heading", "question", "CTA"].includes(block.type) ? 2 : 6}
          value={value}
          onChange={(e) =>
            onChange({
              ...block,
              content: parseContent(block.type, e.target.value),
            })
          }
        />
      )}
    </article>
  );
}

function Cover({
  document,
  theme,
  metadata,
  onChange,
}: {
  document: ProductDocument;
  theme: ProductTheme;
  metadata: ProductMetadata;
  onChange: (theme: ProductTheme, metadata: ProductMetadata) => void;
}) {
  const update = (next: ProductTheme) => {
    onChange(next, metadata);
  };
  return (
    <div className="ps-cover-layout">
      <section className="detail-card">
        <h3>Cover Builder</h3>
        <label>
          Título
          <input
            value={String(metadata.coverTitle ?? document.title)}
            onChange={(e) => {
              const next = { ...metadata, coverTitle: e.target.value };
              onChange(theme, next);
            }}
          />
        </label>
        <label>
          Subtítulo
          <input
            value={String(metadata.coverSubtitle ?? document.subtitle ?? "")}
            onChange={(e) => {
              const next = { ...metadata, coverSubtitle: e.target.value };
              onChange(theme, next);
            }}
          />
        </label>
        <label>
          Autor / marca
          <input
            value={String(metadata.author ?? "")}
            onChange={(e) => {
              const next = { ...metadata, author: e.target.value };
              onChange(theme, next);
            }}
          />
        </label>
        <label>
          Template
          <select
            value={theme.template}
            onChange={(e) =>
              update({
                ...theme,
                template: e.target.value as ProductTheme["template"],
              })
            }
          >
            <option value="minimal">Minimal</option>
            <option value="professional">Professional</option>
            <option value="workbook">Workbook</option>
            <option value="lead_magnet">Lead Magnet</option>
          </select>
        </label>
        <label>
          Accent
          <input
            type="color"
            value={theme.accentColor}
            onChange={(e) => update({ ...theme, accentColor: e.target.value })}
          />
        </label>
        <label>
          Escala tipográfica
          <input
            type="range"
            min="0.75"
            max="2"
            step="0.05"
            value={theme.typographyScale}
            onChange={(e) =>
              update({ ...theme, typographyScale: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Espaciado
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={theme.spacing}
            onChange={(e) =>
              update({ ...theme, spacing: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Tamaño
          <select
            value={theme.pageSize}
            onChange={(e) =>
              update({ ...theme, pageSize: e.target.value as "A4" | "LETTER" })
            }
          >
            <option>A4</option>
            <option>LETTER</option>
          </select>
        </label>
        <label>
          Márgenes
          <input
            type="number"
            min="0"
            max="80"
            value={theme.margins}
            onChange={(e) =>
              update({ ...theme, margins: Number(e.target.value) })
            }
          />
        </label>
      </section>
      <article
        className={`ps-cover ps-template-${theme.template}`}
        style={{ "--ps-accent": theme.accentColor } as React.CSSProperties}
      >
        <span>{label(document.documentType)}</span>
        <h1>{String(metadata.coverTitle ?? document.title)}</h1>
        <p>{String(metadata.coverSubtitle ?? document.subtitle ?? "")}</p>
        <strong>{String(metadata.author ?? "")}</strong>
      </article>
    </div>
  );
}

function Assets({
  projectId,
  assets,
  onChanged,
  onInsert,
  onError,
}: {
  projectId: string;
  assets: ProductAsset[];
  onChanged: () => Promise<void>;
  onInsert: (asset: ProductAsset) => void;
  onError: (error: unknown) => void;
}) {
  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () =>
      void api
        .uploadProductAsset(projectId, {
          title: file.name.replace(/\.[^.]+$/, ""),
          filename: file.name,
          mimeType: file.type,
          contentBase64: String(reader.result).split(",")[1] ?? "",
        })
        .then(async (asset) => {
          await onChanged();
          onInsert(asset);
        })
        .catch(onError);
    reader.readAsDataURL(file);
  };
  const diagram = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void api
      .createProductDiagram(projectId, {
        title: String(data.get("title")),
        diagramType: String(data.get("type")) as
          "flowchart" | "timeline" | "mindmap" | "process",
        description: String(data.get("description")),
      })
      .then(async (asset) => {
        await onChanged();
        onInsert(asset);
      })
      .catch(onError);
  };
  return (
    <div className="ps-assets">
      <article className="detail-card">
        <h3>Imágenes</h3>
        <p>PNG, JPEG o WebP. Se valida MIME, tamaño y dimensiones.</p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </article>
      <form className="detail-card" onSubmit={diagram}>
        <h3>Nuevo diagrama</h3>
        <label>
          Título
          <input name="title" required />
        </label>
        <label>
          Tipo
          <select name="type">
            <option value="flowchart">Flowchart</option>
            <option value="timeline">Timeline</option>
            <option value="mindmap">Mindmap</option>
            <option value="process">Process</option>
          </select>
        </label>
        <label>
          Descripción
          <textarea name="description" required rows={4} />
        </label>
        <button className="button primary">Crear SVG</button>
      </form>
      <div className="ps-asset-grid">
        {assets.map((asset) => (
          <article key={asset.id}>
            <img src={asset.url} alt="" />
            <strong>{asset.title}</strong>
            <small>
              {asset.kind} · {(asset.bytes / 1024).toFixed(1)} KB
            </small>
            <button
              className="button secondary"
              onClick={() => onInsert(asset)}
            >
              Insertar en capítulo
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ExportPanel({
  busy,
  exports,
  validation,
  feedback,
  onValidate,
  onExport,
}: {
  busy: boolean;
  exports: ProductExport[];
  validation: ProductValidation | null;
  feedback: ExportFeedback | null;
  onValidate: () => void;
  onExport: (format: ExportFormat) => void;
}) {
  return (
    <div className="ps-export">
      <article className="detail-card">
        <h3>Validación del producto</h3>
        <button className="button secondary" type="button" onClick={onValidate}>
          Revisar antes de exportar
        </button>
        {validation && (
          <div>
            <p>
              {validation.canExport
                ? "Listo para exportar"
                : "Corrige los errores obligatorios"}
            </p>
            {validation.errors.map((item) => (
              <p className="ps-error" key={item}>
                {item}
              </p>
            ))}
            {validation.warnings.map((item) => (
              <p className="ps-warning" key={item}>
                {item}
              </p>
            ))}
            {validation.claimWarnings.map((item) => (
              <p className="ps-warning" key={item.blockId}>
                {item.message}
              </p>
            ))}
          </div>
        )}
      </article>
      <article className="detail-card">
        <h3>Exportar archivos reales</h3>
        {feedback?.status === "exporting" && (
          <p className="ps-export-feedback" role="status">
            Exportando {feedback.format.toUpperCase()}…
          </p>
        )}
        {feedback?.status === "success" && (
          <p className="ps-export-feedback is-success" role="status">
            {feedback.item.filename} listo. {formatLabel(feedback.format)} creado en{" "}
            <code>{feedback.item.downloadUrl}</code>.{" "}
            <a href={feedback.item.downloadUrl} download>
              Descargar / abrir archivo
            </a>
          </p>
        )}
        {feedback?.status === "error" && (
          <p className="ps-export-feedback is-error" role="alert">
            No se pudo exportar {feedback.format.toUpperCase()}: {feedback.message}
          </p>
        )}
        <div className="ps-export-actions">
          <button type="button" disabled={busy} onClick={() => onExport("html")}>
            {feedback?.status === "exporting" && feedback.format === "html"
              ? "Exportando HTML…"
              : "Export HTML"}
          </button>
          <button type="button" disabled={busy} onClick={() => onExport("docx")}>
            {feedback?.status === "exporting" && feedback.format === "docx"
              ? "Exportando DOCX…"
              : "Export DOCX"}
          </button>
          <button type="button" disabled={busy} onClick={() => onExport("pdf")}>
            {feedback?.status === "exporting" && feedback.format === "pdf"
              ? "Exportando PDF…"
              : "Export PDF"}
          </button>
        </div>
      </article>
      <article className="detail-card">
        <h3>Historial</h3>
        {!exports.length && <p>Aún no hay exports para este documento.</p>}
        {exports.map((item) => (
          <div className="ps-export-row" key={item.id}>
            <strong>{item.filename}</strong>
            <small>
              v{item.documentVersionId.slice(0, 8)} ·{" "}
              {(item.bytes / 1024).toFixed(1)} KB · SHA-256{" "}
              {item.checksum.slice(0, 12)}…
            </small>
            <a className="button secondary" href={item.downloadUrl} download>
              Descargar
            </a>
          </div>
        ))}
      </article>
    </div>
  );
}
function formatLabel(format: ExportFormat) {
  return format.toUpperCase();
}
function Versions({ versions }: { versions: ProductDocumentVersion[] }) {
  return (
    <article className="detail-card">
      <h3>Versiones del documento</h3>
      {versions.map((item) => (
        <div className="ps-version" key={item.id}>
          <strong>
            v{item.versionNumber} · {item.revisionKind}
          </strong>
          <small>
            {item.blocks.length} bloques ·{" "}
            {new Date(item.createdAt).toLocaleString("es")}
          </small>
        </div>
      ))}
    </article>
  );
}
function parseContent(
  type: ProductBlockType,
  value: string,
): ProductBlock["content"] {
  if (["bulletList", "numberedList", "checklist"].includes(type))
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  if (type === "table") return { rows: value.split("\n") };
  return value;
}
function defaultContent(type: ProductBlockType): ProductBlock["content"] {
  if (type === "exercise")
    return {
      title: "Ejercicio",
      objective: "",
      instructions: "",
      question: "",
      responseSpace: "",
    };
  if (type === "callout") return { kind: "TIP", text: "" };
  if (type === "table") return { rows: ["Columna 1 | Columna 2"] };
  if (["bulletList", "numberedList", "checklist"].includes(type)) return [""];
  return "";
}
function label(value: string) {
  return (
    (
      {
        ebook: "Ebook",
        guide: "Guía",
        workbook: "Workbook",
        checklist: "Checklist",
        lead_magnet: "Lead Magnet",
        studio: "Studio",
        cover: "Portada",
        assets: "Assets",
        export: "Exportar",
        versions: "Versiones",
        bulletList: "Lista",
        numberedList: "Lista numerada",
        pageBreak: "Salto de página",
        keyTakeaway: "Key Takeaway",
        sourceReference: "Referencia",
        CTA: "CTA",
      } as Record<string, string>
    )[value] ?? value.replaceAll("_", " ")
  );
}
function message(value: unknown) {
  return value instanceof Error ? value.message : "Error inesperado.";
}
