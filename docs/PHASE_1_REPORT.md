# Informe de cierre — Fase 1

**Fecha:** 12 de agosto de 2026  
**Resultado:** PASS  
**Alcance siguiente:** no iniciado; requiere aprobación

## 1. SQLite elegida

Se eligió `node:sqlite` con `DatabaseSync`, integrado en Node.js 24.15.0.

El spike real verificó creación de base/tabla, INSERT, SELECT, UPDATE, DELETE, rollback, commit, cierre, reapertura y persistencia en disco. No requiere Python, addons nativos ni CLI SQLite.

## 2. Estructura creada

- `apps/web`: React, TypeScript y Vite.
- `apps/server`: Fastify, Node.js, migraciones, repositorio y API.
- `packages/shared`: schemas TypeBox, tipos y contrato LLM.
- `prompts`: 14 placeholders con metadata.
- `data`: bases y archivos locales ignorados por Git.
- `docs`: decisión SQLite, guía de fase e informe.
- `scripts`: spike reproducible.

## 3. Funciones implementadas

- Sidebar con los 16 destinos solicitados.
- Pantalla `Mis Proyectos` y placeholders de módulos futuros.
- Modal `Nuevo proyecto` con nombre, nicho y descripción opcional.
- Lista de proyectos persistidos.
- `GET /api/health` con versión, SQLite y schema version.
- Crear, listar, obtener, actualizar y archivar Projects.
- Migración `001_initial` y `schema_migrations`.
- Host fijo `127.0.0.1`.
- Frontend compilado servido por Fastify.
- Contrato `LlmProvider` sin proveedor real.
- `.env.example` y `.gitignore` sin secretos.

## 4. Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| Node.js 24.15.0 | PASS |
| Spike `node:sqlite` | PASS, 10 comprobaciones |
| TypeScript shared | PASS |
| TypeScript server | PASS |
| TypeScript web | PASS |
| Tests SQLite | PASS, 1 |
| Tests ProjectRepository | PASS, 2 |
| Tests health/API Projects | PASS, 3 |
| Total Vitest | PASS, 3 archivos / 6 tests |
| Build backend | PASS |
| Build frontend | PASS, 29 módulos |
| `npm.cmd run dev` | PASS fuera del sandbox de Codex |
| Frontend dev `127.0.0.1:5173` | HTTP 200 |
| Proxy dev `/api/health` | PASS |
| Build local `127.0.0.1:4310` | PASS |
| Reinicio + recuperación desde SQLite | PASS |
| Creación desde la UI | PASS |
| Recarga visual y persistencia | PASS, 2 tarjetas |
| Errores de consola en prueba visual | 0 |
| Secret scan | PASS |
| `npm audit` | PASS, 0 vulnerabilidades |
| Python requerido | No |
| Login requerido | No |

## 5. Persistencia de aceptación

Se creó un proyecto mediante API, se detuvo completamente el proceso Node, se reinició el servidor sobre `data/our-platform.db` y reapareció la misma UUID.

Después se creó un segundo proyecto desde el formulario React. Tras recargar la página, ambos seguían visibles. Los datos se dejan en la base local como evidencia de aceptación.

## 6. Incidencias y resolución

### Aserción inicial del spike

El primer test asumía un rowid concreto y objetos con prototipo normal. Se corrigió la aserción; SQLite había actuado correctamente.

### Imports TypeScript

El modo estricto exigió imports type-only. Se corrigieron y los tres typechecks pasan.

### Respuestas 404 tipadas

Fastify/TypeScript exigió un schema de error explícito. Se añadió `ApiErrorSchema` compartido.

### Vulnerabilidad de `@fastify/static`

La instalación inicial eligió una versión afectada por advisories de path traversal. Se actualizó a 10.1.3. Auditoría final: cero vulnerabilidades.

### Restricciones del sandbox de Codex

Vite/esbuild y `tsx` no podían acceder a ciertos datos/directorios del sistema dentro del sandbox. Build y `npm.cmd run dev` se repitieron fuera del sandbox autorizado y pasaron. Esto no afecta la consola Windows normal del usuario.

### PowerShell y UTF-8

Windows PowerShell calculó incorrectamente Content-Length en un request manual con acentos. El navegador envió UTF-8 correctamente; las pruebas API y la UI aceptan Unicode. Se usó ASCII sólo para esa comprobación manual.

### Directorio de workspace

Los scripts npm de workspaces cambian el directorio actual. Se corrigió la configuración para resolver siempre `.env` y `data/` desde la raíz del repositorio.

## 7. Seguridad y alcance

- Servidor ligado únicamente a loopback.
- Consultas parametrizadas.
- Validación runtime de payloads.
- Archivar en vez de borrar físicamente.
- `.env`, SQLite, datos y logs ignorados.
- Ninguna clave real incluida.
- Sin fuentes, scripts o tipografías remotas en la UI.
- No se conectó OpenAI, YouTube ni otro servicio.

El workspace no estaba inicializado como repositorio Git; no se creó ningún commit. El escaneo del árbol de código no encontró claves y `.gitignore` está preparado para una futura inicialización.

## 8. Comandos

```powershell
npm.cmd install
npm.cmd run dev
```

Verificación:

```powershell
npm.cmd run spike:sqlite
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Build local:

```powershell
npm.cmd run build
npm.cmd start
```

## 9. Siguiente fase propuesta

Según el plan aprobado, corresponde continuar con **Proyectos, SQLite y respaldos** y después **artefactos, versiones, lineage y workflow**. Como Projects básico ya existe, la siguiente fase debería completar:

1. edición y archivado desde UI;
2. configuración de proyecto;
3. backup consistente y restauración validada;
4. estados de workflow;
5. artifacts, artifact_versions, lineage_edges y staleness_events.

No debe iniciarse hasta recibir aprobación explícita. YouTube y proveedores LLM siguen fuera de alcance.
