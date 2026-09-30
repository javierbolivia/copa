# Traspaso para Antigravity

Última actualización: 2026-09-29
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

### G. Mecanismo (Mechanism) - PUNTO ACTUAL
- **Estado en Workflow**: `PENDING` (listo / `READY` para generación).
- **Dependencias upstream**: Cumplidas al 100% (`product` v9 y `avatar` v3 aprobados y vigentes).
- **Siguiente acción para Codex**: Generar el módulo de Mecanismo (`mechanism`) mediante API, UI o script controlado, verificar coherencia de la causa raíz (`rootCauseHypothesis`) y solución operativa (`solutionMechanism`), y revisar/aprobar para avanzar a Creencias (`beliefs`).

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
