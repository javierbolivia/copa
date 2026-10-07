# Problemas conocidos

## CRITICAL

Ninguno conocido.

## HIGH

Ninguno conocido.

## MEDIUM

- La revisión factual del manuscrito requiere una declaración humana ligada al contenido guardado, con extractos y afirmaciones por referencia. No verifica automáticamente las páginas externas ni certifica la veracidad del texto; las versiones históricas no quedan revisadas retroactivamente.
- La restauración conserva un snapshot con journal y recupera una interrupción del proceso antes de abrir SQLite. Un journal/snapshot dañado o una carpeta de restore no vacía sin journal detiene el inicio para evitar abrir datos incompletos; requiere recuperación manual desde el safety backup. Una falla física aún depende de que el sistema de archivos conserve las escrituras y renombrados confirmados.
- OpenAI acumula el uso de sus intentos de reparación. Cuando un intento no informa consumo, el total queda estimado o desconocido y no representa una factura verificada.
- No existe todavía un E2E de navegador automatizado; la integración UI se verificó mediante smoke real de las 17 pantallas, consola y viewport móvil.
- Knowledge no incluye OCR: un PDF escaneado sin capa de texto queda explícitamente en `NEEDS_OCR`.
- Embeddings y sqlite-vec están deshabilitados; FTS5/BM25 es el retrieval soportado y funcional.

### Product Studio

- Product Studio usa un editor ligero propio; BlockNote core fue auditado pero se difirió para evitar una migración innecesaria del block model estable.
- El layout final de DOCX depende de Word/LibreOffice; se valida OpenXML, contenido y assets, pero la paginación puede variar ligeramente entre visores.

## LOW

- El límite de tres importaciones YouTube concurrentes es por instancia del servidor; no coordina procesos independientes que compartan proveedor o almacenamiento.
- YouTube guarda checkpoint al terminar cada página; una interrupción dentro de la petición activa repite únicamente esa página.
- La cancelación YouTube es cooperativa entre peticiones; una petición HTTP activa puede continuar hasta su timeout.
- El launcher recompila sólo cuando faltan los artefactos `dist`; después de actualizar el código, ejecuta `npm.cmd run build` una vez antes de usarlo.
- El canvas de Funnel ofrece nodos, activación, edición y reordenación sencilla; deliberadamente no es un editor de grafos libre.
- OpenAI y YouTube permanecen `IMPLEMENTED_NOT_LIVE_VERIFIED` porque no se proporcionaron claves reales.
- Si se elimina una fuente después de una generación, el excerpt histórico permanece inmutable, pero título/biblioteca pueden mostrarse vacíos aunque su metadata siga en la cita persistida.
