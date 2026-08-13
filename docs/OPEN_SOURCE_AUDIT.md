# Fase 17 — Auditoría open source

Fecha de corte: 2026-08-13. Esta auditoría es selectiva: no se copió código de terceros ni se incorporó un framework RAG completo.

## Decisión ejecutiva

| Proyecto | Versión/revisión evaluada | Licencia | Decisión |
|---|---:|---|---|
| AnythingLLM | repositorio `master` 1.15.0; último release estable visible 1.14.0 | MIT | Sólo patrones de arquitectura y UX; no es dependencia |
| PDF.js / `pdfjs-dist` | 6.2.108 | Apache-2.0 | Adoptado, versión exacta, detrás de extractor local |
| Mammoth | 1.12.1 | BSD-2-Clause | Adoptado, versión exacta, sólo extracción DOCX |
| Mozilla Readability | 0.6.0 | Apache-2.0 | No adoptado: requiere DOM y sanitización adicionales |
| sqlite-vec | 0.1.9 (`e9f598a`) | MIT OR Apache-2.0 | No activado: adaptador futuro; FTS5 es el fallback canónico |
| LangChain.js | `langchain` 1.5.x / `@langchain/textsplitters` 1.0.1 | MIT | No adoptado: el dominio y chunker propios son suficientes |

## AnythingLLM

Fuentes primarias: [repositorio](https://github.com/Mintplex-Labs/anything-llm), [licencia](https://github.com/Mintplex-Labs/anything-llm/blob/master/LICENSE), [releases](https://github.com/Mintplex-Labs/anything-llm/releases), [documentos adjuntos frente a RAG](https://docs.anythingllm.com/chatting-with-documents/introduction), [memorias](https://docs.anythingllm.com/features/memories).

### Qué aprender

- Separar adquisición, documento normalizado, asociación a workspace/proyecto, chunks, recuperación y generación.
- Mantener aislamiento obligatorio por proyecto, jobs observables y fallos parciales por documento.
- Tratar las citas como datos estructurados y resolverlas sin depender de que el modelo las invente.
- Separar conocimiento documental persistente, adjuntos temporales y memoria aprobada.
- Desacoplar LLM, embeddings y almacenamiento vectorial.

### Qué reutilizar como patrón

- `KnowledgeDocument → KnowledgeChunk → índice`, con identificadores, hash, versión de ingesta y metadata de ubicación.
- Recuperación de dos pasos con `topN`, filtros, presupuesto de contexto y una política explícita de “sin evidencia suficiente”.
- Jobs durables con progreso, cancelación, error por etapa e historial.
- Respuestas RAG con citas, fragmentos, scores, parámetros y tiempos.

### Qué no copiar

- El monorepo, collector Express, Prisma, LanceDB ni la matriz de proveedores.
- Archivos JSON intermedios como fuente de verdad, colas en memoria/IPC o metadata crítica sólo en JSON opaco.
- Prompts, esquemas o defaults propios del producto.
- Código de terceros: no existe trasplante y por ello no hay avisos MIT adicionales que incorporar.

### Incompatibilidades

AnythingLLM usa una arquitectura JavaScript/CommonJS, Express, Prisma, collector independiente y LanceDB; no encaja directamente con el backend TypeScript + `node:sqlite` existente. Su amplitud elevaría superficie de dependencias, configuración y seguridad sin resolver mejor el alcance local de esta fase.

## Extractores

Fuentes primarias: [PDF.js](https://github.com/mozilla/pdf.js), [PDF.js npm](https://www.npmjs.com/package/pdfjs-dist), [Mammoth](https://github.com/mwilliamson/mammoth.js), [Readability](https://github.com/mozilla/readability).

- `pdfjs-dist@6.2.108`: compatible con Node `>=22.13 || >=24`, TypeScript y Windows. Se usa con bytes locales, lectura secuencial de páginas, sin canvas y con evaluación deshabilitada. Un PDF sin texto útil pasa a `NEEDS_OCR`; esta fase no añade OCR.
- `mammoth@1.12.1`: convierte DOCX local a HTML/texto semántico. El acceso a archivos externos permanece deshabilitado y la salida nunca se ejecuta.
- Readability no entra en la implementación inicial. Su propio repositorio advierte que debe acompañarse de un sanitizador y un DOM configurado sin scripts/recursos. Para HTML importado se usa un extractor estructural mínimo que elimina contenido activo y nunca crea un contexto ejecutable.

## sqlite-vec

Fuentes primarias: [repositorio](https://github.com/asg017/sqlite-vec), [release 0.1.9](https://github.com/asg017/sqlite-vec/releases/tag/v0.1.9), [uso con JavaScript](https://alexgarcia.xyz/sqlite-vec/js.html), [Node 24 `node:sqlite`](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

La versión estable sigue siendo pre-1.0 y su KNN es exacto; ANN está en una alpha experimental. Cargarla requiere `allowExtension: true`, una DLL nativa confiable y pruebas específicas de empaquetado Windows. Por eso:

- el dominio no conoce sintaxis `vec0`;
- existe un contrato de `EmbeddingProvider`, inicialmente deshabilitado;
- FTS5/BM25 es búsqueda funcional, no un modo degradado sin servicio;
- una integración futura deberá fijar modelo/dimensión, probar carga, DELETE/reindexado y caer limpiamente a FTS5.

## LangChain.js

Fuentes primarias: [repositorio](https://github.com/langchain-ai/langchainjs), [licencia](https://github.com/langchain-ai/langchainjs/blob/main/LICENSE), [splitters](https://docs.langchain.com/oss/javascript/integrations/splitters/index), [retrieval](https://docs.langchain.com/oss/javascript/langchain/retrieval).

Son útiles sus patrones `Document + metadata`, loader/splitter/retriever intercambiables y separación de memoria. No se incorpora el paquete raíz, LangGraph, agentes, memoria, LangSmith, vector stores ni `@langchain/community`: duplicarían abstracciones y peers que este proyecto ya puede mantener con interfaces pequeñas. El chunker local sigue una estrategia estructural/recursiva equivalente, conserva headings, páginas y orden, y tiene tests deterministas.

## Licencias y seguridad de suministro

- Dependencias nuevas directas: `pdfjs-dist@6.2.108` (Apache-2.0) y `mammoth@1.12.1` (BSD-2-Clause), fijadas exactamente en `apps/server/package.json` y el lockfile.
- No se vendorea código, modelos ni binarios de proyectos auditados.
- `npm audit` del baseline: 0 vulnerabilidades.
- Los documentos son datos no confiables: nunca se ejecuta HTML/JavaScript, no hay carga remota ni macros, y los nombres/rutas se generan dentro del directorio de datos local.
