# Our Platform

Aplicación personal y local que convierte evidencia de mercado en productos digitales y activos comerciales trazables. El recorrido completo funciona sin claves con datos `DEMO` claramente identificados.

## Iniciar normal

Requiere Node.js 24 o posterior. En PowerShell, desde esta carpeta:

```powershell
npm.cmd install
npm.cmd run dev
```

Abre `http://127.0.0.1:5173`.

## Iniciar con lanzador

Después de instalar Node.js, haz doble clic en `start-app.cmd`. El lanzador instala dependencias si faltan, compila cuando es necesario, inicia el servidor local y abre `http://127.0.0.1:4310` automáticamente. No instala servicios ni cambia Windows.

## Demo

Pulsa **Crear proyecto Demo**. Se crean fuentes sintéticas, 10 comentarios, los 14 módulos, versiones, lineage, historial y archivos finales sin llamadas externas ni coste.

## OpenAI

1. Copia `.env.example` como `.env`.
2. Escribe la clave sólo en `OPENAI_API_KEY=`.
3. Opcionalmente configura `OPENAI_ECONOMY_MODEL` y `OPENAI_POWERFUL_MODEL`.
4. Reinicia la aplicación y elige **OpenAI** en Configuración o en el módulo.

La clave nunca se muestra ni se guarda en SQLite. Sin clave, la UI indica **OpenAI no configurado** y Demo continúa operativo. La integración está `IMPLEMENTED_NOT_LIVE_VERIFIED` porque no se usó una clave real.

## YouTube

Añade `YOUTUBE_API_KEY=` en `.env` y reinicia. La pantalla Fuentes mostrará si la API está configurada. Sin clave, la importación real queda deshabilitada y el corpus Demo sigue disponible. La integración está `IMPLEMENTED_NOT_LIVE_VERIFIED`.

## Backup y restore

En **Configuración → Backups**, pulsa **Crear backup**. Para restaurar, selecciona un backup y confirma. Antes del restore se crea una copia de seguridad del estado actual. Los backups están en `data/backups/` y no contienen `.env` ni claves.

## Visual Product Studio

Abre **Producto final** y crea un Ebook, Guía, Workbook, Checklist o Lead Magnet. El flujo es outline → capítulos por bloques → edición/autosave → portada/assets → validación → export. Mock funciona sin claves; si el proyecto elige OpenAI y existe `OPENAI_API_KEY`, outline y capítulos usan salida estructurada, RAG, presupuesto y registro de coste.

Los archivos reales `.html`, `.docx` y `.pdf` se guardan bajo `data/generated/<projectId>/product-studio/`; las imágenes y diagramas bajo `data/assets/<projectId>/`. El historial conserva versión, tamaño y SHA-256. Backup/restore incluye ambos directorios.

## Outputs

Las exportaciones viven en `data/generated/` y también aparecen dentro de Landing y Producto final con acciones de descarga. Landing puede exportar el copy editado como HTML; Emails y Content exportan Markdown.

## Knowledge Engine local

Abre **Biblioteca** dentro de un proyecto. Una biblioteca **privada** sólo pertenece a ese proyecto; una **global** es un pack compartido que cada proyecto debe seleccionar explícitamente. Puedes describirlas y ordenarlas con dominio, categoría, tags y prioridad.

La importación acepta PDF, DOCX, TXT, Markdown, HTML y notas manuales. Cada documento puede llevar descripción, categoría, tags y prioridad. El sistema extrae el texto localmente, lo divide en fragmentos trazables y lo busca con FTS5/BM25. **Ask Knowledge** recupera esos fragmentos y siempre muestra sus citas: usa OpenAI sólo si está configurado y elegido; de lo contrario presenta una síntesis extractiva local claramente etiquetada.

En generación, RAG significa que cada agente recibe sólo el contexto pertinente, dentro de límites distintos según su función. Evidence sigue teniendo prioridad y los documentos se tratan como datos no confiables. **Historial → Knowledge Used** permite ver exactamente qué fragmentos influyeron, con origen, ranking y ubicación.

Aprobar una versión no la vuelve automáticamente un ejemplo reutilizable. En el editor puedes elegir explícitamente **Usar como ejemplo futuro**, **Usar globalmente** o **Marcar rechazado**. Los rechazados nunca sirven como referencia positiva. El toggle en **Configuración** desactiva o activa Knowledge para las generaciones del proyecto.

Los originales viven en `data/knowledge/`, entran con checksum en backups y nunca ejecutan scripts. PDF escaneado sin texto queda `NEEDS_OCR`. Embeddings están deshabilitados: FTS5 local funciona sin servicios externos.

## Verificación para desarrollo

```powershell
npm.cmd run spike:sqlite
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit
```

Stack: React + Vite, Fastify, TypeScript y SQLite mediante `node:sqlite`. La aplicación escucha sólo en `127.0.0.1`; no incluye login, pagos ni servicios SaaS obligatorios.

## Documentación

- [Informe final](FINAL_BUILD_REPORT.md)
- [Informe de Fase 16](docs/PHASE_16_REFINEMENT_REPORT.md)
- [Informe de Fase 17](docs/PHASE_17_KNOWLEDGE_ENGINE_REPORT.md)
- [Informe de Fase 18](docs/PHASE_18_PRODUCT_STUDIO_REPORT.md)
- [Arquitectura de exportación](docs/PRODUCT_EXPORT_ARCHITECTURE.md)
- [Auditoría open source Fase 18](docs/PHASE18_OPEN_SOURCE_AUDIT.md)
- [Auditoría open source](docs/OPEN_SOURCE_AUDIT.md)
- [Plan futuro de búsqueda vectorial](docs/VECTOR_SEARCH_FUTURE.md)
- [Claves e integraciones](API_KEYS_TODO.md)
- [Problemas conocidos](KNOWN_ISSUES.md)
- [Backup previo a schema 5](docs/PRE_SCHEMA5_BACKUP.md)
- [Progreso autónomo](docs/AUTONOMOUS_PROGRESS.md)
