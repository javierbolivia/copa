# Problemas conocidos

## CRITICAL

Ninguno conocido.

## HIGH

Ninguno conocido.

## MEDIUM

- La revisión factual del manuscrito requiere una declaración humana ligada al contenido guardado, con extractos y afirmaciones por referencia. No verifica automáticamente las páginas externas ni certifica la veracidad del texto; las versiones históricas no quedan revisadas retroactivamente.
- La restauración revierte fallos de ejecución y conserva un backup previo; una interrupción del proceso o del equipo durante el intercambio de archivos puede requerir recuperación manual desde ese backup.
- OpenAI acumula el uso de sus intentos de reparación. Cuando un intento no informa consumo, el total queda estimado o desconocido y no representa una factura verificada.
- Faltan pruebas automatizadas específicas para vídeo privado, comentarios deshabilitados y clave YouTube inválida, aunque el adaptador normaliza esas respuestas y el recorrido URL → persistence → comments está cubierto con mocks.
- No existe todavía un E2E de navegador automatizado; la integración UI se verificó mediante smoke real de las 17 pantallas, consola y viewport móvil.
- Knowledge no incluye OCR: un PDF escaneado sin capa de texto queda explícitamente en `NEEDS_OCR`.
- Embeddings y sqlite-vec están deshabilitados; FTS5/BM25 es el retrieval soportado y funcional.
- El campo `total` de búsqueda refleja actualmente el tamaño de la página devuelta, no un conteo global separado.

### Product Studio

- Product Studio usa un editor ligero propio; BlockNote core fue auditado pero se difirió para evitar una migración innecesaria del block model estable.
- El layout final de DOCX depende de Word/LibreOffice; se valida OpenXML, contenido y assets, pero la paginación puede variar ligeramente entre visores.

## LOW

- Los jobs YouTube recuperados tras reinicio no tienen un límite global de concurrencia.
- YouTube guarda checkpoint al terminar cada página; una interrupción dentro de la petición activa repite únicamente esa página.
- La cancelación YouTube es cooperativa entre peticiones; una petición HTTP activa puede continuar hasta su timeout.
- El launcher recompila sólo cuando faltan los artefactos `dist`; después de actualizar el código, ejecuta `npm.cmd run build` una vez antes de usarlo.
- El canvas de Funnel ofrece nodos, activación, edición y reordenación sencilla; deliberadamente no es un editor de grafos libre.
- OpenAI y YouTube permanecen `IMPLEMENTED_NOT_LIVE_VERIFIED` porque no se proporcionaron claves reales.
- Si se elimina una fuente después de una generación, el excerpt histórico permanece inmutable, pero título/biblioteca pueden mostrarse vacíos aunque su metadata siga en la cita persistida.
