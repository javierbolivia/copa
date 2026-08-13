# Backup previo a Fase 17

- Checkpoint protegido: `1e4b982` (`phase16-stable`).
- Rama de trabajo: `codex/phase17-knowledge-engine`.
- Fecha UTC: `2026-08-13T03:53:50Z`.
- Origen: `data/`.
- Destino: `backups/pre-phase17-data-20260813T035350Z/data/`.
- Archivos origen/copia: `22 / 22`.
- Bytes origen/copia: `2,736,302 / 2,736,302`.
- Diferencias SHA-256: `0`.

La base activa no fue borrada ni sustituida. El backup conserva SQLite, exports, backups locales y sidecars existentes tal como estaban antes de Fase 17.

## Baseline verificado

- Node.js `v24.15.0` y `node:sqlite`: PASS.
- TypeScript shared/server/web: PASS.
- Tests preexistentes: PASS — `39/39`.
- Build backend/frontend: PASS.
- npm audit: PASS — `0 vulnerabilities`.
