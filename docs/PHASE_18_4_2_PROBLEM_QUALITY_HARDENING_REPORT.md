# Fase 18.4.2 — Problem Quality Hardening

El validador local endurece cada cluster antes de persistirlo. Los niveles dependen ahora también del Strength: `STRONG_PATTERN` requiere fuerza >=75, al menos seis autores y dos fuentes; una sola fuente limita la fuerza a 74. `PATTERN` exige cuatro autores y fuerza >=55.

La evidencia se clasifica como reporte de problema, pregunta, solución/instrucción, elogio o contexto neutral. Un tutorial enumerado y un elogio puro sólo son contexto; no pueden ser evidencia DIRECT. Las preguntas de rendimiento que expresan demora o requisitos de hardware sí pueden ser DIRECT.

El merge global descarta etiquetas misceláneas y sólo combina firmas coherentes. Cada cluster calcula cohesión, precisión, autores, fuentes e hilos. Los clusters con cohesión menor a 55 o precisión menor a 60 no se muestran como problemas validados. La salida mantiene métricas de rechazos por cohesión, precisión, instrucción, contexto y elogio.

Research relevance continúa priorizando CORE/RELATED y los IDs de evidencia se validan contra el Analysis Set activo. La cadena UTF-8 se conserva como texto Unicode en SQLite, JSON y React; la corrección de datos evitó la conversión de consola heredada que había escrito signos `?`.

Las regresiones cubren instrucciones Photoshop, praise, rendimiento de 20 minutos, patrón Mac/Windows con una fuente, ruido frente a formatos, ruido de vídeo frente a ampliación de fotos antiguas, precisión baja y caracteres acentuados.
