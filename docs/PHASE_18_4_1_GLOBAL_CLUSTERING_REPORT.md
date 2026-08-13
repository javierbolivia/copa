# Fase 18.4.1 — Research Focus y clustering global

El Research Focus es un campo persistente por proyecto. La precedencia es texto explícito del usuario, consulta de YouTube cuando no existe un texto explícito, y finalmente el nicho del proyecto. Nunca se forma contando palabras de títulos.

Problemas Gemini usa el Analysis Set completo: comentarios elegibles se agrupan en lotes de 60 para la etapa MAP. Cada lote devuelve candidatos con firma semántica, relevancia y enlaces de evidencia. La etapa REDUCE recibe sólo esos candidatos resumidos, no vuelve a enviar el corpus RAW. El validador local fusiona firmas globalmente, elimina IDs no existentes y recalcula evidencia directa/inferida, autores, fuentes, hilos, precisión, relevancia y fuerza.

Las métricas guardadas en la salida incluyen fuentes activas, comentarios RAW/elegibles/procesados, cobertura, batches, candidatos, clusters y distribución Signal/Emerging/Pattern/Strong Pattern. CORE y RELATED se priorizan; TANGENTIAL queda marcado como secundario y OUT_OF_SCOPE no debe dominar resultados.

La recurrencia usa autores únicos como señal primaria y fuentes/hilos como diversidad; replies del mismo hilo permanecen trazables pero no convierten artificialmente una señal en patrón. Ninguna versión anterior se modifica: un nuevo focus sólo deja obsoletas las interpretaciones posteriores.

Las pruebas focalizadas cubren foco humano, ausencia de keyword soup, batches, fusión global de candidatos, niveles de relevancia, validación de evidence IDs y topes de fuerza. Las llamadas a Gemini se simulan en pruebas.
