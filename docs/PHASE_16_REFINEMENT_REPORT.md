# Fase 16 — Migración final y refinamiento

**Estado: COMPLETED**  
**Fecha de verificación: 2026-08-13**  
**Commits base:** `7bdb2ef`, `f57faa8`

## Protección y migración

- Servidores detenidos antes de intervenir.
- Backup completo y verificado: `backups/pre-schema5-data-20260813T024031Z`.
- 20 archivos y 2,690,982 bytes copiados; hashes SHA-256 de DB/WAL/SHM idénticos al origen.
- Base activa comprobada en schema 3 antes de ejecutar las migraciones.
- Migración 004 `project_isolation_guards`: aplicada.
- Migración 005 `project_isolation_update_guards`: aplicada.
- Integridad SQLite después de migrar: `ok`; schema activo: 5.
- Datos conservados: 1 proyecto Demo, 10 comentarios, 14 artefactos, 14 versiones, 35 edges de lineage, 14 generaciones, 5 archivos y 14 estados workflow `COMPLETED`.

## Pipeline OpenAI

- `ModuleService` enruta entre Mock y OpenAI según la elección de ejecución o el setting del proyecto.
- Categorías economy/powerful y nombres de modelo configurables por proyecto o entorno.
- Cada prompt se carga desde `prompts/`, registra versión, ruta y SHA-256.
- Los 14 módulos usan outputs estructurados y validación local.
- Una respuesta inválida recibe un único intento de reparación; si vuelve a fallar, no se persiste estado parcial.
- Cada generación registra agente, prompt, provider, modelo solicitado/reportado, snapshot, tokens, coste y duración.
- Sin `OPENAI_API_KEY`, el endpoint devuelve un error claro, la UI muestra **OpenAI no configurado** y Mock continúa funcionando.
- Estado live: `IMPLEMENTED_NOT_LIVE_VERIFIED`.

## Refinamiento de UI

- Selector Demo/OpenAI y acciones Generar/Regenerar por módulo.
- Editores seccionales de Product, Avatar, Mechanism, Beliefs y Offer.
- Guardado de cambios como nueva versión `draft`; activación sólo al pulsar Aprobar.
- Landing Builder lado a lado, preview desktop/mobile, versiones, comparación y export HTML del contenido editado.
- Funnel visual simple con edición, activación y reordenación de nodos.
- Emails en tarjetas con asunto, cuerpo, CTA, delay, orden y export Markdown.
- Content Engine con filtros, edición, duplicado, borrado y export Markdown.
- Producto final con archivos, abrir, regenerar, origen y exportar.
- Modal reusable de trazabilidad que recorre versiones upstream, evidence links y fuentes cuando existen.
- Historial con filtros por módulo/modelo/status/fecha, tokens, duración y coste.
- Dashboard de distribución por proyecto, módulo y modelo; Mock se etiqueta `DEMO · $0`.
- Estado YouTube visible; la acción real se deshabilita sin key y Demo permanece disponible.

## Launcher Windows

`start-app.cmd` valida Node/npm, instala dependencias si faltan, compila si faltan los artefactos, inicia el servidor minimizado, espera `/api/health` y abre el navegador. La comprobación `start-app.cmd --check` pasó. No instala servicios ni modifica Windows.

## QA ejecutado

| Verificación | Resultado |
|---|---|
| SQLite spike | PASS |
| TypeScript shared/server/web | PASS |
| Unit + integración + E2E | PASS — 39/39, 9 archivos |
| OpenAI fetch mock, missing key, routing y repair | PASS |
| Draft → traceability → approve | PASS |
| Backend build | PASS |
| Frontend build | PASS |
| npm audit | PASS — 0 vulnerabilidades |
| Fresh `npm ci`, schema 5, Demo y restart | PASS |
| Smoke de 17 pantallas | PASS |
| Consola navegador | PASS — sin errors/warnings |
| Responsive 390×844 | PASS — sin overflow horizontal |

El smoke visual verificó además el editor Product, cancelar sin persistir, selector OpenAI deshabilitado sin key, modal de trazabilidad, analítica con 14 generaciones, Landing móvil y coste Demo $0.

El QA independiente reprodujo defectos HIGH en la selección de la versión activa frente a drafts y en la serialización de editores. Se corrigieron `supersedes`, propagación stale, contratos canónicos y se añadieron regresiones. El gate final quedó `PASS`, sin CRITICAL/HIGH.

## Limitaciones aceptadas

- OpenAI y YouTube no se marcaron como live verified.
- El historial de generaciones antiguas conserva metadata, pero no una copia presentable del output en el registro de generación.
- Funnel no pretende ser un editor de grafos libre.

Consulta [KNOWN_ISSUES.md](../KNOWN_ISSUES.md) y [FINAL_BUILD_REPORT.md](../FINAL_BUILD_REPORT.md).
