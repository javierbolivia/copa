# Backup previo a schema 5

**Fecha UTC:** 2026-08-13T02:40:31Z  
**Estado de la base activa al respaldar:** schema 3  
**Servidor del proyecto:** detenido; no había listeners en `127.0.0.1:4310` ni `127.0.0.1:5173`.

## Ubicación

`backups/pre-schema5-data-20260813T024031Z/`

El respaldo es una copia completa del directorio `data/` realizada antes de abrir la base con el código schema 5. No se eliminó ni modificó la base original durante esta operación.

## Verificación

- Archivos en origen: 20.
- Archivos en backup: 20.
- Tamaño del origen: 2,690,982 bytes.
- Tamaño del backup: 2,690,982 bytes.
- `our-platform.db`: existe en ambos lados y su SHA-256 coincide.
- `our-platform.db-wal`: existe en ambos lados y su SHA-256 coincide.
- `our-platform.db-shm`: existe en ambos lados y su SHA-256 coincide.
- Los exports bajo `data/generated/` y backups SQLite previos quedaron incluidos.

Este directorio está ignorado por Git para evitar versionar datos locales o duplicar bases SQLite.
