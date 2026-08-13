# Búsqueda vectorial futura

Estado: **NO IMPLEMENTADA / NO NECESARIA PARA FASE 17**.

FTS5/BM25 es el motor soportado y funcional. La plataforma ya separa retrieval, políticas por agente y `EmbeddingProvider`, por lo que una capa vectorial futura no debe cambiar contratos de dominio, trazabilidad ni el fallback léxico.

## Condiciones para activarla

- Fijar un modelo de embeddings, dimensión, versión y política de reindexado.
- Medir calidad contra un corpus/eval reproducible; no adoptar vectores sólo por novedad.
- Mantener aislamiento privado/global y filtros antes del ranking.
- Persistir proveedor, modelo, score, chunk y versión de índice en cada retrieval.
- Probar instalación, carga de extensión, backup/restore, DELETE, migraciones y empaquetado en Windows.
- Caer limpiamente a FTS5 si el proveedor o extensión no está disponible.

## sqlite-vec

La revisión de `sqlite-vec` 0.1.9 encontró una API pre-1.0 y carga nativa que requiere `allowExtension`. ANN sólo aparecía en una alpha experimental al corte de la auditoría. Por ello no forma parte del schema crítico ni de las dependencias instaladas.

Si madura, debe entrar detrás de un adaptador intercambiable y una feature flag. La primera implementación recomendada es búsqueda híbrida: candidatos FTS5 + candidatos vectoriales, normalización separada, fusión determinista y deduplicación, siempre respetando las políticas por agente y el presupuesto de contexto existente.

## Criterio de aceptación futuro

Se activa únicamente si mejora métricas de recuperación sobre FTS5, conserva citas exactas y pasa tests de aislamiento, integridad, rendimiento, backup/restore y fallback sin red.
