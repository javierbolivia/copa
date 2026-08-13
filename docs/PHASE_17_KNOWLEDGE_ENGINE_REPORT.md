# Fase 17 — Knowledge Engine + RAG local

Estado: **COMPLETED** · 2026-08-13

## Resultado

La plataforma incorpora un subsistema aditivo de conocimiento local sobre schema 6. No reemplaza Evidence ni lineage: añade bibliotecas globales/privadas, documentos, chunks estructurales, FTS5/BM25, recuperación por proyecto, citas, memoria aprobada y trazabilidad de influencia.

El baseline Fase 16 quedó protegido en el tag `phase16-stable`, la rama de trabajo es `codex/phase17-knowledge-engine` y el backup previo verificado está documentado en `docs/PRE_PHASE17_BACKUP.md`.

## Open source auditado

La matriz, versiones, licencias, fuentes y decisiones están en `docs/OPEN_SOURCE_AUDIT.md`.

- Adoptado: `pdfjs-dist@6.2.108` (Apache-2.0) y `mammoth@1.12.1` (BSD-2-Clause), versiones exactas.
- Sólo patrones: AnythingLLM.
- Diferido: Readability, LangChain.js y sqlite-vec.
- FTS5 es el motor canónico. `EmbeddingProvider` existe, pero su implementación inicial está explícitamente deshabilitada.

## Persistencia

Migration 006 añade `knowledge_libraries`, selección por proyecto, documentos, chunks, FTS/triggers, memoria aprobada/rechazada, logs/items de retrieval y `project_settings.knowledge_enabled`. Los guards impiden cruzar privadas, scopes, memorias o generaciones entre proyectos y registrar como usado un pack global no seleccionado.

## Ingesta local

- PDF por página con PDF.js; sin texto → `NEEDS_OCR`.
- DOCX con Mammoth sin acceso externo.
- TXT, Markdown, HTML y notas manuales con extracción propia.
- HTML elimina contenido activo y nunca se ejecuta.
- Chunking estructural determinista conserva headings, página, orden, vecinos, hash y tokens estimados.
- Originales en `data/knowledge/<library>/<sha256>.<ext>`.
- Jobs durables `KNOWLEDGE_IMPORT` con resultado o error estructurado.

## Retrieval y generación

Orden lógico: Evidence → Knowledge privado → packs globales seleccionados → memoria aprobada. Cada generación guarda consulta, política, bibliotecas, chunks/memorias, rank, score, citas, presupuesto y enlace a `generation_id`; `knowledgeUsed` queda también en el input snapshot. Los documentos se marcan como contexto no confiable en el prompt.

La aprobación normal conserva una memoria auditada pero no la vuelve reutilizable automáticamente. El usuario decide explícitamente si una versión será ejemplo futuro del proyecto, ejemplo global o `REJECTED`; los rechazados nunca se recuperan como referencia positiva.

## API y UI

**Biblioteca** permite crear scopes, dominio/categoría/tags/prioridad, seleccionar packs, importar documentos con metadatos, observar estados, borrar con seguridad, filtrar, buscar y usar **Ask Knowledge** con citas. Ask usa OpenAI con salida estructurada cuando el proyecto lo selecciona y existe clave; sin esa configuración, responde de forma extractiva local y lo etiqueta. Configuración incluye el toggle del engine; Historial muestra **Knowledge Used**; la trazabilidad añade nodos Knowledge/Memory.

## Backup y restore

El sidecar `.knowledge` acompaña SQLite y `.files`. Restore verifica rutas y SHA-256 antes de sustituir DB, generados y originales; siempre crea primero un safety backup.

## Rendimiento

Gate reproducible: 100 documentos / 10.000 chunks. El primer plan FTS tardó ~15,8 s; se corrigió materializando matches antes de joins. Gate final completo: ~0,9 s en test, con búsquedas paginadas; límites: 10 s ingesta y 2 s búsqueda.

## Verificación final

| Gate | Resultado |
|---|---|
| Typecheck shared/server/web | PASS |
| Tests | PASS — 65/65, 15 archivos |
| Build production | PASS |
| npm audit | PASS — 0 vulnerabilidades |
| Schema / integridad / FKs | PASS — 6 / `ok` / 0 |
| FTS sync, filtros, paginación | PASS |
| Corpus 100 / 10k | PASS |
| Backup/restore Knowledge | PASS |
| API E2E + aislamiento | PASS |
| QA visual desktop | PASS |
| Responsive 390×844 | PASS — overflow corregido, 390/390 |
| Consola browser | PASS — 0 warnings/errors |

## Límites conscientes

- OCR no forma parte de esta fase.
- Embeddings/vector search están deshabilitados; no son necesarios para el servicio FTS5 actual.
- Ask usa síntesis extractiva local cuando no hay llamada LLM.
- OpenAI y YouTube siguen sin validación live por ausencia de claves.
