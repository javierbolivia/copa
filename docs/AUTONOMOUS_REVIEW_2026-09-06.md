# Hallazia — mejoras verificadas, 2026-09-06

## Estado y mapa utilizado

Base de trabajo: `8138b125f77bddc40630d2fb1a57917e9f342de8`, rama
`codex/fix-20.7d-relevance-regression`, worktree inicialmente limpio.
`ade84df4` sigue siendo un ancestro, pero no es el HEAD actual.

Hallazia es una aplicación local que convierte evidencia de mercado en decisiones,
productos digitales y materiales comerciales trazables. El mapa se construyó antes
de modificar código a partir de README, scripts, contratos, rutas, servicios,
repositorios, vistas y tests reales:

- `packages/shared`: contratos TypeBox y tipos consumidos por servidor y web.
- `apps/server/src/app.ts`: composición Fastify, repositorios, servicios y proveedores.
- `database/` y `repositories/`: SQLite, migraciones, versiones y relaciones entre proyectos.
- Research, Sources, Problems y Opportunities alimentan Product; los módulos posteriores
  consumen artefactos aprobados y conservan lineage. El motor de calidad aplica gates
  deterministas separados de la generación.
- Knowledge aporta documentos, búsqueda local y citas. Las integraciones externas se
  encuentran separadas del pipeline determinista y de los fixtures Demo.
- `apps/web/src/App.tsx`, `config/modules.ts` y `features/`: navegación por proyecto,
  módulos, biblioteca, configuración, historial y Product Studio.
- Product Studio mantiene outline, capítulos, bloques editables, autosave, aprobaciones,
  assets y exportaciones HTML/DOCX/PDF. Su API y persistencia concentraron las mejoras.

## Cambios funcionales

1. **Eliminar capítulos:** elimina también sus bloques de la versión actual y renumera
   el orden. Conserva bloques independientes e historial de versiones.
2. **Generación fuera de orden:** un capítulo intermedio se inserta antes del siguiente
   capítulo existente aunque sus predecesores sigan pendientes.
3. **Aprobación después de editar:** autosave sobre un documento aprobado deja la nueva
   revisión `IN_PROGRESS`, coherente con el nuevo artefacto borrador. Requiere aprobación
   explícita del documento; conserva las versiones históricas.
4. **Dimensiones de assets:** guarda ancho y alto del WebP resultante, después de aplicar
   orientación EXIF y reducción, en lugar de guardar las medidas del original.
5. **Lotes de capítulos:** conserva `CANCELLED`, respeta la cancelación también durante
   reanudación, evita regenerar capítulos ya guardados cuando falta su checkpoint,
   rechaza reanudaciones simultáneas del mismo job y reintentos agotados. Repetir una
   reanudación de un job completado no crea nuevas versiones.
6. **Ediciones concurrentes:** una respuesta tardía de outline no reemplaza una revisión
   más reciente. Una generación de capítulo no reemplaza contenido o instrucciones de
   ese capítulo modificados mientras esperaba. Se mantiene la combinación con ediciones
   de otros capítulos y se rechaza generar simultáneamente el mismo capítulo.
7. **Presupuesto vacío:** el contrato conserva `null` como ausencia de límite. Antes,
   la coerción de la rama numérica de `anyOf` lo convertía en cero y bloqueaba generación.
   Cero continúa siendo un presupuesto explícito válido y se rechazan valores negativos.

## Evidencia y validación

Las regresiones de contenido, aprobación, cancelación, dimensiones, concurrencia y
presupuesto se reprodujeron antes de modificar su implementación.

- Se añadieron 17 casos de prueba en total, con API real y SQLite en memoria o temporal.
- Los casos de concurrencia usan un proveedor simulado; no consumen servicios externos.
- Un test existente agrupaba exportaciones de ebook, checklist y guía y superaba sus
  5 segundos. Se separaron los tres recorridos manteniendo sus aserciones y el timeout.
  Las exportaciones físicas siguen verificándose con Chromium local.
- `npm.cmd test`: **586/586 PASS, 61 archivos**.
- `npm.cmd run typecheck`: **PASS** para shared, server y web.
- `npm.cmd run build`: **PASS** para los tres workspaces.
- Smoke HTTP del servidor compilado, en puerto efímero de localhost y SQLite en memoria:
  health, HTML de frontend, creación de proyecto y persistencia de presupuestos
  `null`, `0` y `12.5`: **PASS**. Se cerró el servidor al terminar.
- `git --no-pager diff --check`: **PASS**.

## Límites y continuación

- Product Authorization queda cubierto por los tests de contrato y validación actuales.
  **Product LIVE Smoke con proveedores reales sigue pendiente**; las pruebas locales
  no sustituyen esa aceptación.
- No se modificó directamente la base del usuario ni se hizo migración de datos.
  Las imágenes ya guardadas con dimensiones erróneas y los presupuestos cero históricos
  no se reparan automáticamente: no puede inferirse si ese cero fue intencional.
- Las respuestas de generación descartadas por conflicto mantienen su registro de
  generación y coste; no sustituyen las ediciones del documento.
- Se comprobó el HTML servido, pero no se realizó una nueva revisión visual interactiva
  de navegador. No hay cambios de UI en este conjunto.
- Avatar y Phase 19 no se iniciaron. No se cambiaron umbrales del motor de calidad,
  proveedores generativos, dependencias ni configuración de ejecución.
- No se abrió `.env`, no se hizo commit ni push. Los cambios quedan en el worktree para revisión.
