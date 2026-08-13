# Fase 18 — Visual Product Studio

**Estado: COMPLETED — schema 7**

Product Final ahora incorpora un estudio persistente para Ebook, Guía, Workbook, Checklist y Lead Magnet:

- wizard mínimo conectado al Product activo;
- outline generado primero, editable, reordenable, duplicable y aprobable;
- generación independiente o por job reanudable, sin regenerar capítulos completos;
- 17 bloques compartidos y editor visual ligero con autosave debounced/idempotente;
- RAG por capítulo con Evidence, Project Knowledge, global seleccionado y Approved Memory, presupuesto y trazabilidad exacta;
- Mock determinista `$0 Demo` y OpenAI Responses API estructurado según configuración, con modelo, tokens, coste, prompt y presupuesto persistidos;
- aprobación de outline/capítulo/documento, versiones, lineage y `STALE` sin borrado/regeneración automática;
- cuatro themes, Cover Builder, biblioteca local de imágenes y diagramas Mermaid sanitizados;
- validación previa y exports físicos HTML/DOCX/PDF con historial y checksum.

La migración 6→7 es aditiva. Conserva tablas/datos previos y añade documentos, versiones, capítulos, assets y exports con guards compuestos por proyecto. El borrado permanente, backup y restore incluyen archivos físicos de Product Studio.

QA de cierre: flujo Demo completo, edición humana preservada entre regeneraciones, carreras de autosave, flush inmediato antes de cambiar o crear documento, aislamiento, RAG/trace, stale, bloqueo de OpenAI antes de la llamada cuando no existe presupuesto, assets hostiles, DOCX ZIP con `word/document.xml`, PDF `%PDF-`, HTML sin scripts, backup/restore y reinicio. Desktop y 390×844 fueron inspeccionados en la app compilada sin errores de consola. Gate final: 74/74 tests, typecheck/build PASS y cero vulnerabilidades conocidas por `npm audit --offline`.

La auditoría de dependencias está en [PHASE18_OPEN_SOURCE_AUDIT.md](PHASE18_OPEN_SOURCE_AUDIT.md) y el pipeline de archivos en [PRODUCT_EXPORT_ARCHITECTURE.md](PRODUCT_EXPORT_ARCHITECTURE.md).
