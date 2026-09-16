# Landing: evaluación del editor visual

Evaluación consultada el 16/09/2026. Se conserva el editor anterior. Landing sigue IN PROGRESS; este documento no declara SECTION PASS.

## Decisión

Elegir **Puck core 0.23.0 como motor de interacción**, con catálogo, datos, renderers, temas y versionado propios de Hallazia. No usar Puck Cloud/AI, Figma ni servicios remotos para editar. Cargar el editor bajo demanda. El HTML es una exportación, nunca el documento editable.

La elección responde a React 19, componentes React reales y un shell visual ya utilizable. No significa que Puck sea Webflow completo: un inspector CSS arbitrario, assets, símbolos vinculados y edición responsive por propiedad requieren trabajo propio. La primera integración debe cubrir los 15 bloques, selección en canvas, drag/drop, árbol, activación, temas, preview, guardado explícito y exportación independiente. El editor actual queda accesible como alternativa durante la transición.

## Comparación técnica

| Aspecto | Puck core | GrapesJS core | Craft.js | Onlook OSS | Webstudio core | Hallazia propio |
|---|---|---|---|---|---|---|
| Licencia | MIT; integrable conservando avisos | BSD-3-Clause; integrable conservando avisos; Studio SDK es otro producto | MIT | Apache-2.0; conservar avisos/licencia | AGPL-3.0-or-later; referencia por ahora | Código del repositorio; sin nueva licencia de editor |
| React/TS/Vite | React 18/19 peer; TS; probado sobre la instancia Vite actual | JS/TS; wrapper React oficial 2.0 admite React19; modelos no React | React19 peer, TS; framework React | Aplicación Next/Tailwind; soporte no-Next pendiente según README | Aplicación/monorepo completo, no componente Vite intercambiable | Ya compatible |
| Drag/drop | Incluido; inserción y reordenación comprobadas | Incluido, bloques/DOM | Motor incluido; diseñar UX | Reordenación DOM; panel de componentes figura pendiente | Canvas visual avanzado | No disponible en el editor actual |
| Componentes propios | Funciones React y campos tipados | Model/View/traits propios; React requiere puente | Componentes React + connectors | Componentes del código indexado | Componentes SDK e instancias | Control total, construir interacción |
| JSON | content/root/props; adaptar, no persistir como contrato de dominio | ProjectData con páginas/estilos/assets; no guardar solo HTML | Grafo serializable de nodos | Código/AST como fuente principal, no nuestro JSON | Instancias, estilos y datos de proyecto | Documento sections existente |
| Desktop/móvil | Iframe con viewports; bloques deben implementar responsive | Devices y reglas CSS/media queries | Diseñar controles y CSS responsive | Edición de la app en canvas; adaptar a nuestro stack | Breakpoints y controles visuales | Preview responsive existente, inspector limitado |
| Capas/árbol | Outline incluido; comprobado | Layer Manager | Paquete layers aparte | Layers incluido | Navigator | Lista plana de secciones |
| Estilos/themes/tokens | Root/props/fields propios; no inspector CSS completo de serie | Style Manager potente; restringir tokens y estilos | Todo a implementar | Tailwind y brand tokens | Tokens/CSS visual: buena referencia | Tres colores/tipografía/ancho/espaciado |
| Bloques reutilizables | Catálogo React, defaults/presets; símbolos sincronizados serían nuestros | Block Manager; Symbols documentados | Resolver/catálogo propio | Componentes del repositorio | Componentes/plantillas | Catálogo propio a ampliar |
| Edición profesional | Canvas, selección, panel, árbol, undo/redo; adaptar UX y lenguaje | Mayor libertad CSS de serie; adaptar shell y restricciones | Máxima libertad, mucho trabajo de producto | Cercano a diseño sobre código, infraestructura grande | Referencia más cercana a Webflow | Coste elevado para selección/drag/undo/canvas robustos |
| Backend/versiones | onChange en memoria → adaptador → drafts Hallazia; aprobación separada | Storage custom → API; desactivar autosave propio | serialize → adaptador → API | Doble sistema código/checkpoints y artefactos | Puente a su modelo/backend, elevado coste | Integración directa ya existente |
| HTML/React export | Render React; HTML mediante renderer Hallazia/SSR. No exportador de código completo automático | HTML/CSS nativo; React no es salida canónica | React desde resolver; HTML/export a implementar | Modifica React del proyecto; no exportación desde JSON Hallazia | Export/hosting del sistema; verificar paquete/licencia individual | HTML actual; export React a implementar |
| Personalización | Alta por config/composición; algunas overrides son experimentales | Alta por plugins/modelos; gran superficie | Muy alta; editor casi desde cero | Fork/adaptación de aplicación | Fork/integración de plataforma | Total, mantenimiento total |
| Lock-in técnico | Bajo con adaptador y renderer propios; medio si guardamos Data Puck sin frontera | Medio/alto si estilos/árbol quedan atados a ProjectData | Medio si serialización Craft queda canónica | Dependencia de instrumentación/AST/stack | Dependencia del modelo y stack, más obligaciones de licencia | Ningún proveedor; dependencia de nuestro mantenimiento |
| Dificultad real | Media; mejor equilibrio para este repositorio | Media/alta; adecuado si priorizáramos HTML/CSS libre | Alta; alternativa si Puck limita composición | Muy alta; desajuste con fuente JSON y Vite | Muy alta y decisión de licencia no resuelta | Muy alta para alcanzar experiencia profesional |

## Mantenimiento y dependencias observados

Metadatos consultados en npm y repositorios oficiales; actividad no equivale a garantía de soporte.

| Candidato | Evidencia actual | Tamaño publicado (descomprimido, NO bundle de navegador) |
|---|---|---|
| Puck | 0.23.0; npm modificado 15/09/2026. Dnd-kit, Zustand, Tiptap, Radix; 109 paquetes instalados en prototipo. npm advierte deep-diff 1.0.2 deprecado | 2.65 MB core |
| GrapesJS | 0.23.6; npm modificado 25/08/2026. Backbone, Underscore, CodeMirror5 y utilidades | 12.45 MB core |
| Craft.js | 0.2.12; npm y último push observado 14/02/2025. Lodash, debounce, utils; cadencia significativamente menor | 0.48 MB core + 0.21 MB layers, excluye transitivas/UI |
| Onlook | Push 25/08/2026; README distingue OSS inicial de nuevo producto hosted early-access. Next, tRPC, Supabase, Drizzle, sandboxes y Bun | No comparable con una librería: aplicación completa; no instalado |
| Webstudio | Push 15/09/2026; monorepo activo | No comparable: plataforma completa; no instalado |
| Propio | Mantenimiento por Hallazia | Sin nueva dependencia; todo el coste de ingeniería recae aquí |

Prototipo Puck compilado aislado con esbuild/minify (incluye React+ReactDOM): **1,190,621 bytes JS / 361,180 gzip; 90,665 CSS / 13,660 gzip**. No es incremento medido del bundle final Hallazia. Usar lazy loading y medir el build integrado. CSS `no-external.css` evita la hoja con fuentes externas.

## Webstudio: alcance de licencia

La AGPL permite uso comercial, pero no es licencia permisiva. Distribuir una obra cubierta/modificada y ofrecer una versión modificada por red implica obligaciones de código fuente bajo sus condiciones; no se asume que insertar su código en Hallazia deje el resto fuera de esas obligaciones. No conocemos una decisión de distribución/licenciamiento de Hallazia que autorice esa integración. El paquete opcional sdk-components-animation es propietario y exige EULA aparte. **No se incorpora código de Webstudio**; tomar ideas de navegación, breakpoints y tokens no requiere insertar ese código. La compatibilidad de una futura integración dependería de cómo se combine/distribuya, no de que el repositorio sea público.

## Prototipo aislado y resultados

Ruta `apps/web/prototypes/landing-puck`, dependencias propias; ninguna llamada a backend, ningún dato real. Página `/prototypes/landing-puck/index.html` servida por 5173 sin reiniciar Hallazia. Datos sintéticos en clave localStorage exclusiva `hallazia-puck-isolated-evaluation`.

Comprobado con navegador real:
- Render React19/Vite, catálogo de 15 tipos, canvas y panel de campos.
- Editar título FAQ; desactivarla conserva JSON y placeholder en editor, la oculta en Render fuera del editor.
- Guardar y recargar conserva texto y activación.
- Arrastrar un bloque del catálogo al canvas; reordenarlo desde Outline, orden visible actualizado.
- Cambiar a viewport móvil de 360px y tema nocturno; guardar/recargar conserva tema y orden.
- Primer montaje con dependencias anidadas duplicó React: se corrigió aislando el bundle del prototipo. En integración usar una sola instalación workspace de React.
- Se registró un error MutationObserver durante la sesión de automatización; comprobar nueva sesión limpia antes de considerar la integración cerrada.

El prototipo prueba interacción, NO aprobación/backend, exportación final ni paridad de todos los bloques. Esos checks pertenecen a la integración Landing pendiente.

## Arquitectura y fronteras

Strategy → LandingDocument Hallazia → adaptador Puck → editor visual.

LandingDocument → catálogo React + tokens → responsive preview / React export / HTML export.

- Conservar `title`, `sections`, `footerNote`, metadatos y evidencia actuales. Añadir IDs estables de bloque, `enabled`, variantes/tokens de forma compatible. No migrar ni regenerar datos reales al abrir.
- Adaptador bidireccional explícito: IDs/tipo/orden/contenido/refs/activación; JSON de Puck no se convierte en fuente de verdad.
- Catálogo mínimo: Hero, Problem, Agitation, Mechanism/Solution, Benefits, Product, Deliverables, Bonuses, Proof, Objections, FAQ, Offer, Guarantee, CTA, Footer. Proof no crea testimonios ni métricas ficticias.
- Renderer y contrato sobreviven a la retirada de Puck. Export React incluye los componentes propios y datos, no el editor. HTML estático es un formato de entrega válido, no la arquitectura de edición.
- Cambios locales no guardan automáticamente en proyectos. Guardar crea borrador mediante API existente con sourceVersionId/base; aprobar mantiene las reglas de concurrencia y evidencia. Versionar la página conserva todos los bloques de ese snapshot; no crear una segunda base de versiones.
- Mantener editor anterior durante transición. No conectar Figma ni servicios cloud como dependencia.

## Fuentes primarias

- [Puck introducción/licencia](https://puckeditor.com/docs), [Data](https://puckeditor.com/docs/api-reference/data), [componentes](https://puckeditor.com/docs/api-reference/configuration/component-config), [viewports](https://puckeditor.com/docs/integrating-puck/viewports), [overrides](https://puckeditor.com/docs/api-reference/overrides).
- [GrapesJS storage/JSON](https://grapesjs.com/docs/modules/Storage.html), [componentes](https://grapesjs.com/docs/modules/Components.html), [repositorio/licencia](https://github.com/GrapesJS/grapesjs), [React wrapper](https://github.com/GrapesJS/react).
- [Craft.js README y límites](https://github.com/prevwong/craft.js/tree/master/packages/core), [layers](https://github.com/prevwong/craft.js/tree/master/packages/layers).
- [Onlook arquitectura, soporte y licencia](https://github.com/onlook-dev/onlook).
- [Webstudio alcance de licencia](https://github.com/webstudio-is/webstudio), [texto AGPL](https://github.com/webstudio-is/webstudio/blob/main/LICENSE).
- Metadatos npm: `npm view @puckeditor/core`, `grapesjs`, `@grapesjs/react`, `@craftjs/core`, `@craftjs/layers`.
