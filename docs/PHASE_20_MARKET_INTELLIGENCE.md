# Phase 20 — Market Intelligence & Opportunity Discovery
## Estado y objetivo
Esta es la especificación autoritativa de Phase 20. La prioridad es convertir Research en el motor principal de descubrimiento de problemas reales, deseos, soluciones fallidas y oportunidades comerciales. Los incrementos implementados y autorizados son **20.1**, **20.2** y el benchmark aislado **20.3**.
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
## 20.3 — benchmark transitorio server-only

20.3 añade un benchmark aislado para comparar adquisición de YouTube, Tavily, Exa, Firecrawl y Brave Search. No modifica Research, el pipeline de módulos, rutas, UI, base de datos, migraciones ni proveedores LLM. Los resultados son `MarketSignal` transitorios y nunca se persisten.

### Límites y adquisición

- Una única consulta por ejecución.
- YouTube selecciona como máximo un vídeo, pide una página de hasta 10 hilos y produce hasta 10 señales. No expande replies.
- Cada discovery web recibe un máximo de 5 resultados.
- `FirecrawlProvider.scrape(url)` es opcional y acepta una única URL explícita por llamada; la orquestación de benchmark puede efectuar como máximo tres llamadas secuenciales. Nunca usa crawl ni endpoints batch, y el benchmark no hace scrape de los resultados por defecto.
- El benchmark deja como máximo 20 señales para cualquier análisis futuro. No implementa ni invoca LLM.
- Un fallo por proveedor queda registrado con una categoría segura (`missing_api_key`, `timeout`, etc.) y no detiene a los restantes.

Los clientes de Tavily, Exa y Firecrawl conservan su método `search` de conectividad. Sus nuevos métodos `discover` devuelven DTOs limitados (`id`, `url`, `title`, `text`, `snippet`, `publishedAt` cuando existen) más metadatos de uso. Brave usa el endpoint oficial GET y `X-Subscription-Token` con `BRAVE_SEARCH_API_KEY`.

### Normalización y métricas

`MarketSignalSource` incorpora `web`; los adaptadores web puros conservan proveedor, identidad/URL, query y hora de recuperación en provenance, junto con un contexto JSON limitado. Los campos semánticos permanecen `null`. Cada registro malformado se rechaza de forma aislada y los demás se normalizan mediante `normalizeMarketSignal`.

Cada adquisición devuelve un resultado transitorio tipado con `requested`, `returned`, `valid`, señales normalizadas, `latencyMs`, `usage`, `credits` y `estimatedCost` sólo cuando el proveedor lo declara explícitamente. Los nombres de proveedor deben ser únicos y se validan antes de iniciar I/O. Los acquirers aplican sus límites antes de pedir datos: YouTube busca un único vídeo (`maxResults=1`) y pide como máximo el presupuesto de hilos; discovery web solicita como máximo cinco resultados.

El benchmark deduplica en el orden de llegada de los adquisidores inyectados con una única identidad de precedencia: `source + sourceId` cuando existe; URL ya canónica sólo si no existe `sourceId`; texto normalizado sólo para futuros contratos sin ninguna identidad. Por tanto, comentarios YouTube distintos del mismo vídeo no se deduplican por URL. `duplicatesRemoved` cuenta únicamente identidades repetidas; los candidatos únicos que exceden el máximo global de 20 se registran por separado en `discardedByAnalysisBudget`.

Cada proveedor informa `REQUESTED`, `RETURNED`, `VALID`, `DUPLICATES`, `UNIQUE`, diversidad (hostnames), `usableTextRate`, `evidenceDensity`, candidatos comerciales explícitos, cobertura de frescura, latencia, uso/créditos, coste explícito o `null`, categoría segura de fallo y uno de estos verdicts exactos: `KEEP_PRIMARY`, `KEEP_SECONDARY`, `EXTRACTION_ONLY`, `LOW_VALUE` o `INSUFFICIENT_DATA`. `usableTextRate` es la proporción de señales únicas con texto no vacío; `evidenceDensity` es `valid / returned` (cero si no se devolvieron registros), sin reclamar que una señal sea Evidence validada. Los agregados globales separan solicitadas, devueltas, válidas, únicas, retenidas, duplicados y recortes de presupuesto.

El texto de una señal web se limita a 1.500 caracteres antes de normalizar y su contexto JSON de discovery se limita a 2.000 caracteres. La evidencia es `FRESH_EVIDENCE` si al menos una señal retenida tiene `capturedAt` entre la referencia y los 90 días anteriores; es `STALE_EVIDENCE` cuando existe evidencia pero ninguna es fresca, y `NO_EVIDENCE` cuando no queda ninguna. Los candidatos comerciales cuentan exclusivamente `commercialIntent` no nulo: `EXPLICIT_COMMERCIAL_CANDIDATES` o `NO_EXPLICIT_COMMERCIAL_CANDIDATES`. No se infiere intención desde texto, título o snippet.

### Ejecución manual

Ejecutar con `npx tsx apps/server/src/scripts/market-intelligence-benchmark.ts`. El script carga `.env` silenciosamente, admite `MARKET_BENCHMARK_TOPIC` o usa un topic fijo, y emite sólo estados seguros por proveedor, métricas y verdicts. No imprime claves, query, señales, URLs, textos ni respuestas crudas. Si falta una clave, el proveedor reporta `missing_api_key` sin red.

## No-goals
- Integrar APIs o scraping de Google, Q&A/forums, competitor ads, reviews o Reddit.
- Persistir señales, crear migraciones, ampliar el Analysis Set o promover señales a evidencia.
- Ejecutar LLMs, deduplicación comercial, scoring de oportunidades, ranking, clustering, dashboards, UI o endpoints de señales.
- Cambiar las políticas de calidad/provenance de EvidenceSnippet, el grafo de traceability o los contratos de Source/Comment.
- Implementar 20.4+ sin aprobación explícita.
## Incrementos posteriores — fuera de implementación
- **20.4+** requieren una aprobación explícita y criterios propios; no quedan definidos ni autorizados por esta especificación.
## Definición de terminado para 20.1
20.1 termina sólo cuando el contrato y el normalizador provider-agnostic satisfacen todos los criterios anteriores, las pruebas focalizadas y regresiones relevantes pasan, el typecheck afectado y `git --no-pager diff --check` pasan, y el diff se limita a la documentación y arquitectura necesarias. No se realiza commit ni push sin una instrucción posterior.
