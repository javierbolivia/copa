# Our Platform

Aplicación personal y local que transforma evidencia de mercado en productos digitales y activos comerciales trazables. El recorrido completo funciona sin API keys con datos `DEMO` claramente identificados.

## Stack

- Node.js 24 + TypeScript
- React + Vite
- Fastify
- SQLite mediante `node:sqlite` / `DatabaseSync`
- Host local fijo: `127.0.0.1`

No incluye login, roles, pagos ni servicios SaaS obligatorios.

## Inicio rápido

```powershell
npm.cmd install
npm.cmd run dev
```

Abre `http://127.0.0.1:5173`. Para probar todo, pulsa **Crear proyecto Demo**. Se crearán Sources, evidencia, los 14 artefactos versionados y los archivos finales sin llamadas externas.

Build compilado:

```powershell
npm.cmd run build
npm.cmd start
```

Abre `http://127.0.0.1:4310`.

## Verificación

```powershell
npm.cmd run spike:sqlite
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit
```

La base se guarda en `data/our-platform.db`; exports en `data/generated/`; backups SQLite y sus sidecars de archivos en `data/backups/`. Todo ese contenido y `.env` están excluidos de Git.

## Workflow

Research → Sources → Problems → Opportunities → Product → Avatar → Mechanism → Beliefs → Offer → Landing → Funnel → Emails → Content → Final Product.

Cada resultado importante tiene `artifactId`, `versionId`, snapshot, padres de lineage, estado de frescura e historial. Reemplazar una versión upstream conserva las anteriores y marca descendientes `STALE`.

## Fuentes e integraciones

- Demo Fixture: funcional sin configuración.
- Texto manual: funcional y segmentado en evidencia trazable.
- YouTube Data API: adaptador oficial, paginación, replies, deduplicación, jobs, cancelación, reintento y recuperación tras reinicio.
- Mock LLM: funcional y determinista.
- OpenAI Responses API: adaptador implementado; requiere `OPENAI_API_KEY` y conexión explícita a un perfil de ejecución real.

Copia `.env.example` a `.env` sólo para habilitar integraciones. Nunca guardes claves en Git. Consulta [API_KEYS_TODO.md](API_KEYS_TODO.md).

## Documentación

- [Informe final](FINAL_BUILD_REPORT.md)
- [Claves pendientes](API_KEYS_TODO.md)
- [Problemas conocidos](KNOWN_ISSUES.md)
- [Decisión SQLite](docs/SQLITE_DECISION.md)
- [Progreso autónomo](docs/AUTONOMOUS_PROGRESS.md)
