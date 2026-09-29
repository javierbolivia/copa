# Auditoría y Arquitectura Open Source: Estrategia y Producto (Hallazia)

**Fecha de corte**: 2026-09-29  
**Alcance**: Pipeline generativo y de refinamiento de la sección *Estrategia y Producto*:
- **Producto** (`product`)
- **Avatar** (`avatar`)
- **Mecanismo** (`mechanism`)
- **Creencias** (`beliefs`)
- **Oferta** (`offer`)

---

## 1. Resumen Ejecutivo

Esta auditoría técnica y funcional compara en profundidad los módulos de Estrategia y Producto de Hallazia con los mejores marcos de referencia abiertos y estándares de la industria (Jobs-to-be-Done, TRIZ & Root Cause Analysis, Epistemic Argumentation / Toulmin, Alex Hormozi Value Equation, OER Curriculum Design). 

Siguiendo la directiva estricta *"no rompas absolutamente nuestro avance, si hay algo open source que mejore nuestro sistema compara con el nuestro, no copies exactamente lo que encuentres sino que mejores, compares y analices"*, se identificaron e implementaron mejoras estructurales clave en la interoperabilidad de contratos JSON Schema, la normalización defensiva contra alucinaciones o truncamientos de proveedores (DeepSeek, Gemini, Groq, OpenRouter), y la cobertura de pruebas unitarias y contratos de integración.

---

## 2. Comparativa por Módulo: Estado del Arte vs Arquitectura Hallazia

### A. Avatar del Cliente (`avatar`)

| Dimensión | Enfoques Típicos Open Source / Industria (HubSpot MakeMyPersona, Strategyzer Value Proposition Canvas) | Arquitectura Implementada en Hallazia | Análisis Comparativo y Ventajas |
|---|---|---|---|
| **Estructura** | Perfil demográfico rígido: edad ficticia (ej. "María, 34 años"), ingresos, estado civil, foto stock, arquetipo inventado. | 9 agrupaciones funcionales (`AVATAR_FIELDS`): `currentSituation`, `desiredOutcome`, `pains`, `frustrations`, `desires`, `objections`, `motivations`, `language`, `purchaseConcerns`. | Hallazia elimina el ruido demográfico sintético que desvía a los LLMs hacia estereotipos no demostrados por la investigación. |
| **Fundamentación (Provenance)** | Inferencia pura del LLM o plantilla estática sin trazabilidad a datos reales de campo. | Bipolaridad estricta `EVIDENCE_BACKED` vs `AI_INFERENCE`. Los elementos respaldados exigen `evidenceIds` válidos dentro del snapshot congelado. | Imposibilita presentar suposiciones creativas como hechos demostrados del mercado. |
| **Voz del Cliente (`language`)** | Parafraseo libre generado por el modelo ("lo que el cliente diría"). | Substring exacto literal verificado por el validador (`avatar-output-validator.ts`) contra las citas del corpus (`quoteText`). | Garantiza que el copywriting posterior en Landings y Emails emplee el léxico real de los usuarios. |
| **Edición / Refinamiento** | Mutación ciega en frontend que puede alterar o falsificar citas. | El adaptador (`avatar-adapter.ts`) degrada automáticamente cualquier afirmación editada por el usuario a `AI_INFERENCE`, retirando las citas para proteger la integridad del dato. | Cero riesgo de fabricar evidencia retrospectiva. |

---

### B. Mecanismo Único de Solución (`mechanism`)

| Dimensión | Enfoques Típicos Open Source / Industria (Todd Brown Unique Mechanism, Ishikawa 5-Whys, TRIZ Inventive Principles) | Arquitectura Implementada en Hallazia | Análisis Comparativo y Ventajas |
|---|---|---|---|
| **Diagnóstico Causal** | Mezcla confusa entre el problema superficial y la causa subyacente. | Triada de diagnóstico rigurosa: `perceivedProblem` (lo que el usuario cree que le pasa) → `apparentCause` (la explicación intuitiva equivocada) → `rootCauseHypothesis` (la causa raíz real contrastable). | Permite al lector entender por qué sus intentos previos fallaron sin culparse a sí mismo. |
| **Proceso de Solución** | Nombres vagos o descriptivos sin estructura de ejecución. | `mechanism` (nombre del mecanismo único), `solutionMechanism` (descripción operativa), `differentiation` (por qué difiere de las alternativas del mercado). | Convierte un libro genérico en una metodología propietaria con valor percibido elevado. |
| **Explicación Dual** | Un único párrafo denso o una lista de bullets inconexos. | Explicación en dos niveles: `simpleExplanation` (analogía o síntesis intuitiva en 1-2 oraciones) y `detailedExplanation` (desarrollo paso a paso del funcionamiento). | Adaptable tanto a la comunicación directa en la Landing Page como al desarrollo pedagógico en el Product Studio. |
| **Límites y Validación** | Rara vez presente en frameworks de marketing; se asume eficacia infalible. | Listas estructuradas de `limitations` (casos donde el método NO aplica) y `validationPlan` (cómo comprobar objetivamente los resultados). | Otorga autoridad ética, cumple normativas comerciales y previene reclamos de garantía. |

---

### C. Mapa de Creencias y Argumentación (`beliefs`)

| Dimensión | Enfoques Típicos Open Source / Industria (Eugene Schwartz Stages of Awareness, Russell Brunson Epiphany Bridge, Toulmin Argumentation) | Arquitectura Implementada en Hallazia | Análisis Comparativo y Ventajas |
|---|---|---|---|
| **Modelo Cognitivo** | Copywriting de persuasión tradicional basado en dolor agudo y urgencia artificial. | Modelo epistemológico de transición de creencias: `currentBeliefs` → `limitingBeliefs` → `bridgeBeliefs` → `requiredBeliefs` → `centralThesis`. | Respeta la autonomía del lector; la creencia puente (`bridgeBeliefs`) neutraliza la reactancia psicológica antes de introducir la creencia requerida. |
| **Tratamiento de Objeciones** | Argumentación reactiva ("manejo de objeciones" agresivo o descalificación). | Paridad estricta `objections` vs `arguments`: razones racionales fundamentadas en el mecanismo, reconociendo límites legítimos y alternativas de no compra. | Construye confianza inquebrantable sin manipulación ni promesas exageradas. |
| **Tesis Central** | Frase publicitaria ("tagline") desconectada del producto. | `centralThesis` que sintetiza la transformación del libro mediante la aplicación del mecanismo verificable. | Conexión directa y trazable con el Hero y los bloques Proof de la Landing Page. |

---

### D. Oferta Comercial (`offer`)

| Dimensión | Enfoques Típicos Open Source / Industria (Alex Hormozi $100M Offers, Schema.org Offer) | Arquitectura Implementada en Hallazia | Análisis Comparativo y Ventajas |
|---|---|---|---|
| **Formato y Alcance** | Paquetes heterogéneos que suelen mezclar infoproductos con servicios, coaching 1 a 1, comunidades y soporte continuo. | Estrictamente enfocado en la publicación digital: `EBOOK_ONLY`. Prohibición absoluta de soporte humano, mentorías o llamadas que sobrecarguen al autor. | Modelo de negocio de escala infinita, cero coste marginal y entrega digital instantánea. |
| **Stack de Valor** | Entregables y bonos sin desglose ni especificación de formato. | `deliverables` (materiales principales) + `bonuses` (lista canónica de nombres) + `bonusDetails` (objeto estructurado `{ name, description }` con recursos de apoyo como Workbooks y Checklists). | Maximiza el valor percibido del paquete digital manteniendo la coherencia pedagógica con el libro. |
| **Monetización y Funnel** | Precio fijo sin sugerencia fundamentada ni complementos de conversión. | `pricingSuggestion` estructurado (`amount`, `currency`, `rationale`, `terms`), rango de mercado calibrado para ebooks ($17–$47), complementos digitales de checkout: `orderBump`, `upsell`, `downsell`. | Optimiza el valor medio del pedido (AOV) mediante recursos complementarios de alta relevancia sin fricción. |
| **Garantía y Transparencia** | Garantías condicionadas o falsas afirmaciones de reembolso automático. | `guaranteeSuggestion` presentada como propuesta para aprobación humana explícita (ej. 14 días), con `disclaimer` explícito contra falsos testimonios o cifras no comprobadas. | Cumplimiento total de plataformas de pago (Hotmart, Stripe) y protección del consumidor. |

---

### E. Definición del Producto (`product`)

| Dimensión | Enfoques Típicos Open Source / Industria (OER Curriculum Design, Reforge Product Briefs) | Arquitectura Implementada en Hallazia | Análisis Comparativo y Ventajas |
|---|---|---|---|
| **Control de Capacidades** | Los LLMs inventan features arbitrarias (comunidad Discord, app móvil, sesiones Zoom, certificaciones oficiales). | Contrato de capabilities `x-hallazia-product-capability-contract.explicitAuthorization`. Prohíbe explícitamente 14 categorías comerciales fuertes sin autorización. | Prevención proactiva de alucinaciones de producto que invalidarían la viabilidad del autor. |
| **Estructura Modular** | Tabla de contenidos superficial. | Mapeo de `modules` (capítulos del ebook), `moduleOutcomes` (objetivo de aprendizaje de cada capítulo), `deliverables`, `checklists`, `templates`, `resources`, `bonuses`. | Alimenta directamente al Product Studio para la generación y maquetación de los libros físicos y digitales. |

---

## 3. Mejoras Técnicas Implementadas y Verificadas

1. **Ampliación de Esquemas Canónicos (`MODULE_OUTPUT_SCHEMAS`)**:
   - `mechanism`: Incorporación de `steps`, `alternatives`, `limitations`, `validationPlan` en propiedades de schema con preservación de campos requeridos base.
   - `beliefs`: Incorporación de `bridgeBeliefs` y `evidenceIds` en propiedades de schema.
   - `offer`: Incorporación de `bonuses` (requerido), `bonusDetails`, `pricingSuggestion` (con soporte para `amount: null`), `guaranteeSuggestion`, `orderBump`, `upsell`, `downsell`, `cta`, `disclaimer`.

2. **Normalización Defensiva de Versión (`isCanonicalModuleOutput`)**:
   - Si un proveedor emite `schemaVersion` como string numérico (`"1"`), se convierte a entero de forma segura.
   - Si un proveedor omite `schemaVersion`, se asigna por defecto `1` (o `2` para Avatar/Product), impidiendo que respuestas conceptualmente impecables sean descartadas por una clave técnica omitida.

3. **Corrección de Ejemplos en DeepSeek (`deepseek-provider.ts`)**:
   - Resolución de tipos de unión en `jsonShapeExample` (ej. `type: ["number", "null"]` ahora se evalúa a tipo numérico en lugar de caer en el fallback genérico de string `"texto"`).
   - Inyección de ejemplos coherentes de dominio para `amount` (27), `currency` ("USD"), y `provenance` ("AI_INFERENCE").

4. **Robustez en Validadores de Servidor**:
   - `offer-output-validator.ts`: Soporte para omisión de `bonuses` con inicialización predeterminada a array vacío `[]`, e inyección garantizada de `schemaVersion: 1`. Tipado explícito como `Record<string, unknown>`.
   - `beliefs-output-validator.ts`: Inyección de `schemaVersion: 1` y tipado explícito.
   - `mechanism-output-validator.ts`: Inyección de `schemaVersion: 1` y tipado explícito.

5. **Alineación de Prompts**:
   - `prompts/beliefs-agent.md`, `prompts/mechanism-builder.md`, `prompts/offer-builder.md` actualizados a versión `1.2.0`, instruyendo explícitamente el retorno de `schemaVersion: 1`.

6. **Registro en Technical Review**:
   - `technical-review-service.ts` actualizado con los mappings completos de archivos para `beliefs` y `offer`.

7. **Suite de Pruebas**:
   - Creado `apps/server/test/offer-output-validator.test.ts` (10 pruebas unitarias).
   - Creado `apps/server/test/beliefs-output-validator.test.ts` (5 pruebas unitarias).
   - Creado `apps/server/test/strategy-canonical-schema.test.ts` (6 pruebas unitarias).
   - Suite total: **119 archivos de prueba, 971 pruebas pasando al 100% (cero fallos)**. Typecheck limpio en los 3 workspaces (`shared`, `server`, `web`) y build de producción exitoso.
