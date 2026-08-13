# Mini Fase 18.2 — verificación real de YouTube

Estado: `COMPLETED` con corrección de límite aplicada el 2026-08-13.

- Configuración comprobada exclusivamente mediante `/api/integrations/youtube/status`: `configured=true`. La clave no se mostró ni se registró.
- La importación pública real terminó `COMPLETED` al 100%; la fuente quedó `ready` y no hay IDs de comentario de plataforma duplicados.
- Conteo de esa fuente: 1.317 comentarios, 781 top-level y 536 replies, pertenecientes a 117 hilos con respuestas.
- La ejecución inicial no respetó el límite esperado de 500 top-level. Se corrigió el importador para futuros jobs: solicita/persiste como máximo 500 hilos top-level.
- Las replies no consumen ese cupo: se persisten separadamente con `is_reply=true` y `parent_comment_id`, incluyendo las embebidas y las páginas adicionales necesarias para completar los hilos seleccionados.

Validación focalizada: test de límite de 500 top-level con replies, test de Sources, typecheck y build PASS. La importación existente se conserva intacta como evidencia de la prueba real; no se reimportó ni se consultó YouTube otra vez.
