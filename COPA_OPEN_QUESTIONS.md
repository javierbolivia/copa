# Preguntas abiertas de COPA después de la segunda fase

**Fecha:** 12 de agosto de 2026  
**Regla:** esta lista contiene sólo incógnitas no resueltas legítimamente. No son invitaciones a intentar bypass, explotación ni acceso a una cuenta ajena.

## Respuestas cerradas en esta fase

- Los 47 Cerebros no aparecen definidos en el código público actual.
- Hay 33 registros verificables en la API heredada (28 marketing + 5 content).
- El dominio nuevo es una replatformización con React 19.1.1, tRPC, IDs numéricos y sesión por cookie.
- Ambos diseños usan un router de chat genérico por ID, no un endpoint distinto por Cerebro.
- Los prompts se administran server-side y probablemente viven en una base de datos.
- El extractor es backend, devuelve 500 comentarios en el video probado y no realiza análisis IA visible.
- La nueva salida del extractor añade `likes` y `videoId`.

## Prioridad alta

### 1. Catálogo autenticado de la nueva aplicación

No se puede verificar anónimamente:

- número exacto de registros que devuelve `gpts.list` a un usuario Free o VIP;
- nombres, IDs numéricos, descripciones y flags `isFree` actuales;
- si los cuatro nombres promocionales son aliases de Cerebros antiguos o registros nuevos;
- si `Generador de VSL` volvió a existir;
- si existen exactamente 47 en alguna membresía/rol.

**Qué evidencia legítima lo resolvería:** export/captura de Network de una cuenta propia autorizada al abrir el dashboard, sin cambiar IDs y ocultando datos personales.

### 2. Correspondencia histórica nombre ↔ orden ↔ ID

Los 17 huecos de `order` coinciden en magnitud con herramientas antiguas retiradas o consolidadas, pero no se conservó una respuesta pública antigua de `/api/gpts` en Wayback.

Queda abierto:

- asignar los órdenes 7, 13, 14, 17–21, 23–25, 27–29, 31–32 y 34;
- confirmar cuál nombre fue renombrado y cuál eliminado;
- saber si esos registros coexistieron con los 33 actuales.

**Qué lo resolvería:** snapshot público histórico del JSON o un changelog oficial.

### 3. Modelo y API de OpenAI

`MODELO OPENAI: NO VERIFICADO`

No se sabe:

- GPT-4o, GPT-4.1, GPT-5, mini u otro;
- Responses API, Chat Completions o Assistants API;
- temperatura, top-p, token limits, streaming, JSON mode o fallbacks;
- tools/function calling;
- si todos los Cerebros comparten modelo.

**Qué lo resolvería:** documentación pública, cabecera/metadata normal del backend o una respuesta de Network legítima que incluya el modelo. No debe inferirse por el estilo del texto.

### 4. Motor de persistencia

Hay persistencia server-side para usuarios, prompts, catálogo, conversaciones, planes, fechas de expiración, estructuras y conocimiento. No se identificó el proveedor:

- PostgreSQL/Cloud SQL/Neon;
- MySQL;
- MongoDB;
- Firebase/Firestore;
- Supabase;
- otro.

Las referencias a `Prisma` del bundle pertenecen al resaltador de sintaxis y no son evidencia de ORM.

## Extractor de YouTube

### 5. Fuente exacta

`MÉTODO DEL EXTRACTOR: DATA API V3 PROBABLE, NO VERIFICADA`

La estructura `author/text/likes`, el HTML de `textDisplay` y el patrón de 500 son compatibles con `commentThreads.list`, pero no se observó:

- hostname `googleapis.com` desde el navegador;
- librería server-side;
- clave/API project;
- servicio tercero;
- código de scraping.

### 6. Orden y selección

- ¿Usa `order=time` o `order=relevance`?
- ¿El primer comentario fijado se conserva por YouTube o por COPA?
- ¿Se detiene por 500, por páginas, por cuota o por tiempo?
- ¿Cómo actúa con menos de 500, live chat, Shorts o comentarios deshabilitados?

Dos llamadas consecutivas fueron idénticas; eso no determina la política de orden.

### 7. Replies y deduplicación

- La salida pierde `parentId`/thread ID; no se sabe si incluye replies aplanadas.
- No se sabe si consulta `comments.list` para replies adicionales.
- No se encontró duplicado exacto en el corpus probado; no prueba que exista deduplicación.

### 8. Seguridad de HTML del extractor

El frontend nuevo usa `dangerouslySetInnerHTML` para `text`. Falta verificar mediante revisión autorizada del backend si existe sanitización/allowlist. No se intentó XSS ni se publicaron comentarios de prueba.

## Chat y Cerebros

### 9. Transformaciones server-side exactas

El flujo por ID está claro, pero no se conoce:

- plantilla que combina prompt, historial y mensaje;
- ventana de contexto y truncado;
- moderación;
- reintentos/fallback;
- sanitización de entrada/salida;
- si algún Cerebro habilita búsqueda, RAG o herramientas de forma invisible al cliente.

### 10. Historial y retención

- esquema de conversación/mensaje;
- separación por usuario/tenant;
- retención y borrado físico;
- cifrado en reposo y backups;
- si `deleteConversation` borra o marca como eliminado;
- límites por usuario/plan.

### 11. Base de conocimiento del Generador de Posts

La UI nueva afirma 263 entradas y expone CRUD admin. Queda sin verificar:

- si es sólo texto relacional o RAG/vector store;
- cómo selecciona entradas;
- si el post generator usa el mismo modelo que los Cerebros;
- si esa herramienta debe contarse comercialmente entre los “Cerebros”.

## Autenticación y membresía

### 12. Tipo exacto de cookie/sesión

El cliente usa `credentials: include`, pero no se inspeccionó almacén de cookies ni se inició sesión. No se sabe:

- nombre y flags de la cookie de aplicación;
- sesión server-side frente a JWT en cookie;
- TTL/rotación;
- protección CSRF;
- invalidación al cambiar contraseña.

La cookie de borde `GAESA` observada en el dominio heredado no demuestra sesión de usuario.

### 13. Contraseñas y email en la plataforma nueva

La primera fase documentó bcrypt y Resend en la política del dominio heredado. La nueva implementación contiene login/reset/activación, pero el proveedor de hash y el de correo no quedan verificados en su bundle.

### 14. Hotmart y planes

El bundle nuevo incluye `/api/hotmart-webhook` y administración de `free`, `vip`, `vip_readonly`, pero falta determinar:

- si Hotmart es la fuente de verdad de membresía;
- cómo se sincroniza alta, cancelación y expiración;
- si existe Stripe en paralelo en la plataforma nueva;
- límites funcionales de cada plan;
- por qué la portada promete “acceso gratuito” cuando `/register` devuelve 404 y el login no muestra alta.

## 33 vs 47

### 15. Origen comercial exacto de “47”

La mejor explicación disponible es histórica o contable:

- suma de Cerebros creados a lo largo del tiempo;
- inclusión de Extractor, calculadora, HTML, tutoriales o generadores admin;
- catálogo de un plan/rol no visible anónimamente;
- cifra comercial que quedó desactualizada.

No hay evidencia suficiente para escoger una de estas hipótesis.

### 16. ¿Qué significa `order=49`?

Sólo prueba que un registro ocupa la posición 49. No prueba 50 registros activos ni que las posiciones fueran contiguas. La semántica de reordenamiento/borrado en backend sigue abierta.

## Evidencia legítima recomendada para una tercera fase

Si el titular de una cuenta propia autoriza una inspección autenticada, bastaría con:

1. abrir el dashboard normalmente;
2. exportar las llamadas `gpts.list`, `chat.getConversation` y una sola `chat.send` de un Cerebro autorizado;
3. ocultar email, cookies, tokens y contenido personal;
4. no modificar IDs ni llamar procedimientos admin;
5. registrar sólo nombres de operaciones, esquemas y metadatos no sensibles.

Eso resolvería el catálogo actual, auth de sesión y forma de respuesta. No resolvería necesariamente modelo, base de datos ni proveedor del extractor, que requieren documentación o metadata server-side legítimamente expuesta.

