# Problemas conocidos

## CRITICAL

Ninguno conocido.

## HIGH

Ninguno conocido.

## MEDIUM

- El adaptador OpenAI Responses API está implementado y valida JSON estructurado, pero todavía no está conectado al botón de generación de módulos. Las ejecuciones de la UI usan Mock/contextual de forma deliberada y rechazan `provider=openai` con un mensaje claro.
- Los resultados de módulos se pueden versionar y seleccionar, pero el MVP no incorpora todavía editores especializados para modificar cada campo antes de generar una nueva versión.
- La vista Landing presenta el copy estructurado y permite descargar HTML seguro; todavía no ofrece un iframe de preview ni comparación visual lado a lado.
- Funnel se representa como datos estructurados, no como canvas editable de nodos.
- Emails y Content se muestran estructurados y versionados, pero no tienen export individual especializado.

## LOW

- Los jobs YouTube recuperados tras reinicio no tienen un límite global de concurrencia.
- YouTube guarda checkpoint al terminar cada página; una interrupción dentro de la petición activa repite únicamente esa página.
- La cancelación YouTube es cooperativa entre peticiones; una petición HTTP activa puede continuar hasta su timeout.
- La API real de OpenAI y YouTube no fue verificada en vivo porque no se proporcionaron claves.
- Git fue inicializado durante el build y aún no existe historial previo que preservar.
