# Catálogo y contratos de agentes

> **STATUS: IMPLEMENTED.** Los agentes usan políticas de Knowledge por módulo, Evidence prioritario, packs seleccionados y memoria aprobada; cada influencia queda en `knowledge_retrieval_logs/items`.

**Estado histórico:** diseño funcional; prompts y código todavía no implementados
**Regla:** “agente” significa una capacidad con contrato explícito. Puede ser LLM, determinista o híbrida; no implica autonomía abierta.

## 1. Convenciones comunes

Todos los agentes reciben IDs y versiones, no bloques copiados manualmente. El backend construye un snapshot inmutable del contexto autorizado y registra qué entradas produjo cada salida.

Todo agente con LLM debe:

- usar instrucciones originales y versionadas;
- declarar un esquema de salida;
- distinguir `observed`, `calculated`, `ai_inference` y `user_assertion`;
- citar sólo `evidenceId` incluido en su contexto;
- devolver `unknown` y una pregunta abierta cuando falte evidencia;
- pasar validación estructural, referencial y de dominio;
- guardar proveedor, modelo, tokens, coste, prompt version y lineage;
- crear una versión draft; nunca aprobarse a sí mismo.

### 1.1 Niveles de modelo

| Nivel | Uso recomendado | Política de coste |
|---|---|---|
| `none` | Extracción, cálculo, validación o exportación determinista | Sin coste LLM |
| `economy` | Clasificar, etiquetar, reformatear y crear variaciones cortas | Procesamiento por lotes pequeño |
| `balanced` | Síntesis, estrategia y redacción estándar | Valor por defecto sujeto a preflight |
| `powerful` | Razonamiento complejo o revisión final solicitada | Confirmación/configuración explícita |

El nivel no fija una marca ni un modelo. El propietario asigna modelos reales en configuración.

### 1.2 Sobre estimaciones de coste

Los costes indicados aquí son relativos. Antes de cada ejecución se estima el tamaño del contexto y después se registra el uso real si el proveedor lo informa. Los corpus grandes deben analizarse en lotes y sintetizarse; nunca se envían íntegros sin mostrar el alcance.

## 2. Research Agent

| Campo | Contrato |
|---|---|
| Nombre | `research_agent` |
| Objetivo | Convertir nicho y contexto inicial en un plan de investigación y hallazgos estructurados sin inventar fuentes |
| Inputs | `projectId`, configuración de mercado, keywords, restricciones, `sourceIds` opcionales, `researchQuestionIds` |
| Datos previos | Proyecto, fuentes ya registradas, hallazgos existentes y preguntas abiertas |
| Output schema | `subniches[]`, `problemHypotheses[]`, `searchQueries[]`, `researchQuestions[]`, `findings[]`, `gaps[]`; cada elemento con procedencia, confianza y evidence IDs permitidos |
| Datos guardados | Consultas, preguntas, hallazgos, claims, evidence links, generación y versión del artefacto de investigación |
| Siguiente módulo | Extractor/importadores y Analizador de problemas |
| ¿Usa LLM? | Sí, para ideación y síntesis; registrar fuentes es determinista/manual |
| Nivel recomendado | `balanced`; `economy` para expandir keywords |
| Coste potencial | Bajo–medio; crece con cantidad de fuentes seleccionadas |
| Validaciones | Una URL sugerida no se marca visitada; citas existen; inferencias están etiquetadas; no hay duplicados normalizados |

## 3. YouTube Comment Extractor

| Campo | Contrato |
|---|---|
| Nombre | `youtube_extractor` |
| Objetivo | Recuperar y almacenar legítimamente videos, hilos y comentarios conservando metadata y relaciones |
| Inputs | `projectId`, URL/ID de video, orden soportado, límite definido por usuario o “hasta agotar”, opción de replies |
| Datos previos | Videos/fuentes ya importados, cursores y comentarios existentes |
| Output schema | Resumen de extracción: `videoId`, `sourceId`, páginas, top-level, replies, nuevos, actualizados, duplicados, cuota estimada, cursor, estado y errores |
| Datos guardados | Fuente, video, threads, comments, parent IDs, import run, page checkpoints y cuota |
| Siguiente módulo | Analizador de problemas |
| ¿Usa LLM? | No |
| Nivel recomendado | `none` |
| Coste potencial | Sin coste LLM; consume cuota de YouTube API |
| Validaciones | URL/ID válido, pertenencia al proyecto, paginación idempotente, ID único por plataforma, dedupe, replies conectados, texto original intacto |

## 4. Problem Analyzer

| Campo | Contrato |
|---|---|
| Nombre | `problem_analyzer` |
| Objetivo | Transformar evidencia seleccionada en clusters de problemas, frustraciones, deseos, preguntas, intentos, objeciones y lenguaje |
| Inputs | `projectId`, `commentIds`/`sourceIds` o una selección guardada, filtros, idioma, granularidad |
| Datos previos | Evidencia y hallazgos aprobados; diccionario de clusters existente si se continúa un análisis |
| Output schema | `problems[]` con nombre, resumen, category, evidenceIds, representativeQuoteIds, frequency metrics, emotional signals, attemptedSolutions, objections, desiredOutcomes y confidence |
| Datos guardados | Problemas, claims, problem_evidence, métricas, etiquetas, versión y snapshot de selección |
| Siguiente módulo | Opportunity Scorer y Avatar Builder |
| ¿Usa LLM? | Híbrido: métricas/dedupe deterministas; clustering y síntesis con LLM |
| Nivel recomendado | `economy` por lote + `balanced` para síntesis final |
| Coste potencial | Medio–alto en corpus grandes; controlado por lotes, muestras y resumen jerárquico |
| Validaciones | Evidence IDs pertenecen al snapshot; frecuencia calculada, no declarada por LLM; citas exactas; clusters con nombres no vacíos; cobertura y elementos no asignados visibles |

## 5. Opportunity Scorer

| Campo | Contrato |
|---|---|
| Nombre | `opportunity_scorer` |
| Objetivo | Comparar problemas con un total 0–100 reproducible y una explicación basada en datos |
| Inputs | `projectId`, `problemIds`, fórmula/pesos versionados, señales de mercado y restricciones del usuario |
| Datos previos | Problemas aprobados, métricas de evidencia, hallazgos de competencia y decisiones anteriores |
| Output schema | `opportunities[]` con componentes, score por componente, provenance, confidence, evidenceIds, rationale, missingData, total calculado y ranking |
| Datos guardados | Oportunidades, componentes, fórmula, pesos, evidence links, ranking y selección del usuario |
| Siguiente módulo | Product Builder; Avatar puede comenzar con problemas antes de selección final |
| ¿Usa LLM? | Híbrido: cálculo final determinista; evaluación cualitativa asistida |
| Nivel recomendado | `balanced`; `none` para recalcular pesos |
| Coste potencial | Bajo–medio por conjunto de problemas |
| Validaciones | Pesos suman 100%; rangos 0–100; total reproducible; `unknown` no se convierte en cero sin regla; competencia sin fuente reduce confianza; empate conservado |

## 6. Product / PAU Builder

| Campo | Contrato |
|---|---|
| Nombre | `product_builder` |
| Objetivo | Diseñar un producto digital concreto, accionable y producible desde una oportunidad elegida |
| Inputs | `projectId`, `opportunityId`, problem IDs incluidos, restricciones de formato/tiempo/recursos y decisiones del usuario |
| Datos previos | Oportunidad aprobada, evidencia resumida, avatar si ya existe, mecanismo preliminar opcional |
| Output schema | `concept`, `promise`, `scope`, `format`, `outcomes[]`, `modules[]`, `checklists[]`, `templates[]`, `resources[]`, `bonuses[]`, `tools[]`, `assumptions[]`, `risks[]` |
| Datos guardados | Producto, módulos, recursos, claims, versiones y lineage |
| Siguiente módulo | Avatar, Mechanism y Offer Builder |
| ¿Usa LLM? | Sí |
| Nivel recomendado | `balanced`; revisión opcional `powerful` |
| Coste potencial | Medio |
| Validaciones | Toda promesa es coherente con oportunidad; alcance realizable; módulos ordenados; no hay resultados garantizados; supuestos visibles; no copia metodologías propietarias |

## 7. Avatar Builder

| Campo | Contrato |
|---|---|
| Nombre | `avatar_builder` |
| Objetivo | Construir un perfil útil de comprador desde evidencia real y lagunas explícitas |
| Inputs | `projectId`, `problemIds`, `opportunityId` opcional, evidence selection y segment criteria |
| Datos previos | Comentarios, problemas, deseos, objeciones, lenguaje, producto seleccionado opcional |
| Output schema | `segment`, `situation`, `goals[]`, `pains[]`, `frustrations[]`, `desires[]`, `objections[]`, `languagePatterns[]`, `behaviors[]`, `motivations[]`, `purchaseContext[]`, `unknowns[]`; atributos con provenance/evidence IDs |
| Datos guardados | Avatar, atributos, claims, avatar_evidence y versión |
| Siguiente módulo | Mechanism, Beliefs, Offer, Landing, Email y Content |
| ¿Usa LLM? | Sí, con agregados y evidencia seleccionada |
| Nivel recomendado | `balanced` |
| Coste potencial | Medio |
| Validaciones | Sin demografía inventada; cada atributo indica procedencia; citas exactas; contradicciones y segmentos alternativos no se ocultan |

## 8. Mechanism Builder

| Campo | Contrato |
|---|---|
| Nombre | `mechanism_builder` |
| Objetivo | Proponer una explicación diferenciada y comprensible del problema y la solución sin convertir hipótesis en hechos |
| Inputs | `projectId`, `productId`, `problemIds`, `avatarId`, evidencia seleccionada, alternativas conocidas |
| Datos previos | Producto y avatar aprobados, problemas, intentos previos, objeciones y research findings |
| Output schema | `perceivedProblem`, `proposedRootCause`, `solutionMechanism`, `differentiators[]`, `simpleExplanation`, `alternatives[]`, `supportingEvidenceIds[]`, `counterEvidenceIds[]`, `assumptions[]`, `confidence` |
| Datos guardados | Mecanismo, claims, evidencia a favor/en contra, versión y lineage |
| Siguiente módulo | Beliefs/Big Domino y Offer Builder |
| ¿Usa LLM? | Sí |
| Nivel recomendado | `balanced` o `powerful` por decisión del usuario |
| Coste potencial | Medio |
| Validaciones | La causa se etiqueta como propuesta salvo fuente; diferenciadores comparables; no hay lenguaje pseudocientífico sin evidencia; contraevidencia visible |

## 9. Beliefs / Big Domino Agent

| Campo | Contrato |
|---|---|
| Nombre | `beliefs_agent` |
| Objetivo | Identificar cambios de creencia, objeciones y una tesis central original que conecte evidencia, mecanismo y producto |
| Inputs | `projectId`, `avatarId`, `mechanismId`, `productId`, problem/evidence IDs |
| Datos previos | Avatar, objeciones, mecanismo, producto, lenguaje y evidencia aprobada |
| Output schema | `limitingBeliefs[]`, `requiredBeliefs[]`, `objections[]`, `beliefTransitions[]`, `centralThesis`, `supportingClaims[]`, `risks[]`; con procedencia y evidencia |
| Datos guardados | Beliefs, relaciones, tesis, claims, evidence links y versión |
| Siguiente módulo | Offer, Landing, Email y Content |
| ¿Usa LLM? | Sí |
| Nivel recomendado | `balanced` |
| Coste potencial | Bajo–medio |
| Validaciones | Tesis coherente con mecanismo/producto; sin certezas falsas; objeciones no fabricadas como citas; método y prompts originales |

## 10. Offer Builder

| Campo | Contrato |
|---|---|
| Nombre | `offer_builder` |
| Objetivo | Convertir producto y estrategia en una oferta clara con extensiones coherentes |
| Inputs | `projectId`, `productId`, `avatarId`, `mechanismId`, `beliefSetId`, moneda, restricciones y decisiones de precio/garantía |
| Datos previos | Producto, avatar, mecanismo, tesis, objeciones y evidencia |
| Output schema | `coreOffer`, `benefits[]`, `deliverables[]`, `bonuses[]`, `price`, `priceRationale`, `guarantee`, `orderBump`, `upsell`, `downsell`, `objectionResponses[]`, `assumptions[]` |
| Datos guardados | Oferta, items, precios, garantía, relaciones de ascensión, claims y versión |
| Siguiente módulo | Landing, Funnel, Email y Content |
| ¿Usa LLM? | Sí; precio final siempre es decisión del usuario |
| Nivel recomendado | `balanced`; revisión opcional `powerful` |
| Coste potencial | Medio |
| Validaciones | Entregables existen o están planificados; precios/garantías marcados como decisiones; bump/upsell/downsell no duplican sin razón; beneficios vinculables al producto |

## 11. Landing Builder

| Campo | Contrato |
|---|---|
| Nombre | `landing_builder` |
| Objetivo | Producir copy editable y preview local coherente, trazable y sin prueba social falsa |
| Inputs | `projectId`, `offerId`, `productId`, `avatarId`, `mechanismId`, `beliefSetId`, estilo y restricciones |
| Datos previos | Versiones aprobadas de estrategia y claims autorizados |
| Output schema | `sections[]` con type, order, headline, body, CTA, claimRefs, evidenceRefs; `seoDraft`, `designTokens`, `previewSpec` |
| Datos guardados | Landing, secciones, assertions, copy versions, preview files y lineage |
| Siguiente módulo | Funnel y exportación |
| ¿Usa LLM? | Sí para copy; render HTML/CSS determinista |
| Nivel recomendado | `balanced` |
| Coste potencial | Medio; aumenta con variaciones completas |
| Validaciones | Secciones requeridas; CTA coherente; cada prueba tiene evidence ID; HTML sanitizado/sin scripts; no hay testimonios inventados; preview coincide con copy aprobado |

## 12. Funnel Builder

| Campo | Contrato |
|---|---|
| Nombre | `funnel_builder` |
| Objetivo | Modelar páginas, decisiones y transiciones de un funnel local sin pagos reales |
| Inputs | `projectId`, `landingId`, `offerId`, productos de bump/upsell/downsell y preferencias de flujo |
| Datos previos | Landing y oferta aprobadas; páginas existentes |
| Output schema | `nodes[]`, `edges[]`, `entryNodeId`, condiciones, payloadRefs, métricas objetivo opcionales y warnings |
| Datos guardados | Funnel, nodos, edges, versiones y preview diagram |
| Siguiente módulo | Email y revisión de campaña |
| ¿Usa LLM? | Híbrido: sugerencia estratégica opcional; grafo y validación deterministas |
| Nivel recomendado | `economy` o `balanced`; `none` para editar/validar |
| Coste potencial | Bajo |
| Validaciones | Un único inicio; rutas válidas; sin nodos huérfanos; no hay ciclos accidentales; todas las ofertas referidas existen; checkout claramente simulado |

## 13. Email Agent

| Campo | Contrato |
|---|---|
| Nombre | `email_agent` |
| Objetivo | Crear secuencias coherentes con etapa, avatar, oferta y hechos disponibles |
| Inputs | `projectId`, sequence type, `offerId`, `avatarId`, `beliefSetId`, `mechanismId`, cantidad, tono y restricciones |
| Datos previos | Producto/oferta, avatar, tesis, objeciones, funnel y claims autorizados |
| Output schema | `sequence`, `emails[]` con position, delay, subject, preheader, body, CTA, purpose, claimRefs y evidenceRefs |
| Datos guardados | Secuencia, emails, versiones, claims usados y lineage |
| Siguiente módulo | Revisión/exportación de campaña |
| ¿Usa LLM? | Sí |
| Nivel recomendado | `economy` para variaciones; `balanced` para secuencia base |
| Coste potencial | Medio por volumen |
| Validaciones | Orden/retardo válido; un propósito por email; claims permitidos; placeholders visibles; sin afirmar abandono/compra real en preview; unsubscribe placeholder para futuras integraciones |

## 14. Content Engine

| Campo | Contrato |
|---|---|
| Nombre | `content_engine` |
| Objetivo | Crear contenido y calendario reutilizando automáticamente la estrategia aprobada |
| Inputs | `projectId`, channel, content types, periodo, cantidad, `avatarId`, `offerId`, `mechanismId`, `beliefSetId` |
| Datos previos | Research, avatar, mecanismo, oferta, tesis, objeciones y piezas previas |
| Output schema | `calendar[]`, `contentItems[]` con type, hook, body, CTA, angle, scheduledDate, sourceArtifactIds, claimRefs y variationGroup |
| Datos guardados | Piezas, calendario, variaciones, versiones y lineage |
| Siguiente módulo | Revisión/exportación; no publicación automática en MVP |
| ¿Usa LLM? | Sí |
| Nivel recomendado | `economy` para variaciones y `balanced` para pilares/calendario |
| Coste potencial | Medio–alto por cantidad; límites y batch configurables |
| Validaciones | Diversidad de ángulos, no duplicados cercanos, CTA permitido, claims trazables, fechas válidas y canal explícito |

## 15. Product Generator

| Campo | Contrato |
|---|---|
| Nombre | `product_generator` |
| Objetivo | Materializar el producto aprobado en archivos mediante exportadores reemplazables |
| Inputs | `projectId`, `productId`, format, secciones/recursos elegidos, tema visual y directorio permitido |
| Datos previos | Producto y contenido de producto aprobados, templates propios, archivos existentes |
| Output schema | `generatedFiles[]` con format, role, path relativo, checksum, bytes, sourceArtifactIds, exporterVersion y warnings |
| Datos guardados | Registros de archivo, checksums, versión del exportador y lineage |
| Siguiente módulo | Revisión final y exportación de proyecto |
| ¿Usa LLM? | No para render; un agente de contenido futuro puede generar borradores antes |
| Nivel recomendado | `none` |
| Coste potencial | Sin coste LLM en render; coste previo depende del contenido solicitado |
| Validaciones | Ruta confinada, archivo legible, checksum, formato permitido, render visual, no sobrescritura silenciosa y referencias completas |

## 16. Servicios que no deben llamarse agentes

Para evitar confusión, estas capacidades son servicios deterministas:

- **Context Builder:** resuelve IDs, versiones y presupuestos de contexto.
- **Workflow Engine:** dependencias, estados, aprobación y staleness.
- **Evidence Service:** conserva citas, hashes y vínculos.
- **Score Calculator:** aplica la fórmula guardada.
- **Generation Orchestrator:** ejecuta jobs LLM y valida resultados.
- **Cost Calculator:** estima y concilia uso.
- **Preview Renderer:** transforma una landing estructurada en HTML/CSS seguro.
- **Backup Service:** exporta y restaura datos.

## 17. Matriz resumida

| Agente | Tipo | Entrada dominante | Salida dominante | Nivel inicial |
|---|---|---|---|---|
| Research | LLM + humano | Contexto/fuentes | Plan y hallazgos | balanced |
| YouTube Extractor | Programático | Video/API | Comentarios | none |
| Problem Analyzer | Híbrido | Evidencia | Problemas | economy + balanced |
| Opportunity Scorer | Híbrido | Problemas/métricas | Ranking | balanced |
| Product Builder | LLM | Oportunidad | Producto | balanced |
| Avatar Builder | LLM | Evidencia/problemas | Avatar | balanced |
| Mechanism Builder | LLM | Producto/avatar | Mecanismo | balanced |
| Beliefs | LLM | Avatar/mecanismo | Tesis/creencias | balanced |
| Offer Builder | LLM + humano | Producto/estrategia | Oferta | balanced |
| Landing Builder | Híbrido | Oferta/estrategia | Copy + preview | balanced |
| Funnel Builder | Híbrido | Landing/oferta | Grafo | economy |
| Email Agent | LLM | Oferta/avatar | Secuencias | balanced |
| Content Engine | LLM | Estrategia | Contenido | economy + balanced |
| Product Generator | Programático | Producto/contenido | Archivos | none |

## 18. Política de revisión humana

Los hitos que requieren aprobación explícita antes de alimentar downstream son: conjunto de problemas, oportunidad seleccionada, producto, avatar, mecanismo, tesis, oferta y landing. La extracción y las métricas deterministas pueden confirmarse automáticamente si pasan validaciones, pero siguen siendo inspeccionables.

El usuario puede editar una salida. La edición crea una nueva versión con `createdBy=user`; conserva la generación original y marca dependencias afectadas. Ningún agente modifica silenciosamente un artefacto aprobado.
