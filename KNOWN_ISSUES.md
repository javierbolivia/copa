# Problemas conocidos

## CRITICAL

Ninguno conocido.

## HIGH

Ninguno conocido.

## MEDIUM

- El retry de reparación estructurada de OpenAI no suma los tokens de la primera respuesta inválida; el coste registrado corresponde a la respuesta final y puede subestimar ese caso excepcional.
- Faltan pruebas automatizadas específicas para vídeo privado, comentarios deshabilitados y clave YouTube inválida, aunque el adaptador normaliza esas respuestas y el recorrido URL → persistence → comments está cubierto con mocks.
- No existe todavía un E2E de navegador automatizado; la integración UI se verificó mediante smoke real de las 17 pantallas, consola y viewport móvil.

## LOW

- Los jobs YouTube recuperados tras reinicio no tienen un límite global de concurrencia.
- YouTube guarda checkpoint al terminar cada página; una interrupción dentro de la petición activa repite únicamente esa página.
- La cancelación YouTube es cooperativa entre peticiones; una petición HTTP activa puede continuar hasta su timeout.
- El launcher recompila sólo cuando faltan los artefactos `dist`; después de actualizar el código, ejecuta `npm.cmd run build` una vez antes de usarlo.
- El canvas de Funnel ofrece nodos, activación, edición y reordenación sencilla; deliberadamente no es un editor de grafos libre.
- OpenAI y YouTube permanecen `IMPLEMENTED_NOT_LIVE_VERIFIED` porque no se proporcionaron claves reales.
