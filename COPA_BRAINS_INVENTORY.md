# Inventario técnico de Cerebros de COPA

**Corte de evidencia:** 12 de agosto de 2026  
**Alcance:** superficies públicas y uso anónimo normal de `app.pilasacademy.com` y `app.copa.pilasacademy.com`.  
**Conclusión de conteo:** 33 registros identificables en la API heredada; ningún inventario público actual de 47.

## Cómo leer el inventario

- **A — Prompt + LLM:** el cliente envía sólo `gptId`/UUID y mensaje a un router común; no se observó lógica especializada por Cerebro.
- **B — Prompt + procesamiento propio:** IA más transformación programática verificable.
- **C — Herramienta programática:** extracción, cálculo o parsing sin que el LLM sea necesario.
- **D — No determinado:** el nombre existe públicamente, pero faltan ID/configuración/tráfico para clasificarlo.
- La categoría `marketing` o `content` es la que devuelve la API heredada. Para nombres históricos o promocionales se indica `marketing (inferida)`.
- Algunos nombres de la API contienen espacios finales; se conservó la grafía visible y se omitieron únicamente esos espacios invisibles.

## Evidencias

- **E1:** [`GET https://app.pilasacademy.com/api/gpts`](https://app.pilasacademy.com/api/gpts), 28 registros con `id`, `name`, `prompt`, `order`, `isFree`, `category` y `createdAt`.
- **E2:** [`GET https://app.pilasacademy.com/api/content-gpts`](https://app.pilasacademy.com/api/content-gpts), 5 registros equivalentes.
- **E3:** [dashboard heredado indexado](https://app.pilasacademy.com/dashboard), instantánea pública del buscador con 30 nombres de Cerebros y el Extractor.
- **E4:** [portada de la nueva aplicación](https://app.copa.pilasacademy.com/), que publica “+30”, cuatro Cerebros nombrados y “+24 Cerebros más”.
- **E5:** bundle público nuevo `https://app.copa.pilasacademy.com/assets/index-xW5uFPHl.js`, rutas y operaciones tRPC.
- **E6:** tráfico anónimo normal: `POST /api/chat/<UUID gratuito>` y `POST /api/trpc/youtube.extractComments?batch=1`.

## 1. Catálogo verificable de 33 registros

| ID | Cerebro | Categoría | Input | Output | Endpoint | Tipo | Estado | Evidencia |
|---|---|---|---|---|---|---|---|---|
| `1b4dbcea-b6c6-4849-8bad-fcf950ea0af9` | VALIDA SI TU IDEA ES UN PAU | marketing | Idea o descripción de producto | Evaluación por cuatro criterios, veredicto y recomendaciones | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado; Free | E1, E6; `order=0` |
| `03f7d136-a476-4eb4-bae5-04543d56846f` | INVESTIGACIÓN REDDIT | marketing | Nicho o texto recopilado | Subreddits, estrategias de búsqueda y guía de validación | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado; Free | E1; `order=1` |
| `e115ad04-1406-4672-bc85-31917393565c` | 🔋 Super Cerebro 0 Analizador de Comentarios | marketing | Comentarios pegados de redes sociales | Idea PAU principal, seis upsells y documento para copiar | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=2` |
| `4e3a9419-6ea1-4097-9e80-34beb4fcd0cc` | GENERADOR DE IDEAS DE PAU | marketing | Comentarios/dolores y contexto del nicho | Ideas de PAU accionables e instrucciones de desarrollo | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=3` |
| `78a9e570-6af9-4c6a-9101-65b274bdf720` | VALIDACIÓN Y CREACIÓN | marketing | Comentarios de YouTube, Reddit o TikTok | Avatar profundo, demanda inferida e ideas de producto | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=4` |
| `0e45a251-4ff9-48a0-9d72-03ad7fc6f63a` | GENERADOR DE MECANISMO UNICO | marketing | Información del PAU | Diez mecanismos únicos de copy | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=5` |
| `18e0ebe8-f913-4037-a90b-630c810bfefb` | TITULARES CON MECANISMO | marketing | Mecanismo único y oferta | Variaciones de titular y subtítulo | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=6` |
| `9073439c-c24b-4428-a67b-efddc546bbbc` | PAU Marketing Expert | marketing | PAU, oferta o consulta de marketing | Estrategia de marketing/oferta | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=8` |
| `26919ced-0bb5-4965-b587-4f607b63e853` | Detector de Problemas Urgentes | marketing | Comentarios o enlaces pegados | Dolores urgentes, frustraciones y deseos | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=9` |
| `989e66ae-c72a-452b-8c10-83ee05414a6d` | AVATAR Y PRODUCTO | marketing | Investigación previa del nicho/producto | Insights, psicografía, avatar y consolidado | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=10` |
| `b6f43502-7923-4800-b96f-010d78fd89be` | Landing Page | marketing | Información de producto/avatar | Copy de página de ventas en 16 secciones | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=11` |
| `e99705ef-65bf-436c-b463-961f82520630` | Generador de Order Bumps Upsell | marketing | Producto y página de ventas | Ideas de order bumps y upsells | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=12` |
| `70d127df-9b2c-4252-9141-973cd44b2d76` | Redactor de Página de Upsell | marketing | Idea de upsell y página/URL pegada | Copy de página de upsell | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=15` |
| `4c563b24-8cb7-438f-9884-9f0c824a9729` | Pagina Dowsell Copy | marketing | Copy o URL de upsell pegada | Copy de página de downsell | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=16` |
| `3aab65a0-5fcb-4d1a-a7eb-35572a13608e` | ANUNCIOS que SI VENDE / LA BESTIA DEL COPY | marketing | Página de ventas/oferta | Anuncios progresivos en nueve estilos | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo; consolidación probable de anuncios antiguos | E1; `order=22` |
| `1ecdc015-324e-4759-b46d-8c5bf025b3e3` | TITULARES DE ALTO IMPACTO | marketing | Copy de Avatar y Producto | Titulares de respuesta directa | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=26` |
| `1d073b05-6e59-4aec-91c4-5e9ea863d926` | CREADOR DE GANCHOS | marketing | Copy/contexto de producto | Ganchos para tráfico frío | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=30` |
| `f11aebba-948b-45e7-afe2-bf3df2e9bd2b` | Aumenta el Valor de tu Oferta | marketing | Página/oferta existente | Branding simbólico y mejoras de valor percibido | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=33` |
| `295bdfa5-1a2d-4383-9e64-4eb443049e14` | Secuencia de Email | marketing | Datos de PAU y oferta | Secuencia de recuperación de carrito | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=35` |
| `7b1e613e-bd6a-4b9f-b91a-61b61936012d` | GENERADOR PAU HTML | marketing | Idea de mini app/PAU | Prompt detallado para que Manus genere HTML/CSS/JS | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo; no genera código por sí mismo | E1; `order=36` |
| `03069622-6e79-43fd-a852-d737f4f7aa49` | BIG DOMINO CREENCIAS | marketing | Comentarios de audiencia | Creencias limitantes extraídas | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=37` |
| `a3e43454-2d49-42c0-adf0-20efff3b63be` | BIG DOMINÓ BUILDER | marketing | Creencias, titular y mecanismo | Verdad central y Big Dominó | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=38` |
| `523bea6c-6694-4ad8-a404-d938af3698ef` | IDEAS SEMILLAS | marketing | Creencias/contexto | Ideas semilla clasificadas para contenido | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=39` |
| `6dd2b1b3-d7f3-46bc-a0b3-79a4f2bbbae1` | BD CONTENIDO UNIVERSAL | marketing | Nicho y producto | Contenido adaptado al nicho | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=40` |
| `173095eb-e186-4f1a-86f1-0468565b9826` | BD AUTORIDAD UNIVERSAL | marketing | Negocio, nicho y experiencia | Posts de autoridad conversacionales | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=41` |
| `21b1379a-5e1e-4398-a510-323a3e1ba978` | BD INSPIRACIONAL | marketing | Negocio/nicho y contexto | Posts inspiracionales contextualizados | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=42` |
| `aa5e9d18-536c-44ea-85e8-f0be05868cf7` | GENERADOR DE PAU DIGITALES | marketing | 200–300 comentarios | Instrucciones para producto, landing y herramientas en Manus | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo; declara que no genera HTML | E1; `order=43` |
| `9dc57c2d-ec58-4307-8893-7ec3d6074163` | Generador de PAUs Accionables desde Comentarios | marketing | Comentarios y elección de idea | Ideas coherentes y plan de 20 páginas para Gamma | UI `/dashboard`; `POST /api/chat/{id}` | A | Activo en REST heredado | E1; `order=44` |
| `60d70a9a-3448-4309-8639-8b7db8212117` | MOTOR DE VERDADES CORTAS | content | Creencias, Big Dominó y mecanismo | 60 verdades cortas | UI `/content-engine`; `POST /api/chat/{id}` | A | Activo en REST heredado | E2; `order=45` |
| `af980fa4-3dff-447f-8a75-86764566a518` | MOTOR DE VERDADES INCÓMODAS | content | Creencias, Big Dominó y mecanismo | 60 verdades incómodas | UI `/content-engine`; `POST /api/chat/{id}` | A | Activo en REST heredado | E2; `order=46` |
| `fbb81d0a-1ce3-4802-9b0e-a105c1e02066` | MOTOR DE CONTRASTES (A PIERDE / B GANA) | content | Creencias, Big Dominó y mecanismo | 60 contrastes A/B | UI `/content-engine`; `POST /api/chat/{id}` | A | Activo en REST heredado | E2; `order=47` |
| `f1f075df-2922-4b6c-b20e-dc3ff57db703` | MOTOR DE PRINCIPIOS ESTRUCTURALES | content | Principios y contexto estratégico | Variaciones narrativas breves | UI `/content-engine`; `POST /api/chat/{id}` | A | Activo en REST heredado | E2; `order=48` |
| `c36b5586-9e6f-429f-bbf7-fa8e1924ef6b` | GENERADOR UNIVERSAL DE GANCHOS (BIG DOMINÓ) | content | Nicho, mecanismo y recurso accionable | Hooks por ángulos | UI `/content-engine`; `POST /api/chat/{id}` | A | Activo en REST heredado | E2; `order=49` |

## 2. Nombres visibles en la nueva aplicación, no enumerables anónimamente

Estos cuatro nombres aparecen en la portada actual. La API `gpts.list` devuelve `[]` sin sesión y el bundle usa IDs numéricos, por lo que no se puede demostrar si son alias de registros anteriores o Cerebros nuevos adicionales.

| ID | Cerebro | Categoría | Input | Output | Endpoint | Tipo | Estado | Evidencia |
|---|---|---|---|---|---|---|---|---|
| No publicado | 🧠 Cerebro 1: Analizador de Comentarios | marketing (promocional) | Hasta 500 comentarios pegados | Avatar, dolores, frases y producto ideal | UI `/dashboard/:gptId`; `chat.send` | D | Actual y publicitado; ID/config no verificables anónimamente | E4, E5 |
| No publicado | 🏠 Cerebro 2A: Landing Page Builder | marketing (promocional) | Documento del Analizador/producto | Copy de landing en cuatro partes | UI `/dashboard/:gptId`; `chat.send` | D | Actual y publicitado; posible alias de `Landing Page` | E4, E5 |
| No publicado | 📊 Cerebro 2B: Dashboard Builder | marketing (promocional) | Documento de producto | Copy de dashboard, métricas y acciones | UI `/dashboard/:gptId`; `chat.send` | D | Actual y publicitado; no aparece en los 33 UUID | E4, E5 |
| No publicado | 🎯 Cerebro 2C: Funnel Builder | marketing (promocional) | Oferta/producto | Copy de captura, tripwire, upsell, downsell y emails | UI `/dashboard/:gptId`; `chat.send` | D | Actual y publicitado; no aparece con este nombre en los 33 UUID | E4, E5 |

## 3. Nombres históricos públicos

La instantánea indexada muestra estos nombres, pero no publicó sus UUID ni prompts. No se modificaron IDs ni se intentó llamar a registros eliminados. La mayoría parece haber usado el mismo chat genérico, pero se clasifica como `A probable` o `D` cuando no hay suficiente evidencia.

| ID | Cerebro | Categoría | Input | Output | Endpoint | Tipo | Estado | Evidencia |
|---|---|---|---|---|---|---|---|---|
| No publicado | PRODUCTOS DE ALTA UTILIDAD | marketing (inferida) | Idea de producto | Validación/guía PAU | Históricamente `/dashboard`; endpoint no conservado | A probable | Renombrado probablemente a `VALIDA SI TU IDEA ES UN PAU` | E3 frente a E1 |
| No publicado | TOMADOR DE DECISIONES | marketing (inferida) | Decisión/contexto | Recomendación estructurada | Históricamente `/dashboard`; endpoint no conservado | D | Eliminado o renombrado | E3; no está en E1/E2 |
| No publicado | Prompts para PAU en Canva | marketing (inferida) | Idea/estructura de PAU | Prompts para Canva | Históricamente `/dashboard`; endpoint no conservado | A probable | Eliminado | E3; no está en E1/E2 |
| No publicado | ESQUEMA DEL PRODUCTO PAU | marketing (inferida) | Idea y avatar | Esquema del producto | Históricamente `/dashboard`; endpoint no conservado | A probable | Eliminado o absorbido | E3; no está en E1/E2 |
| No publicado | ANUNCIOS Credibilidad y Contraste | marketing (inferida) | Oferta/página de ventas | Anuncios del estilo indicado | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente en `LA BESTIA DEL COPY` | E3 frente a E1 `order=22` |
| No publicado | ANUNCIOS con Diferenciadores | marketing (inferida) | Oferta/página de ventas | Anuncios con diferenciadores | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | Anuncios Nivel 3 — Urgencia | marketing (inferida) | Oferta/página de ventas | Anuncios de urgencia | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | ANUNCIOS Estructura Pilas | marketing (inferida) | Oferta/página de ventas | Anuncios con estructura Pilas | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | ANUNCIOS Narrativos | marketing (inferida) | Oferta/página de ventas | Anuncios narrativos | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | ANUNCIOS impacto emocional | marketing (inferida) | Oferta/página de ventas | Anuncios de impacto emocional | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | ANUNCIOS Emocionales | marketing (inferida) | Oferta/página de ventas | Anuncios emocionales | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | ANUNCIOS DE Dopamina | marketing (inferida) | Oferta/página de ventas | Anuncios de dopamina | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | ANUNCIOS DE Dopamina 2 | marketing (inferida) | Oferta/página de ventas | Segunda variante de anuncios de dopamina | Históricamente `/dashboard`; endpoint no conservado | A probable | Consolidado probablemente | E3 frente a E1 |
| No publicado | Generador de VSL para PAUs | marketing (inferida) | Oferta/producto | Guion VSL | Históricamente `/dashboard`; endpoint no conservado | A probable | Oculto, reintroducido o no enumerable; la portada nueva aún lo anuncia | E3, E4; ausente de E1/E2 |
| No publicado | Promts para Imagenes para Colorear | marketing (inferida) | Tema/estilo | Prompts de imágenes | Históricamente `/dashboard`; endpoint no conservado | A probable | Eliminado | E3; no está en E1/E2 |
| No publicado | Promts Mockups para Libros | marketing (inferida) | Libro/producto | Prompts de mockups | Históricamente `/dashboard`; endpoint no conservado | A probable | Eliminado | E3; no está en E1/E2 |
| No publicado | Promts Portadas para Libros | marketing (inferida) | Libro/producto | Prompts de portada | Históricamente `/dashboard`; endpoint no conservado | A probable | Eliminado | E3; no está en E1/E2 |
| No publicado | Promts para Cuadernillos | marketing (inferida) | Tema/producto | Prompts de cuadernillos | Históricamente `/dashboard`; endpoint no conservado | A probable | Eliminado | E3; no está en E1/E2 |

## 4. Herramientas auxiliares que no deben contarse como Cerebros

| ID | Cerebro | Categoría | Input | Output | Endpoint | Tipo | Estado | Evidencia |
|---|---|---|---|---|---|---|---|---|
| N/A | Extractor de YouTube | herramienta | URL de video | Heredado: `{comments,total}` con `{author,text}`; nuevo: `{comments,videoId}` con `{author,text,likes}` | Heredado `POST /api/extract-comments`; nuevo `POST /api/trpc/youtube.extractComments?batch=1` | C | Activo en ambas superficies | E3–E6 |
| N/A | Calculadora de Ads | herramienta | Métricas de anuncios | Cálculos/diagnóstico | UI heredada `/calculadora-ads`; API `/api/tools/calculadora-ads` | C | Existente en bundle heredado; no aparece en app nueva | Investigación fase 1 |
| N/A | Generador HTML/Pilas | herramienta híbrida | Campos de página/generación | HTML y registros de generación | `/api/generate-html-pilas`, `/api/html-generations` | B | Existente en bundle heredado; acceso protegido | Investigación fase 1 |
| N/A | Generador de Posts Virales | herramienta híbrida/admin | Estructura y tema | Post usando estructura y base de conocimiento | `postGenerator.generatePost` vía `/api/trpc` | B | Presente en código nuevo; sólo admin | E5 |

## Resultado definitivo: 33 frente a 47

1. **33 sí están verificados** como registros simultáneos en los dos catálogos REST heredados: 28 `marketing` + 5 `content`.
2. El campo `order` ocupa valores entre `0` y `49`, pero faltan 17 posiciones: `7, 13, 14, 17–21, 23–25, 27–29, 31–32 y 34`. Son evidencia de borrados/reordenamientos, no de Cerebros activos ocultos.
3. La instantánea histórica contiene 17 nombres retirados o consolidados además del alias `PRODUCTOS DE ALTA UTILIDAD`. Su correspondencia con los huecos es sugerente, pero no permite asignar IDs ni probar simultaneidad.
4. La nueva aplicación no contiene 47 definiciones: contiene un router genérico y un catálogo server-side. Su portada dice `+30`; `gpts.list` anónimo devuelve `[]`.
5. **Conclusión:** el número 47 puede proceder de una etapa comercial anterior o de contar Cerebros y herramientas auxiliares, pero **no está respaldado como inventario actual por HTML, bundle, sitemap, manifest ni respuestas de API públicas**.

