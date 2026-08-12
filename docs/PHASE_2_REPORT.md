# Informe de cierre — Fase 2

**Fecha:** 12 de agosto de 2026  
**Resultado:** PASS  
**Schema actual:** 2

## Construido

- Gestión de proyectos: crear, listar, abrir, editar, archivar, restaurar y eliminar definitivamente mediante confirmación exacta del nombre.
- Filtros Activos/Archivados, fechas, etapa y progreso real.
- Vista de proyecto con Overview, 14 pasos del workflow y placeholders de módulos.
- Settings persistentes: idioma, mercado, moneda, notas, preferencias LLM no conectadas, modelos, presupuesto e idioma de contenido.
- Workflow backend con estados `PENDING`, `READY`, `IN_PROGRESS`, `COMPLETED`, `STALE` y `BLOCKED`.
- Artifacts y artifact versions con snapshots JSON, status, freshness, supersedes y versión activa.
- Lineage many-to-many entre versiones.
- Propagación stale recursiva, eventos explicativos y actualización del workflow.
- Evidence links genéricos para futuras relaciones con comments/sources.
- Backups consistentes mediante la API nativa de SQLite.
- Restauración validada por integrity check y schema, precedida por safety backup.

## Migración nueva

`002_projects_workflow_artifacts_lineage` crea:

- `project_settings`;
- `workflow_steps`;
- `artifacts`;
- `artifact_versions`;
- `lineage_edges`;
- `staleness_events`;
- `evidence_links`.

La migración rellena settings y 14 pasos para proyectos Fase 1. La prueba específica construye una base schema 1, añade un proyecto, abre con la aplicación Fase 2 y confirma conservación + schema 2.

## Lineage y stale

Cada edge une una versión padre exacta con una versión hija exacta. Una hija admite varios padres.

Ejemplo probado:

`Producto v1 → Avatar v1 → Oferta v1 → Landing v1`

Además, `Oferta v1` depende simultáneamente de `Producto v1` y `Avatar v1`. Al crear `Producto v2` dentro del mismo artifact:

- Producto v1 pasa a `superseded` pero se conserva;
- Avatar v1, Oferta v1 y Landing v1 pasan a `freshness=stale`;
- se crean tres `staleness_events` con old/new parent version;
- los pasos Avatar, Oferta y Landing quedan `STALE`;
- no se regenera ni elimina nada.

## Backups y restauración

Desde Settings, `Crear backup` produce `data/backups/backup-YYYYMMDDTHHMMSSZ.sqlite`. Incluye la base y su metadata persistente; no copia `.env` ni claves.

Restaurar exige confirmación UI y nombre de un archivo listado. El backend:

1. valida basename;
2. abre read-only;
3. ejecuta `PRAGMA integrity_check`;
4. exige schema actual;
5. crea `pre-restore-*.sqlite`;
6. restaura mediante archivo temporal;
7. reabre SQLite con foreign keys y WAL.

Existe un backup limpio inicial: `backup-20260812T094120Z.sqlite`.

## Limpieza solicitada

Se identificaron por nombre exacto y UUID los dos proyectos de validación de Fase 1. Se eliminaron únicamente esos dos. El proyecto temporal de QA visual de Fase 2 también fue eliminado al concluir. La base activa queda con cero proyectos y lista para datos reales.

## Verificación

| Prueba | Resultado |
|---|---|
| CRUD Projects/API | PASS |
| Editar/archivar/restaurar/eliminar | PASS |
| Settings y persistencia tras reapertura | PASS |
| Workflow 14 pasos y persistencia | PASS |
| Artifact versions | PASS |
| Múltiples padres | PASS |
| Stale simple/multinivel | PASS |
| Histórico no borrado | PASS |
| Evidence links | PASS |
| Backup/restore/safety backup | PASS |
| Migración F1→F2 | PASS |
| Health schema 2 | PASS |
| TypeScript shared/server/web | PASS |
| Vitest | 4 archivos, 13 tests PASS |
| Backend build | PASS |
| Frontend build | PASS |
| QA visual | PASS, 0 errores de consola |
| npm audit | 0 vulnerabilidades |

## Problemas encontrados

- El primer INSERT de artifact version tenía un placeholder adicional; la prueba lo detectó y se corrigió.
- La resolución del paquete shared necesitaba reconstrucción antes del typecheck de consumidores; el script raíz ahora la hace explícitamente.
- El screenshot full-page del navegador local repitió visualmente parte del layout fijo, pero el DOM, navegación e interacción fueron correctos.

## Estado para Fase 3

La base está lista para YouTube Sources: projects, settings, workflow, migrations, evidence links, versioning, lineage, stale, backups y restore están operativos. No se implementó ninguna fuente externa ni IA. Fase 3 requiere aprobación explícita.
