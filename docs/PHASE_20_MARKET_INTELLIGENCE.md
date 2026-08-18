# Phase 20 — Market Intelligence & Opportunity Discovery

## Estado y objetivo

Esta es la especificación autoritativa de Phase 20. La prioridad es convertir Research en el motor principal de descubrimiento de problemas reales, deseos, soluciones fallidas y oportunidades comerciales. Los únicos incrementos autorizados para implementación son **20.1** y **20.2**; 20.3+ no están autorizados.

## 20.1 — Source/Signal Architecture

### Alcance autorizado

- Introducir un contrato provider-agnostic, puro y transitorio para una señal normalizada: `MarketSignal`.
- El contrato debe ser extensible a `youtube`, datos de keywords/trends de Google, `qa_forum`, inteligencia de anuncios de competidores, `review` y `reddit`; Reddit sólo podrá tener un adaptador futuro cuando la integración sea expresamente aprobada y cumpla sus requisitos aplicables.
- Cada señal debe contener como mínimo: `source`, `sourceId`, `url`, `query`, `capturedAt`, `text`, `engagement`, `context`, `pain`, `desiredOutcome`, `failedAttempt`, `currentSolution`, `solutionComplaint`, `urgency`, `specificity`, `commercialIntent` y `provenance`.
- Definir una frontera de adaptador independiente de proveedores: la capa Research consume únicamente el contrato normalizado y no DTOs ni clientes de proveedores.
- Añadir normalización determinista previa a toda síntesis LLM: valores de texto y URLs se canonizan de manera explícita, sin llamadas de red, IA, reloj, estado global ni aleatoriedad.
- `provenance` es obligatorio y debe conservar proveedor, identificador/URL de origen, consulta, instante de captura y versión de normalización suficiente para auditar el origen de cada señal.
- Añadir pruebas focalizadas de contrato, normalización determinista, preservación de provenance, extensibilidad de fuente y ausencia de mutación de entrada.

### Arquitectura y límites

- `MarketSignal` no es `Source`, `Comment` ni `EvidenceSnippet`; no se persiste ni se inserta en el Analysis Set durante 20.1.
- `MarketSignal` tampoco constituye evidencia validada ni puede crear `evidence_links`, lineage o artefactos por sí mismo. Research/evidence/traceability actuales continúan sin cambios.
- La primera implementación debe contener sólo contrato, normalizador y frontera de adaptador. No añade adaptadores concretos, claves, peticiones de red, rutas HTTP, UI ni integraciones Google/YouTube/foros/ads/reviews/Reddit.
- Se prohíben migraciones, dependencias nuevas, cambios de esquema, refactors incidentales, nichos hardcodeados y cambios de contratos existentes de Source/Evidence.

### Criterios de aceptación

1. Una señal normalizada representa un único registro capturado con fuente, identidad/URL, consulta, instante, texto, contexto/engagement, campos de oportunidad y provenance obligatorios.
2. Los campos de oportunidad permiten valores desconocidos explícitos sin inventar inferencias; ninguna normalización realiza síntesis LLM.
3. La interfaz de adaptador sólo expone/produce `MarketSignal` y mantiene los DTOs/clientes de proveedor fuera de Research.
4. Para la misma entrada, el normalizador devuelve el mismo resultado y no modifica su entrada.
5. Texto, URLs y colecciones del contrato se normalizan de forma segura, acotada y determinista; valores inválidos se rechazan antes de síntesis.
6. Cada salida conserva provenance trazable al registro externo; la implementación no altera los contratos ni las tablas de Research/Evidence existentes.
7. Las pruebas focalizadas cubren las fuentes extensibles, determinismo, provenance, seguridad de URL/texto y controles de no mutación. Las regresiones Research/Evidence relevantes siguen pasando.

## 20.2 — YouTube MarketSignal Adapter

### Alcance autorizado y límites

- Transformar de forma pura y determinista los DTOs ya obtenidos por COPA (`YouTubeVideo`, `YouTubeThread`, comentarios embedded y replies adicionales) en `NormalizedMarketSignal` mediante `normalizeMarketSignal`.
- La superficie es una transformación explícita dentro de `apps/server`; no implementa `MarketSignalAdapter.collect()` ni inicia un ciclo de importación, porque la entrada ya fue obtenida por el flujo YouTube existente.
- Cada señal conserva la identidad estable de comentario y vídeo, una URL canónica HTTPS del vídeo, la query suministrada, el texto original sujeto sólo a la canonización del normalizador, timestamps de origen, engagement y contexto/provenance auditables. Los datos necesarios ausentes o inválidos se rechazan con auditoría determinista.
- Deduplicar exclusivamente por identidad estable de comentario; el primer registro en el orden de entrada se conserva y los repetidos quedan en una auditoría inspeccionable. No se deduplica por texto.
- Los campos `pain`, `desiredOutcome`, `failedAttempt`, `currentSolution`, `solutionComplaint`, `urgency`, `specificity` y `commercialIntent` permanecen `null`. No hay inferencia ni LLM.

### No-goals de 20.2

- No crear cliente, API, provider, dependencia, llamada de red, ruta, UI/mobile ni integración YouTube paralela.
- No persistir señales ni modificar migraciones, esquema, Source, Comment, EvidenceSnippet, Analysis Set, historial, Research/Evidence o traceability.
- No implementar scoring, ranking, clustering, síntesis, inferencia comercial ni 20.3+.

## No-goals

- Integrar APIs o scraping de Google, Q&A/forums, competitor ads, reviews o Reddit.
- Persistir señales, crear migraciones, ampliar el Analysis Set o promover señales a evidencia.
- Ejecutar LLMs, deduplicación comercial, scoring de oportunidades, ranking, clustering, dashboards, UI o endpoints de señales.
- Cambiar las políticas de calidad/provenance de EvidenceSnippet, el grafo de traceability o los contratos de Source/Comment.
- Implementar 20.3+.

## Incrementos posteriores — fuera de implementación

- **20.3+** requieren una aprobación explícita y criterios propios; no quedan definidos ni autorizados por esta especificación.

## Definición de terminado para 20.1

20.1 termina sólo cuando el contrato y el normalizador provider-agnostic satisfacen todos los criterios anteriores, las pruebas focalizadas y regresiones relevantes pasan, el typecheck afectado y `git --no-pager diff --check` pasan, y el diff se limita a la documentación y arquitectura necesarias. No se realiza commit ni push sin una instrucción posterior.
