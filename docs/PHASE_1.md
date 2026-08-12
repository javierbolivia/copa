# Fase 1 — Esqueleto local y Projects

## Alcance

Esta fase valida SQLite y entrega el primer recorrido real:

`React → Fastify → SQLite → React`

Incluye health, migraciones, repositorio y API de Projects, UI base, configuración segura, contrato LLM vacío y prompts placeholder.

## Puertos

- Desarrollo frontend: `127.0.0.1:5173`.
- Backend: `127.0.0.1:4310` por defecto.
- Build local: Fastify sirve UI y API desde `127.0.0.1:4310`.

El host no es configurable y permanece limitado a loopback.

## Datos

- Base predeterminada: `data/our-platform.db`.
- La migración `001_initial` crea `schema_migrations` y `projects`.
- `DELETE /api/projects/:id` archiva; no borra físicamente.
- Los timestamps se guardan como UTC ISO-8601.

## API inicial

| Método | Ruta | Finalidad |
|---|---|---|
| GET | `/api/health` | Estado, versión y SQLite |
| GET | `/api/projects` | Lista proyectos no archivados; `includeArchived=true` incluye todos |
| POST | `/api/projects` | Crea proyecto |
| GET | `/api/projects/:id` | Obtiene proyecto |
| PATCH | `/api/projects/:id` | Actualiza campos permitidos |
| DELETE | `/api/projects/:id` | Archiva proyecto |

## Exclusiones respetadas

No hay login, pagos, YouTube, proveedor LLM real, scoring, análisis, avatar, mecanismo, landing, funnel, email ni generador de producto.
