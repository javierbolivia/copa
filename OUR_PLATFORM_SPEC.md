# Especificación de la plataforma personal de investigación y creación de productos

**Estado:** diseño aprobado para planificación; todavía no implementado  
**Fecha:** 12 de agosto de 2026  
**Naturaleza:** producto original, local y de un solo usuario

## 1. Propósito

La plataforma convierte evidencia de mercado en un producto digital y sus activos de venta mediante un flujo guiado, persistente y trazable. Su diferencia central no es ofrecer una colección aislada de chats, sino mantener un proyecto estructurado en el que cada módulo recibe por ID los resultados aprobados de los módulos anteriores.

El recorrido objetivo es:

`Investigación → comentarios → problemas → oportunidades → producto → avatar → mecanismo → creencias/tesis → oferta → landing → funnel → emails → contenido → archivos finales`

La plataforma toma como referencia únicamente aprendizajes funcionales y arquitectónicos de los informes de COPA. No reutiliza código, diseño visual, marcas, nombres internos, contenido propietario ni prompts privados de COPA. Todos los métodos, prompts, esquemas y textos de esta plataforma serán originales.

## 2. Usuario y contexto de uso

- Un único propietario usa la aplicación en su computadora Windows.
- La interfaz se abre en el navegador y el servidor escucha sólo en `127.0.0.1`.
- No hay registro, login, contraseña, roles, planes, membresías, pagos ni panel administrativo.
- Los proyectos, evidencia, resultados, historial y archivos viven localmente.
- Las únicas comunicaciones externas previstas son las que el propietario configure: proveedor LLM y YouTube Data API.
- El usuario conserva control editorial: una salida generada no se convierte automáticamente en verdad ni avanza sin validación explícita.

## 3. Objetivos del producto

1. Eliminar el copiar/pegar entre agentes.
2. Conservar una cadena comprobable desde una afirmación de marketing hasta su evidencia original.
3. Separar observaciones, métricas calculadas, inferencias de IA y decisiones humanas.
4. Hacer auditable el puntaje de oportunidades.
5. Generar resultados estructurados, editables y versionados, no sólo texto de chat.
6. Permitir cambiar de proveedor o modelo LLM sin rediseñar el dominio.
7. Mostrar consumo aproximado y real de tokens/coste por proyecto y generación.
8. Mantener el sistema simple de instalar, respaldar y modificar en Windows.

## 4. No objetivos

- No replicar COPA ni asegurar compatibilidad con sus APIs o datos.
- No crear una plataforma SaaS o multiusuario.
- No alojar contenido públicamente ni procesar pagos.
- No automatizar la publicación en redes sociales durante el MVP.
- No fabricar testimonios, cifras, fuentes, citas o prueba social.
- No sustituir la revisión humana en decisiones comerciales.
- No implementar en la primera versión todos los formatos del generador de producto.
- No construir microservicios, colas distribuidas, Kubernetes, Redis ni infraestructura empresarial.

## 5. Principios funcionales

### 5.1 Evidencia antes que inferencia

Cada dato relevante tendrá una clase de procedencia:

- `observed`: proviene literalmente de una fuente o comentario;
- `calculated`: se obtiene mediante una fórmula determinista;
- `ai_inference`: interpretación propuesta por un LLM;
- `user_assertion`: dato o decisión introducida por el propietario.

Las inferencias deben enlazar a evidencia cuando exista. La interfaz nunca presentará una inferencia como cita textual.

### 5.2 Salidas estructuradas

Cada agente entrega un objeto validable con un esquema versionado. El texto libre puede formar parte del objeto, pero no reemplaza campos, IDs, estado, evidencia ni versión.

### 5.3 Aprobación y versionado

Los estados mínimos de un artefacto son `draft`, `approved`, `superseded` y `archived`. Sólo las versiones aprobadas alimentan por defecto a módulos posteriores. Editar o sustituir un resultado anterior marca como `stale` los resultados dependientes; nunca los borra silenciosamente.

### 5.4 Trazabilidad

La cadena mínima que debe poder navegarse en ambos sentidos es:

`comentario/fuente → evidencia → problema → oportunidad → producto → oferta → afirmación de landing/contenido`

### 5.5 Automatización controlada

El sistema prepara contexto, ejecuta validaciones y propone resultados. El usuario decide qué evidencia aceptar, qué oportunidad seleccionar y qué versión promover.

## 6. Módulos funcionales

| # | Módulo | Responsabilidad | Resultado principal |
|---:|---|---|---|
| 1 | Proyectos | Crear, abrir, respaldar y seguir el estado de un proyecto | Proyecto y configuración |
| 2 | Investigación | Organizar nicho, subnichos, preguntas, búsquedas y fuentes | Plan y hallazgos de investigación |
| 3 | Extractor de YouTube | Importar comentarios mediante la API oficial con paginación | Videos, hilos y comentarios deduplicados |
| 4 | Analizador de problemas | Agrupar evidencia en problemas, deseos, preguntas y objeciones | Problemas sustentados por evidencia |
| 5 | Evaluador de oportunidades | Calcular y explicar puntajes comparables | Ranking auditable 0–100 |
| 6 | Constructor de producto | Convertir una oportunidad elegida en un producto viable | Concepto, promesa, módulos y recursos |
| 7 | Constructor de avatar | Sintetizar el comprador probable desde evidencia real | Perfil y atributos trazables |
| 8 | Constructor de mecanismo | Explicar causa, enfoque y diferenciación | Mecanismo de problema y solución |
| 9 | Creencias y tesis central | Mapear creencias, objeciones y tesis de marketing | Beliefs y Big Domino original |
| 10 | Constructor de oferta | Empaquetar producto, bonos, precio y ascensiones | Oferta principal y extensiones |
| 11 | Constructor de landing | Crear copy editable y una previsualización local | Documento de copy + HTML/CSS local |
| 12 | Constructor de funnel | Diseñar la secuencia comercial sin pagos reales | Grafo Landing–Thank You |
| 13 | Agente de email | Crear secuencias coherentes con oferta y avatar | Emails versionados por secuencia |
| 14 | Motor de contenido | Derivar posts, hooks, calendario e ideas | Piezas y calendario editorial |
| 15 | Generador de producto | Exportar activos del producto en formatos seleccionados | Archivos generados; alcance gradual |
| 16 | Uso e historial | Auditar generaciones, modelos, tokens, costes y errores | Registro filtrable por proyecto |

## 7. Requisitos por módulo

### 7.1 Proyectos

Un proyecto conserva como mínimo nombre, nicho, contexto, configuración, fuentes, comentarios, problemas, puntajes, oportunidad elegida, producto, avatar, mecanismo, creencias, tesis, oferta, landing, funnel, emails, contenido, archivos e historial de generaciones.

Debe permitir:

- crear, renombrar, archivar y duplicar un proyecto;
- ver progreso y dependencias por módulo;
- exportar un respaldo completo y restaurarlo;
- mantener múltiples versiones de cada resultado;
- establecer idioma, moneda y perfil LLM por defecto;
- fijar un presupuesto informativo por proyecto.

### 7.2 Investigación

Entradas: nicho, palabras clave, región, idioma, contexto, hipótesis iniciales y restricciones.

Salidas:

- subnichos posibles;
- problemas por investigar;
- consultas de búsqueda sugeridas;
- fuentes registradas;
- preguntas abiertas;
- hallazgos separados entre evidencia e inferencia.

La investigación manual y la asistida por IA deben coexistir. El sistema no presentará una URL sugerida por IA como fuente visitada.

### 7.3 Extractor de YouTube

Usará preferentemente YouTube Data API v3 y nunca scraping como ruta silenciosa. Si no hay clave configurada, el módulo explica cómo configurarla y permite importar un archivo propio compatible.

Datos por comentario:

- ID de plataforma;
- autor visible;
- texto original y texto normalizado sólo para búsqueda;
- likes;
- fecha;
- ID y URL del video;
- ID del hilo;
- ID del padre si es reply;
- tipo top-level/reply;
- fuente y fecha de importación.

Comportamiento:

- paginación hasta completar, alcanzar cuota o un límite definido por el usuario;
- reanudación por cursor sin repetir páginas confirmadas;
- deduplicación por ID de plataforma y hash como respaldo;
- preservación de replies y relación con el padre;
- elección explícita de orden disponible por la API;
- almacenamiento del resultado antes de cualquier análisis LLM;
- registro de cuota y errores;
- ninguna llamada LLM durante extracción.

### 7.4 Analizador de problemas

Agrupa y etiqueta:

- problemas;
- frustraciones;
- deseos y resultados buscados;
- preguntas;
- soluciones intentadas;
- objeciones;
- lenguaje recurrente;
- citas representativas.

Cada problema conserva enlaces a comentarios o fragmentos de fuente. La frecuencia se calcula sobre evidencia deduplicada; no se usa el número de repeticiones generadas por el LLM.

### 7.5 Evaluador de oportunidades

El total es 0–100 y debe recalcularse de forma determinista a partir de componentes 0–100 y pesos configurables que suman 100%.

Componentes iniciales:

| Componente | Fuente preferida | Peso inicial |
|---|---|---:|
| Frecuencia | Métrica calculada en comentarios/fuentes | 20% |
| Urgencia | Evidencia + evaluación asistida | 15% |
| Intensidad emocional | Evidencia lingüística + evaluación asistida | 15% |
| Disposición a pagar | Señales observadas + inferencia explícita | 15% |
| Facilidad de solución | Evaluación del alcance del producto | 15% |
| Competencia estimada | Investigación registrada; no dato inventado | 10% |
| Diferenciación posible | Comparación producto/mecanismo preliminar | 10% |

Cada componente guarda valor, explicación, procedencia, evidencia, confianza y versión de fórmula. Si no hay evidencia suficiente, el sistema reduce la confianza o marca el componente `unknown`; no lo completa con una cifra fingida.

### 7.6 Constructor de producto

Produce un activo práctico y acotado desde una oportunidad seleccionada:

- concepto;
- promesa condicionada y responsable;
- formato;
- resultado y alcance;
- estructura y módulos;
- checklist;
- plantillas;
- recursos;
- bonos razonables;
- herramientas necesarias;
- supuestos y riesgos.

La metodología será propia. Prioriza claridad, acción, tiempo de valor corto y viabilidad de producción.

### 7.7 Constructor de avatar

El avatar se basa primero en la evidencia almacenada. Incluye situación, objetivo, dolores, frustraciones, deseos, objeciones, lenguaje, comportamiento, motivaciones y contexto de compra.

Cada atributo se marca como observado, calculado, inferido o aportado por el usuario y puede enlazar evidencia. Las lagunas permanecen visibles.

### 7.8 Constructor de mecanismo

Entrega:

- problema percibido;
- causa profunda propuesta;
- mecanismo de solución;
- diferenciación;
- explicación simple;
- alternativas conocidas;
- límites de la hipótesis;
- evidencia a favor y en contra.

Una causa profunda generada por IA es hipótesis, no hecho, salvo que tenga fuente verificable.

### 7.9 Creencias y tesis central

Mapea creencias limitantes, creencias necesarias, objeciones y la tesis central que conecta problema, mecanismo y oferta. Es un método original, aunque pueda usar el término descriptivo “Big Domino”.

### 7.10 Constructor de oferta

Incluye producto principal, beneficios, entregables, bonos, garantía, precio, razonamiento del precio, order bump, upsell y downsell. Los precios y garantías son decisiones editables del usuario, no hechos recomendados sin contexto.

### 7.11 Constructor de landing

Genera dos artefactos sincronizados:

1. copy editable y estructurado;
2. previsualización HTML/CSS local funcional.

Secciones: headline, subheadline, problema, mecanismo, beneficios, oferta, prueba sólo cuando exista, objeciones, FAQ y CTA. El sistema impide marcar como publicada una prueba social sin fuente registrada.

### 7.12 Constructor de funnel

Representa visualmente:

`Landing → Checkout simulado → Order Bump → Upsell → Downsell → Thank You`

El MVP modela páginas, condiciones y transiciones, pero no procesa pagos ni contacta compradores.

### 7.13 Agente de email

Secuencias: bienvenida, nutrición, carrito abandonado, venta, seguimiento, upsell y poscompra. Cada email guarda asunto, preheader, cuerpo, CTA, etapa, posición y fuentes de contexto.

### 7.14 Motor de contenido

Genera posts de Facebook y un modelo extensible para otros canales: hooks, autoridad, educación, inspiración, objeciones, historias, ideas semilla, variaciones y calendario. Usa automáticamente versiones aprobadas de avatar, mecanismo, oferta, tesis y evidencia.

### 7.15 Generador de producto

La arquitectura admite PDF, workbook, checklist, guía, ebook, plantillas, dashboard y miniaplicación HTML. El MVP implementará primero un formato sencillo y verificable; el resto queda como extensiones por adaptador.

## 8. Interfaz de usuario

### 8.1 Estructura

- Barra lateral: proyectos y módulos en orden de workflow.
- Área principal: editor específico del módulo, evidencia, versiones y acciones.
- Indicador de estado: `not_started`, `ready`, `in_progress`, `needs_review`, `approved`, `stale`, `blocked`.
- Panel lateral de trazabilidad: entradas exactas, versiones, evidencia y generaciones utilizadas.
- Barra de uso: tokens y coste del proyecto con filtros por modelo/módulo.

### 8.2 Reglas de experiencia

- El usuario puede entrar a cualquier módulo, pero recibe una explicación si faltan dependencias.
- “Generar” muestra antes el contexto que se enviará y una estimación de coste.
- “Aprobar” fija la versión consumible por downstream.
- “Regenerar” crea una versión, nunca sobrescribe la anterior.
- Los campos son editables después de una generación y los cambios manuales quedan identificados.
- Toda cita abre la fuente o comentario original.
- Los estados vacíos indican exactamente qué dato falta y qué módulo lo produce.

## 9. Requisitos del LLM

- Abstracción `LLMProvider` independiente del proveedor.
- Perfiles lógicos `economy`, `balanced` y `powerful`; el usuario asigna modelos reales.
- Prompts originales en archivos separados y versionados, nunca mezclados con componentes UI.
- Salida estructurada validada contra esquema.
- Reintento limitado sólo por error técnico o estructura inválida, con coste visible.
- Registro de proveedor, modelo, prompt version, estimación previa, uso reportado, latencia y coste.
- Claves sólo en backend y entorno local.
- Ninguna selección automática de proveedor más caro sin confirmación/configuración.

## 10. Requisitos de calidad y seguridad

- Base SQLite con claves foráneas, migraciones y transacciones.
- Bind exclusivamente local por defecto.
- Secretos en `.env`, excluidos del repositorio; `.env.example` sin valores.
- Copias de seguridad consistentes y restauración comprobada.
- Sanitización y sandbox de la previsualización HTML.
- Validación de URLs, tipos, tamaños de importación y rutas de archivo.
- Registro de errores sin secretos ni textos sensibles completos cuando no sean necesarios.
- Pruebas deterministas del scoring, deduplicación, paginación, staleness y trazabilidad.
- Accesibilidad básica de teclado, labels y contraste.

## 11. Alcance del MVP

El MVP termina en una landing y un paquete básico de campaña, con:

1. proyectos y configuración local;
2. importación oficial de comentarios de YouTube;
3. análisis de problemas con evidencia;
4. scoring auditable y selección de oportunidad;
5. producto, avatar, mecanismo, creencias/tesis y oferta;
6. landing editable con preview local;
7. funnel conceptual, emails y contenido inicial;
8. historial, versiones, coste y exportación de respaldo.

Quedan fuera del MVP: pagos reales, publicación automática, colaboración, app móvil, nube, RAG/vector database obligatorio y todos los formatos avanzados del generador de producto.

## 12. Criterios de aceptación del producto

- Es posible completar un proyecto sin copiar/pegar entre módulos.
- Cada problema aprobado apunta al menos a una evidencia o declara explícitamente que es hipótesis.
- El puntaje total puede reproducirse desde componentes y pesos almacenados.
- Cambiar una oportunidad aprobada marca producto y downstream como obsoletos.
- Una landing permite navegar de una afirmación a oferta/producto/problema/evidencia.
- Recargar o reiniciar conserva proyectos, versiones e historial.
- Un respaldo restaurado reproduce los IDs y relaciones.
- Ningún secreto aparece en el bundle frontend, logs exportados o control de versiones.
- El sistema puede cambiar el modelo asignado a un perfil sin cambiar lógica de dominio.

## 13. Mejoras concretas frente al patrón observado en COPA

| Limitación observada como referencia | Decisión original de esta plataforma |
|---|---|
| Herramientas aisladas y transferencia manual | Proyecto persistente y contextos resueltos por IDs |
| Chat genérico como salida principal | Artefactos estructurados, validados y versionados |
| Catálogo/prompts sin trazabilidad visible | Prompt version, input snapshot, modelo y lineage por generación |
| Extractor con límite y metadatos reducidos | Paginación configurable, replies, dedupe y fuente completa |
| Modelo y costes opacos | Proveedor/modelo/uso/coste visibles por ejecución |
| Clasificación o decisiones poco auditables | Fórmulas explícitas, evidencia, confianza y revisión humana |
| Riesgo de usar inferencias como hechos | Procedencia obligatoria y vínculo a evidencia |
| Sin pipeline de producto completo | Dependencias y estado de Research a Producto final |

## 14. Condición para iniciar implementación

No se escribirá código de producción hasta que el propietario apruebe esta especificación, la arquitectura, el modelo de datos, los contratos de agentes, el workflow y el plan de fases. Los cambios de alcance aprobados deben reflejarse primero en estos documentos.
