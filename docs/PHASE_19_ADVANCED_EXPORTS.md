# Phase 19 — Advanced Ebook + Checklist Exports

## Estado y objetivo

Especificación autoritativa aprobada para ampliar la presentación de exportaciones de **ebook** y **checklist** sin alterar el documento canónico. Los incrementos **19.1** y **19.2** están autorizados e implementados; 19.3–19.5 siguen fuera de implementación.

El objetivo es introducir planes transitorios y deterministas que seleccionen perfiles de presentación para ebook y checklist a partir de una `ProductDocumentVersion` existente, y una estructura de lectura avanzada exclusivamente para ebook.

## Alcance mínimo autorizado (19.1)

- Derivar un perfil de exportación exclusivamente de `ProductDocumentVersion`: `documentType`, `outline`, `blocks` y `theme`.
- Definir perfiles distintos para `ebook` y `checklist`.
- Aplicar el perfil dentro del camino de renderizado de exportación, sin modificar el contenido canónico.
- Para todo `documentType` no objetivo, conservar el renderer y su resultado actual.
- Mantener el plan transitorio, local y determinista: la misma versión canónica produce la misma selección de perfil y no depende de datos externos ni de generación por IA.

## No-goals

- No cambiar ni persistir `ProductDocumentVersion`, sus campos canónicos, ni su contenido.
- No migraciones, nuevas dependencias, cambios de esquema, ni refactors incidentales.
- No nuevos tipos de documento fuera de ebook y checklist.
- No cambios de contratos frontend, backend o shared, salvo que una autorización posterior los requiera expresamente.
- No sustituir el pipeline vigente de HTML, DOCX o PDF ni cambiar la semántica de sus archivos derivados.
- No implementar los incrementos 19.3–19.5.

## Subsistemas afectados

- **Product Studio / `ProductDocumentVersion`:** solo lectura de `documentType`, `outline`, `blocks` y `theme`; sigue siendo la fuente canónica.
- **Servicio y renderer de exportación:** punto local para resolver y aplicar el perfil transitorio de los dos tipos objetivo y la presentación estructurada de ebook.
- **Derivados físicos:** HTML, DOCX y PDF continúan siendo derivados inmutables de una versión concreta; se preservan el registro de exportación, checksum y rutas actuales.
- **Frontend, contratos shared, base de datos, migraciones, assets, backup/restore e integraciones generativas:** no afectados por 19.1 ni 19.2.

## Incrementos aprobados

### 19.1 — Perfiles transitorios deterministas

**Autorización:** implementada.

**Criterios de aceptación:**

1. La resolución de perfil recibe únicamente la versión canónica y usa `documentType`, `outline`, `blocks` y `theme`.
2. Existen perfiles específicos y distinguibles para `ebook` y `checklist`.
3. La resolución y el resultado de renderizado son deterministas para la misma `ProductDocumentVersion`.
4. Un `documentType` no objetivo conserva el renderer vigente, sin cambio de comportamiento ni de perfil.
5. La operación no escribe ni muta el documento canónico, no agrega persistencia y no requiere migraciones ni dependencias.
6. La cobertura focalizada prueba ebook, checklist y un tipo no objetivo, incluida la ausencia de mutación canónica.

### 19.2 — Advanced Ebook Export

**Autorización:** autorizada e implementada.

**Contrato y criterios de aceptación:**

1. Sólo para `documentType === "ebook"`, el renderer deriva localmente una presentación transitoria de título canónico, `theme`, `outline` y `blocks`; no muta ni persiste la versión.
2. La portada HTML y DOCX muestra el título canónico y el theme. El HTML distingue ebook con una portada y TOC propios; sus anchors y enlaces se derivan de IDs de capítulo controlados, no de texto, y no introducen JavaScript ni handlers.
3. El TOC es estático, sigue `outline.order` con desempate determinista por ID y numera capítulos `1.`, `2.`, etc.
4. Cada item de outline se renderiza como capítulo, aunque no tenga bloques. Los bloques se agrupan por `metadata.chapterId` cuando corresponde; los no asignados o con referencia no resoluble se conservan en orden determinista como contenido adicional.
5. HTML muestra separadores de página deterministas entre capítulos. DOCX conserva la estructura visible equivalente —portada, TOC, capítulos numerados y page breaks entre capítulos— y PDF sigue derivando del HTML sin alterar su pipeline.
6. Checklist, guide y demás tipos no ebook conservan exactamente la ruta de render de 19.1.
7. La cobertura HTTP focalizada valida HTML, DOCX y PDF ebook, determinismo y ausencia de mutación, además de los controles no ebook.

### 19.3 — Fuera de implementación

**Autorización:** no autorizada. **Criterio:** no se modifica código, contratos, persistencia ni renderer para este incremento; cualquier definición o implementación requiere aprobación explícita posterior.

### 19.4 — Fuera de implementación

**Autorización:** no autorizada. **Criterio:** no se modifica código, contratos, persistencia ni renderer para este incremento; cualquier definición o implementación requiere aprobación explícita posterior.

### 19.5 — Fuera de implementación

**Autorización:** no autorizada. **Criterio:** no se modifica código, contratos, persistencia ni renderer para este incremento; cualquier definición o implementación requiere aprobación explícita posterior.

## Invariantes y regresiones a prevenir

- `ProductDocumentVersion` permanece como fuente canónica; las exportaciones nunca se convierten en fuente de verdad.
- La derivación no altera `documentType`, `outline`, `blocks`, `theme` ni ningún dato asociado a la versión.
- HTML, DOCX y PDF conservan su carácter de artefactos físicos, inmutables y trazables por versión concreta.
- Los tipos no objetivo preservan exactamente su ruta de renderer actual.
- Se mantienen las validaciones actuales de assets, escapes, rutas, MIME, extensiones, bytes, dimensiones, SVG, aislamiento por proyecto y checksums.
- No se introducen llamadas a IA, variabilidad externa, estado oculto ni mutaciones que rompan la reproducibilidad.

## Definición de terminado

Phase 19.1 y 19.2 quedan terminadas si satisfacen sus criterios de aceptación, conservan las invariantes, añaden pruebas focalizadas, pasan el typecheck del área afectada y `git --no-pager diff --check`, y no tocan subsistemas fuera del alcance. Los incrementos 19.3–19.5 siguen pendientes de una aprobación explícita y no forman parte de esta definición de terminado.
