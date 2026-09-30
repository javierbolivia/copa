# Traspaso para Antigravity

Última actualización: 2026-09-30
Repositorio: `C:\Users\user23\Downloads\copa 2`
Rama: `codex/fix-20.7d-relevance-regression`

## Resumen Ejecutivo

Se completó la auditoría integral y resolución de hallazgos en las 4 secciones del proyecto **"Perros Reactivos – Seed QA"** (`01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`): **Investigación**, **Fuentes**, **Problemas** y **Oportunidades**, así como la verificación real de todas las APIs configuradas y la optimización rigurosa de solidez en patrones sólidos (90-95/100).

---

## 1. Auditoría por Sección (Perros Reactivos – Seed QA)

### A. Investigación (Research)
- **Estado**: Aprobado (`approved`, versión 6, `01a0ad2b-8ed7-702d-b9b5-80669d8f9ed9`), `fresh`.
- **Validación canónica**: `validateResearchOutput` pasa con 0 errores (`ok: true`, `schemaVersion: 2`).
- **Contenido auditado**:
  - 3 subnichos bien delimitados.
  - 2 hipótesis etiquetadas como `AI_INFERENCE`.
  - 2 preguntas directas sobre dificultades en paseos urbanos.
  - 1 insight etiquetado con procedencia `AI_INFERENCE`.
  - 3 sugerencias de búsqueda.

### B. Fuentes (Sources)
- **Estado**: Aprobado (`approved`, versión 6, `01a0ad42-4eea-7678-a4ba-a15c08bf8b01`), `fresh`.
- **Métricas del corpus**: 24 fuentes de YouTube, 3.442 comentarios recolectados, 3.442 snippets de evidencia creados, 3.359 comentarios elegibles para análisis.
- **Hallazgo verificado**: 5 fuentes tienen 0 comentarios/evidencias porque los videos originales de YouTube tenían comentarios deshabilitados o ausentes (`comment_count: 0`). El pipeline los clasificó y manejó fielmente sin fallos.

### C. Problemas (Problems)
- **Estado**: Aprobado (`approved`, versión 6, `01a0eb74-d83e-7604-83b8-6c50a9f08d65`), `fresh`.
- **Pipeline**: 23 candidatos iniciales reducidos tras merge a 13 clusters y 10 problemas validados por el Quality Engine.
- **Hallazgo crítico detectado y resuelto**:
  - **Problema**: Los patrones sólidos (`STRONG_PATTERN`) mostraban en la interfaz una puntuación de solidez de **85-87/100** a pesar de contar con 254 autores, 16 fuentes, precisión del 96% y cohesión del 93%.
  - **Causa confirmada**: `focusMatch` utilizaba igualdad estricta de cadenas en `tokens()` para el cruce léxico entre el foco de investigación ("Modificación de conducta para perros reactivos") y el claim de cada problema. En español, variaciones morfológicas elementales como singular/plural (`perro` vs `perros`, `reactivo` vs `reactivos`) y derivaciones nominales adjetivales (`reactividad` vs `reactivos`) arrojaban `0` coincidencias. Esto degradaba artificialmente la relevancia léxica a 52/100 (`TANGENTIAL`), penalizando el puntaje final de solidez en ~8 puntos.
  - **Solución implementada**: Se incorporó en `problem-quality-engine.ts` la función `lexicalOverlap` con normalización morfológica determinista en español (`matchesWord` y `baseStem` para plurales `-s`/`-es` y derivaciones comunes `-idad`/`-ivo`), garantizando que variaciones flexivas de los términos clave del foco sumen soporte léxico real sin admitir términos no relacionados.
  - **Resultado comprobable**:
    - `p1` (Paseo estresante por reacciones): Relevancia 86 (`CORE`) -> **Solidez 95/100** (antes 86).
    - `p2` (Dificultad de control físico): Relevancia 86 (`CORE`) -> **Solidez 94/100** (antes 86).
    - `p3` (Miedo a mordeduras o juicio social): Relevancia 86 (`CORE`) -> **Solidez 94/100** (antes 85).
    - `p5` (Reactividad selectiva ante desencadenantes): Relevancia 86 (`CORE`) -> **Solidez 95/100** (antes 86).
    - `p7` (Respuesta ante perros sueltos): Relevancia 86 (`CORE`) -> **Solidez 94/100** (antes 87).
    - `p8` (Entrenamiento en entornos urbanos): Relevancia 86 (`CORE`) -> **Solidez 93/100** (antes 85).
    - `p11` (Dudas sobre castración/bozal): Relevancia 86 (`CORE`) -> **Solidez 94/100** (se mantiene 94).
    - `p14` (Mordeduras y conducta destructiva en cachorros): Relevancia 86 (`CORE`) -> **Solidez 94/100** (antes 90).
    - Todos los patrones sólidos alcanzan de forma comprobable el rango objetivo de **90-95/100**.

### D. Oportunidades (Opportunities)
- **Estado**: Aprobado (`approved`, versión 6, `01a0ebfa-a70d-72ba-96b0-39a4ff11f7c2`), `fresh`.
- **Estructura y contrato**:
  - `selectedId`: `"opp-p1-guia-paseo-reactividad"` (válido y presente en `items`).
  - Totales deterministas: Los 9 items cumplen exactamente la fórmula autoritativa del backend (`total = round(Σ peso * score)`).
  - Integridad referencial: Cada oportunidad referencia entre 2 y 5 IDs de evidencia que pertenecen estrictamente a su problema padre.
  - Justificaciones completas: Todos los items contienen `rationale`, los 9 `scoreRationales`, `missingData` y `validationPlan`.

### E. Producto (Product)
- **Estado**: Aprobado (`approved`, versión 9, `01a0ec13-d04e-70cb-88c4-8c4779769c94`), `fresh`.
- **Estructura**: Oferta formativa y solución estructurada anclada a la oportunidad ganadora `opp-p1-guia-paseo-reactividad`. Cumple la validación canónica de producto con grounding estricto.

### F. Avatar (Avatar)
- **Estado**: Aprobado (`approved`, versión 3, `01a0ec23-1847-76a8-af42-cf49223821c0`), `fresh`.
- **Hallazgo y corrección de validación**:
  - El validador determinista `avatar-output-validator.ts` rechazaba citas de lenguaje textual (`language`) si el LLM capitalizaba la primera letra (ej. `"Cuando..."` vs `"... pero cuando..."` en la evidencia).
  - Se corrigió normalizando la búsqueda insensible a mayúsculas/minúsculas y tolerando signos de puntuación iniciales y finales, manteniendo el rechazo estricto de paráfrasis o invenciones.
  - El borrador fue guardado como revisión de usuario y aprobado formalmente en el workflow, eliminando cualquier borrador provisional.

### G. Mecanismo (Mechanism)
- **Estado actual**: aprobado (`approved`, versión 2, `01a0f3b9-e6c2-708f-8761-eafc300f1079`), `fresh`; workflow `COMPLETED`.
- **Linaje comprobado**: Problemas v7 (`01a0ebf9-c18e-709b-a71d-161f2961cab3`), Producto v9 (`01a0ec13-d04e-70cb-88c4-8c4779769c94`) y Avatar v3 (`01a0ec23-1847-76a8-af42-cf49223821c0`), todos aprobados y vigentes al aprobar. La versión 1 quedó `superseded`; el historial se conserva.
- **Validación**: `mechanismValidationAudit.ok: true`, sin errores; linaje persistido con las tres aristas `derived_from`; integridad SQLite `ok`.
- **Contenido**: “Ruta de paseo: Observar, Ajustar, Practicar y Revisar”. Separa observaciones de hipótesis, identifica la causa raíz como hipótesis no diagnóstica, propone manejo individualizado con prioridad de seguridad y derivación profesional cuando corresponde. Declara límites y no promete eficacia.
- **Procedencia de esta ejecución**: base local `mock` v1 y borrador revisado por API canónica como v2. No hubo llamada externa a proveedores.
- **Workflow activo**: 13 etapas; Emails está retirado del flujo activo. Las filas heredadas `emails` se ocultan sin borrarse.

---

## 2. Robustecimiento de Estrategia y Pruebas Reales de APIs

### A. Mejoras en Pipeline de Estrategia (Mecanismo, Creencias, Oferta)
- **Contratos canónicos**: Esquemas JSON enriquecidos y sincronizados en `module-output-schema.ts`.
- **Validadores deterministas**: Robustecidos con validación estricta de estructura y referencias en `mechanism-output-validator.ts`, `beliefs-output-validator.ts` y `offer-output-validator.ts`.
- **Integración DeepSeek**: Manejo defensivo de tipos de unión y objetos de dominio en `deepseek-provider.ts` para evitar fallos de schema y truncamiento.
- **Auditoría Open Source**: Comparativa exhaustiva documentada en `docs/STRATEGY_PRODUCT_OPEN_SOURCE_AUDIT.md`.

### B. Pruebas Reales de APIs (Proveedores LLM)
Se ejecutó una prueba de integración en vivo con llamada real controlada para cada una de las APIs configuradas:

| Proveedor | Modelo probado | Latencia real | Estado | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **DeepSeek** | `deepseek-flash` | 2.585 ms | **SUCCESS** | Salida JSON válida `{"status":"ok"}` |
| **Google Gemini** | `gemini-3.5-flash-lite` | 1.275 ms | **SUCCESS** | Salida JSON válida `{"status":"ok"}` |
| **Groq** | `qwen/qwen3.8-27b` | 572 ms | **SUCCESS** | Salida JSON válida `{"status":"ok"}` |
| **OpenRouter** | `openrouter/free` | 2.207 ms | **SUCCESS** | Salida JSON válida `{"status":"ok"}` |

---

## 3. Verificación Automatizada

- **Pruebas unitarias e integración**: **119 archivos de prueba pasados, 971 tests en verde (100% PASS)**.
- **Typecheck**: `npm run typecheck` en los 3 workspaces (`@our-platform/shared`, `@our-platform/server`, `@our-platform/web`) limpio con 0 errores.
- **Build**: `npm run build` exitoso.
- **Calidad de formato**: `git diff --check` limpio sin errores de whitespace.

## 4. Continuación del proyecto (2026-09-30)

Proyecto: **Perros Reactivos – Seed QA** (`01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`). Verificar siempre la API y el workflow antes de continuar; no confiar solo en esta nota.

### Módulos de estrategia completados después de Mecanismo

- **Creencias v2** (`01a0f3c4-65d4-72a9-ba5b-0ecb92316de5`): `approved/fresh`, `beliefsValidationAudit.ok=true`; padre activo Mecanismo v2. La v1 mock está superseded y se conserva en el historial.
- **Oferta v2** (`01a0f3c7-6e48-7569-a006-d56cdd59e0c9`): `approved/fresh`, validación correcta y padres aprobados. Precio nulo, condiciones sin decidir, sin garantía habilitada ni order bump/upsell/downsell aprobados. Atención: la v1 mock superseded conserva `$27 USD` y una garantía inventada; no reutilizarla ni presentarla como actual.
- **Landing v2** (`01a0f3ce-acfd-76b7-aed5-04104e81f65c`): `approved/fresh`, `landingValidationAudit.ok=true`, 15 secciones y referencias dentro del snapshot de padres. La v1 mock permanece como borrador histórico no aprobado; contiene copy inseguro y referencias inválidas, no reutilizarlo.

### Funnel v4 activo

- Artefacto `01a0f3d7-0378-75fd-bdf1-4bf8694b2420`, versión activa `01a0f3db-0133-756c-ad6b-f482a1a1bf42`; `approved/fresh`, `funnelValidationAudit.ok=true`, `paymentsEnabled=false`.
- Se pidió no usar mock para la generación final. Se hizo **una sola generación real con DeepSeek** (proveedor predeterminado configurado), sin fallback ni reintento. La salida DeepSeek v2 marcaba varias etapas activas pese al texto propuesto; se conservó en historial como superseded y se guardó/revisó v4 mediante API canónica.
- En v4 solo Landing está activa. Captación, checkout, complementos, upsell, downsell y entrega están inactivos; no hay precio, URL, plataforma comercial ni eventos/ID de tracking. Las sugerencias de ofertas adicionales se etiquetan como no aprobadas y no incluidas en la oferta vigente. Pagos siguen deshabilitados.
- **Historial**: Funnel v1 se generó con mock antes de que el usuario indicara “no uses mock”; queda superseded, no es el Funnel actual. Funnel v3 quedó borrador y fue superseded por v4. No borrar historial.
- **Cambio de código**: `createContextOutput()` ya no inserta Pixel, Hotmart, precio `$27` ni eventos Purchase ni complementos descriptivos marcados activos; el flujo contextual deja checkout y etapas opcionales inactivos, tracking vacío y labels de transiciones condicionados a aprobación. Prueba `apps/server/test/funnel-contract.test.ts`: 4/4 GREEN; `npm.cmd run typecheck --workspace @our-platform/server`: GREEN.

### Próximo paso y límites

- Workflow reconciliado: 13 etapas activas. Emails fue retirado del producto el 2026-09-16; una fila heredada `emails` permanece intacta en la base de datos, pero no aparece en el workflow ni en sus totales. Content v2 está aprobado/fresh. Final Product v1 aparece aprobado en el workflow, pero su `guide.md` contiene títulos y texto placeholder, no el Ebook completo; el borrador real de Product Studio está en progreso y tampoco completa todavía el Ebook. No declarar el Ebook terminado.
- El usuario indicó explícitamente **“no uses mock”**. Para cualquier generación real futura, usar una sola llamada con el proveedor configurado elegido; inspeccionar provider/status antes, no hacer fallback/reintento salvo autorización, y revisar salida antes de aprobar. No usar datos mock en los artefactos activos.
- Sin deploy. No afirmar inspección visual global.

## Checkpoint Product Studio real — 2026-09-30

- Se corrigió el default de Product Studio: si el proyecto no fija proveedor, ahora elige DeepSeek configurado antes que OpenAI; una selección explícita no configurada o no admitida falla claramente en vez de caer a mock. El proveedor y modelo reales quedan registrados en generaciones/uso. Los JSON estructurados de capítulo tienen reintento de esquema deshabilitado; el límite de salida es `max(5000, targetWords × 4)`, tope 12.000.
- El contrato admite `evidenceIds` como arreglo y filtra IDs estrictamente contra evidencia efectivamente incluida. El prompt exige UUID exactos y prohíbe alias como `item-1`/`E1`. El normalizador falla de forma cerrada ante alias, citas, textos largos entrecomillados o atribuciones a personas sin referencia válida. El panel UI ya no etiqueta una generación sin metadatos como `Mock: $0 Demo`.
- En el proyecto `01a0289f-9377-70b0-b9ac-a0eb5a9dd35a` se creó el documento real `01a0f3fa-4cb3-7401-92be-48d358c0237e` con 10 capítulos; DeepSeek (`deepseek-flash`) es el proveedor. Al 2026-09-30 el documento está en v22, `IN_PROGRESS/fresh`; capítulos 1–5 `DRAFT`, capítulos 6–10 `PENDING`. Las cinco generaciones completadas de capítulos fueron con DeepSeek, sin fallback ni mock. Capítulo 1 se generó tras dos intentos fallidos no repetidos; 1–3 se revisaron previamente en v18. Capítulos 4–5 se revisaron con autosave canónico y permanecen `AI_INFERENCE`, sin citas ni alias no verificadas; no se aprobó ninguno.
- Revisión de seguridad del capítulo 5: se eliminaron dos citas/atribuciones falsas al corpus y recomendaciones de ponerse entre perros o soltar deliberadamente la correa. Orientación prudente contrastada con [Dogs Trust: reactive dogs](https://www.dogstrust.org.uk/dog-advice/training/unwanted-behaviours/reactive-dog), [PDSA: dog attacks](https://www.pdsa.org.uk/pet-help-and-advice/looking-after-your-pet/puppies-dogs/dog-attacks) y [AVSAB: humane dog training](https://avsab.org/resources/position-statements/). El producto no tiene referencias bibliográficas enlazadas para estas páginas; los bloques siguen correctamente clasificados como `AI_INFERENCE`.
- Hallazgo de coste: cinco generaciones registradas reportaron aproximadamente 439.500 tokens de entrada y USD 0,57 cada una. El código estaba enviando íntegro el contexto de padres; el artefacto upstream `problems` supera 1,25 MB y contiene comentarios crudos. Se añadió compactación de contexto por capítulo (máximo 1.600 caracteres por etapa, omite evidencia/citas crudas) para no reenviar todo el corpus. Las pruebas enfocadas pasan 15/15 y el typecheck del servidor pasa; aún falta confirmar el consumo reducido en una generación posterior antes de confiar en que el runtime ya cargó este cambio.
- La revisión visual fue enfocada a Product Studio local; no se hizo auditoría visual global. No aprobar ni exportar como terminado. Próximo: confirmar la compactación en runtime antes de gastar otra llamada; después continuar de uno en uno con DeepSeek, verificar cada generación y mantener borradores hasta revisión. Falta completar capítulos 6–10 y validar/exportar el documento final; no declarar el Ebook terminado.
