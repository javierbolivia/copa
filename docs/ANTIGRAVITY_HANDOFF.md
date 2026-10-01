# Traspaso para Antigravity

Última actualización: 2026-09-30
Repositorio: `C:\Users\user23\Downloads\copa 2`
Rama: `codex/fix-20.7d-relevance-regression`

## Resumen Ejecutivo

Se completó la auditoría integral y resolución de hallazgos en las 4 secciones del proyecto **"Perros Reactivos – Seed QA"** (`01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`): **Investigación**, **Fuentes**, **Problemas** y **Oportunidades**, así como la verificación real de todas las APIs configuradas y la optimización rigurosa de solidez en patrones sólidos (90-95/100).

> Estado cambiante: las secciones A-G y los checkpoints anteriores son notas históricas. Para el estado operativo actual del ebook, proveedores y exportación, consulta **“Checkpoint vigente Product Studio — v49”** al final; no asumas que los checkpoints anteriores son actuales.

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

## Checkpoint vigente Product Studio — v52 (2026-10-01)

Verificado contra la API local en v52. Las v46 y v47 fueron autosaves temporales sin cambio de contenido respecto a v45 (una incluyó y la siguiente quitó un bloque vacío); se conservan en el historial. Este bloque es el estado operativo más reciente.

- Documento `01a0f3fa-4cb3-7401-92be-48d358c0237e`, título **Perros reactivos en el paseo — guía práctica**, v52, `IN_PROGRESS`, `fresh`; 10 capítulos, 261 bloques. El primer capítulo aparece `APPROVED` y los otros nueve `DRAFT`. La API no informa quién inició esa aprobación. Preservar el estado observado, no aprobar más capítulos ni el ebook completo sin autorización explícita. No declarar el libro terminado.
- Estado de proveedor del proyecto: `preferredLlmProvider=gemini`. El historial de generaciones completadas específicamente para capítulos contiene **3 Gemini (`gemini-3.5-flash-lite`) y 7 DeepSeek (`deepseek-flash`)**; no se usó mock para generar el contenido del ebook. Los tres registros Gemini suman aproximadamente **USD 0,03256** (10.643 tokens de entrada); las siete generaciones DeepSeek suman aproximadamente **USD 2,93** (2,21 M tokens de entrada), incluidas cinco generaciones históricas de ≈439.500 tokens cada una. No hacer regeneraciones en lote; preferir correcciones manuales pequeñas y estimar antes de cualquier llamada nueva.
- El backend ahora permite seleccionar Gemini explícitamente en Product Studio y falla de forma cerrada si ese proveedor está seleccionado pero no configurado; no hace fallback silencioso. La prueba de integración `product-studio-gemini.test.ts` usa transporte falso solo para pruebas automatizadas, no para escribir contenido del ebook. Pruebas enfocadas Gemini/DeepSeek/Product Studio: 12/12; `product-export.test.ts`: 9/9; typecheck del servidor: verde.
- La validación actual del documento devuelve `errors=[]`, `warnings=[]`, `claimWarnings=[]`, `canExport=true`. Se corrigió un falso positivo que marcaba `todo`, `método` y el verbo “completar” como placeholders; solo se detectan marcadores explícitos como `TODO:`. La revisión v33 corrigió doble puntuación en el capítulo inicial. En v38 se suavizó una inferencia demasiado concluyente del capítulo 2, se aclaró que un testimonio del capítulo 8 es anecdótico/no generalizable y se corrigieron dos erratas del checklist del capítulo 10. En v39 se añadió al capítulo 4 la referencia oficial de AVSAB sobre métodos aversivos/correcciones de correa; el consejo permanece `AI_INFERENCE`, sin atribuir cada frase a AVSAB. En v40 se resumieron tres testimonios del capítulo 6 conservando los cuatro IDs originales y se añadió una secuencia práctica, sin inferir causalidad. En v41 se afinó la explicación de “dominancia” del capítulo 2 para distinguir una relación entre individuos de una explicación automática de conducta, con fuentes AVSAB y Dogs Trust. En v42 se precisó que solo se cruce donde el tránsito lo permita y que cualquier parada o cambio de acera sea en un lugar protegido, para mantener consistencia entre los capítulos 4 y 7. En v43 se actualizó la URL VCA del capítulo 8 a la página regional activa del mismo artículo. En v44 se añadió Dogs Trust como fuente contextual al capítulo 6 para las recomendaciones de crear distancia y evitar exposiciones forzadas. En v45 se añadió una referencia PDSA contextual al capítulo 7 sobre alejarse con calma, usar una barrera visual si es posible y no intentar separar perros que pelean sin considerar el riesgo de mordedura. En v48 se condensó el resumen inicial del capítulo 10 de diez a cuatro recordatorios, quitando seis ítems solapados; se conservaron las listas detalladas “Antes de salir”, “Durante el paseo”, “Al volver” y “Cuándo interrumpir y consultar”. En v49 se cambiaron a saltos de línea los cuatro bloques de lista del capítulo 6 que guardaban sus elementos unidos por `|`; ahora el HTML los presenta como 25 elementos separados (6 + 6 + 7 + 6). El exportador HTML convierte las URLs `http/https` de bloques `sourceReference` en enlaces seguros; URLs con credenciales incrustadas permanecen como texto. Pruebas del exportador 9/9 y typecheck del servidor pasaron. Autosaves canónicos; permanecen 1 capítulo aprobado y 9 borradores. No hubo llamada de modelo en v48 ni v49.
- En capítulos 2, 4 y 5 se añadieron referencias institucionales `KNOWLEDGE` a [AVSAB](https://avsab.org/resources/position-statements/) (dominancia/métodos respetuosos) y [Dogs Trust](https://www.dogstrust.org.uk/dog-advice/training/unwanted-behaviours/reactive-dog) (reactividad y conductas observables); en el capítulo 5 también a [AAHA](https://www.aaha.org/resources/2015-aaha-canine-and-feline-behavior-management-guidelines/assembling-a-team/) para derivaciones. En el capítulo 6 se verificaron tres referencias de evidencia contra los comentarios reales y se normalizaron dos `evidenceIds` unitarios a arreglos. El contrato compartido ahora preserva arreglos unitarios y acepta el formato escalar histórico; regresión API cubierta. El capítulo 7 incluye en v45 la referencia [PDSA: dog attacks](https://www.pdsa.org.uk/pet-help-and-advice/looking-after-your-pet/puppies-dogs/dog-attacks), contextualizada para retirada calmada y barrera visual.
- HTML local de v49 creado y descargado/verificado en memoria después del cambio del exportador: `perros-reactivos-en-el-paseo-guia-practica-v49-20260930224816656-1e9ea2.html`, 68.003 bytes, SHA-256 `630c3adeb1519dc00b23248feefb0b11ccc79ff3eedf3fee49bee1177864f1e5`; checksum coincide con el registro del export y aparecen enlaces PDSA y Dogs Trust con `rel="noopener noreferrer"`. Enlace local: `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f481-1a14-73ae-bc51-73d304db19e3/download`. No es publicación web.
- El exportador DOCX quedó corregido para enlazar referencias HTTP(S) de forma segura y representar tablas almacenadas como texto delimitado por `|` (incluida la forma normalizada `{rows: string}`); URLs con credenciales no se convierten en enlaces. La prueba del exportador cubre HTML/DOCX, celdas y sanitización. La exportación real v49 pasó: `perros-reactivos-en-el-paseo-guia-practica-v49-20260930230015441-24cd8c.docx`, 30.318 bytes, SHA-256 `337f1137cebaae689e3abbcb2b6389c0d34fbad5db1aae80ee61f60cc04f99ba`; tablas y enlaces externos presentes, sin destino con credenciales. Enlace local: `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f48c-123a-774b-9081-479656422dd9/download`.
- En v50 se corrigió en el capítulo 5 la errata «¿Ladrado?» → «¿Ladró?» y se agregó una referencia contextual PDSA sobre alejarse con calma, usar una barrera visual cuando sea seguro y no intentar separar una pelea manualmente. El texto práctico del capítulo también recibió una única revisión no persistente de Gemini `gemini-3.5-flash-lite`, autorizada explícitamente: 1.997 tokens de entrada y 80 de salida; veredicto `sin_hallazgos_materiales`. La respuesta no se guardó ni sustituyó revisión veterinaria profesional. La guía actual de PDSA respalda esas precauciones. El capítulo continúa `DRAFT`; no se aprobó.
- Exportaciones reales v50 verificadas por checksum y contenido: HTML `perros-reactivos-en-el-paseo-guia-practica-v50-20261001020642306-c385d2.html`, 69.278 bytes, SHA-256 `9eaa9aedc9f5ffa8d3b3b240769acfc8cfbde3d1a877666077618dd56c39ce64`; DOCX `perros-reactivos-en-el-paseo-guia-practica-v50-20261001020642322-0959eb.docx`, 30.414 bytes, SHA-256 `c0d2fb8e4766ce63ccdbb85aab310766c8bce0b667a27b4bdabcb7576870e0c5`. Ambos contienen la corrección; el enlace PDSA es clicable también en DOCX. URLs locales: HTML `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f536-c484-76ac-9234-d62d6922adc6/download`; DOCX `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f536-c4b7-7043-a504-af250ee0b416/download`.
- En v51 se amplió el checklist del capítulo 8 para que el lector pregunte por formación, experiencia, métodos, herramientas y derivaciones del profesional, y verifique las cualificaciones localmente. Se enlazó la guía de AVSAB sobre selección de consultores; evita asumir que un título/credencial de EE. UU. aplique universalmente. Fue un cambio manual pequeño sin llamada de modelo. La validación continúa sin errores ni advertencias y el capítulo permanece `DRAFT`.
- Exportaciones reales v51 verificadas por checksum y contenido: HTML `perros-reactivos-en-el-paseo-guia-practica-v51-20261001021635684-3e8e26.html`, 69.932 bytes, SHA-256 `29331acf2c06deeea4f5eaa4a7a61fd2f1881bbc75ca72cba7d84d0c1b06238e`; DOCX `perros-reactivos-en-el-paseo-guia-practica-v51-20261001021635696-6ab197.docx`, 30.676 bytes, SHA-256 `f1b6901adc36c71d290c58f7806b666030a381e26c03eca51c5ee612eadb2d35`. Ambos incluyen la orientación y el enlace AVSAB; checksum y contenido descargado coinciden. URLs locales: HTML `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f53f-d266-7691-a93e-1c1a80bdc322/download`; DOCX `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f53f-d298-744d-a404-bde7b70d1120/download`.
- En v52 se añadió a las referencias del capítulo 4 Dogs Trust, fuente de orientación sobre comportamiento canino, contextual sobre señales corporales tempranas y manejo con distancia, cambios de ruta y barreras visuales. Se revisó el capítulo completo y su guía no requirió más cambios. Fue un cambio manual, sin llamadas a modelos; la validación del ebook sigue sin errores ni advertencias.
- Revisión de trazabilidad v52, sin cambios de contenido ni llamada de modelo: los cuatro `evidenceIds` del bloque 140 del capítulo 6 se resolvieron por la API a comentarios reales de la fuente enlazada y respaldan la síntesis acotada sobre incomodidad/sobresalto y atribución de responsabilidad. El texto los trata expresamente como percepciones individuales y no infiere frecuencia, causalidad ni culpa.
- Exportaciones reales v52 verificadas por checksum y contenido: HTML `perros-reactivos-en-el-paseo-guia-practica-v52-20261001022554772-7a13fb.html`, 70.368 bytes, SHA-256 `e4c4fad4bb96a086c32757048042bed66c66fe3ed39c3aa5966ac2259a446fd7`; DOCX `perros-reactivos-en-el-paseo-guia-practica-v52-20261001022554788-c9fd5a.docx`, 30.708 bytes, SHA-256 `5b8802624725768cc3aa3d2db30f5b1430158156a23edbf5ff0bc07edaaf1acb`. Los checksums coinciden y ambos exportan un enlace seguro a Dogs Trust. URLs locales: HTML `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f548-5a59-742d-9576-6a041d039bb3/download`; DOCX `http://127.0.0.1:4310/api/projects/01a0289f-9377-70b0-b9ac-a0eb5a9dd35a/files/01a0f548-5a90-7652-9a90-346b04543016/download`.
- Conteo aproximado desde el contenido activo de v49 (objetivos del outline suman 9.400 palabras): capítulos 1–10 = 807, 808, 761, 1.226, 1.078, 930, 693, 814, 403 y 340; total ≈7.860. El workbook (cap. 9) es deliberadamente práctico y tiene 24 bloques; no regenerarlo solo por perseguir el objetivo numérico. Revisar si necesita más contenido útil, no relleno. El capítulo 1 figura aprobado; el ebook como conjunto continúa `IN_PROGRESS` y sin aprobación profesional independiente.
- Validación ejecutada para v52: `errors=[]`, `warnings=[]`, `claimWarnings=[]`, `canExport=true`; no quedan bloques de lista con separadores `|`. Los checksums HTML/DOCX coinciden con los registros y el contenido descargado verifica los enlaces seguros. La apertura visual del export en el navegador in-app sigue sin comprobarse: la prueba anterior falló con `ERR_BLOCKED_BY_CLIENT` y no se intentó eludir el bloqueo.
- Para continuar: usar el proyecto existente y la API canónica; preservar el historial y el estado actual de sus diez capítulos (uno `APPROVED`, nueve `DRAFT`). Gemini está configurado y es el proveedor preferido; la siguiente generación real debe seleccionarlo explícitamente (no mock, DeepSeek ni fallback), y hacerse solo para una necesidad puntual tras estimar coste. Límite: una generación, sin reintentos ni lote; revisar consumo y salida antes de continuar. No gastar una llamada solo para probar el proveedor, pues ahora no hay capítulo pendiente sin borrador. No desplegar, no publicar ni ampliar aprobaciones sin autorización explícita.
