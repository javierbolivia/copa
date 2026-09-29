# Traspaso para Antigravity

Última actualización: 2026-09-29
Repositorio: `C:\Users\user23\Downloads\copa 2`
Rama: `codex/fix-20.7d-relevance-regression`

## Estado actual

- El working tree incluye la resolución verificada del problema de DeepSeek en Oportunidades.
- Todos los cambios respetan `validateJsonSchema`, sin relajar la validación, sin hardcodear resultados ni tocar `.env`.
- La suite enfocada (37 tests) y el `typecheck` del workspace completo pasan en verde.

## Qué se cambió

### DeepSeek / Oportunidades / Structured Output

Archivos modificados:
1. `apps/server/src/integrations/structured-output.ts`:
   - `parseStructuredJson`: se limpiaron los bloques `<think>[\s\S]*?<\/think>` antes de evaluar envolventes JSON, evitando que llaves `{}` emitidas durante el razonamiento interno desvíen `indexOf("{")` y corrompan el segmento JSON.
   - Se habilitó la extracción de bloques de código Markdown ````json ... ```` en cualquier parte del texto, sin requerir anclaje rígido de inicio a fin (`^...$`), permitiendo que bloques cercados rodeados de prosa sean recuperados limpiamente.
   - Se añadieron candidatos delimitados por llaves `{...}` y corchetes `[...]` tanto sobre el texto original como sobre el texto libre de etiquetas `<think>`.
2. `apps/server/src/integrations/deepseek-provider.ts`:
   - `jsonShapeExample`: ampliado para recorrer todas las `properties` declaradas en el esquema (incluyendo propiedades anidadas como `scoreRationales` con sus 9 criterios textuales, `rationale`, `missingData` y `validationPlan`), garantizando que el modelo reciba un ejemplo con la forma completa de Oportunidades sin inventar datos.
   - `responseApiText`: compatibilidad ampliada para extraer el texto tanto si el payload devuelto usa la estructura `output` como si utiliza el arreglo estándar `choices`.
3. Pruebas:
   - `apps/server/test/structured-output.test.ts`: casos para `<think>` con llaves internas, prosa con llaves y bloques cercados.
   - `apps/server/test/deepseek-provider.test.ts`: test de generación con razonamiento `<think>`.
   - `apps/server/test/opportunity-scoring.test.ts`: test de integración A3 de Oportunidades con razonamiento `<think>` y cálculo determinista de total.

## Verificación realizada

- `npm.cmd run typecheck` del workspace completo (`shared`, `server`, `web`): PASS.
- `npm.cmd run build --workspace @our-platform/server`: PASS.
- Suite enfocada (DeepSeek provider, contrato, Oportunidades y structured-output): 37 tests PASS.
- `git diff --check`: PASS.

## Diagnóstico del problema previo

La prueba real previa contra DeepSeek falló con `invalid_schema` (`actual non-JSON text`) porque el modelo emitió razonamiento `<think>` con llaves o prosa con bloques cercados que `parseStructuredJson` no podía aislar, resultando en `undefined`. Al fallar el parseo en la llamada Chat y en el reintento, se persistió `FAILED`.
Con la normalización de envolventes delimitadas y el ejemplo exhaustivo de propiedades en el prompt de sistema, el extractor aísla limpiamente el objeto JSON preservando estrictamente todas las reglas de validación de esquema del backend.

## Cómo continuar

1. Mantener las pruebas mock y el typecheck pasando antes de cualquier acción remota.
2. No ejecutar llamadas reales adicionales ni enviar corpus sin autorización explícita.
3. Para levantar la interfaz local:

   ```powershell
   npm.cmd run dev --workspace @our-platform/server
   npm.cmd run dev --workspace @our-platform/web
   ```

   Frontend: `http://127.0.0.1:5173/`
   Backend health: `http://127.0.0.1:4310/api/health`

4. Confirmar con el usuario la autorización antes de realizar `git push`.

## Límites y seguridad

- No abrir ni imprimir `.env`; nunca exponer claves.
- No incluir corpus, evidencia, snapshots ni bases SQLite en commits.
- No afirmar que DeepSeek generó una versión válida: la prueba real terminó fallida.
- Distinguir siempre entre pruebas mock/locales y estado remoto de DeepSeek.
