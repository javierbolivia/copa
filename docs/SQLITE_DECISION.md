# Decisión SQLite de la Fase 1

## Elección

Se utilizará `node:sqlite`, concretamente `DatabaseSync`, incluido en Node.js 24.15.0.

## Motivos

- El spike se ejecutó en el runtime real de Windows, no por compatibilidad asumida.
- No requiere compilar addons nativos ni descargar un binario SQLite separado.
- No necesita Python.
- Reduce dependencias y problemas de instalación.
- Expone prepared statements, transacciones, backup y sesiones desde Node.
- Una API síncrona es suficiente para una aplicación local de un usuario; las operaciones largas se mantendrán fuera de transacciones extensas.

## Comprobaciones ejecutadas

El script `scripts/sqlite-spike.mjs` verificó:

1. creación de base en disco;
2. creación de tabla `STRICT`;
3. INSERT;
4. SELECT;
5. UPDATE;
6. DELETE;
7. transacción con ROLLBACK;
8. transacción con COMMIT;
9. cierre de conexión;
10. reapertura read-only;
11. persistencia del registro confirmado.

Resultado: **PASS** en Node.js 24.15.0.

## Incidencia encontrada

La primera aserción asumía que el registro confirmado tendría ID 1 y comparaba directamente objetos devueltos por `node:sqlite`, que usan prototipo nulo. SQLite actuó correctamente: el registro confirmado obtuvo ID 2 porque fue insertado antes de borrar el ID 1. Se corrigió el test para comprobar contenido y persistencia sin asumir detalles de rowid o prototipo.

## Límites de la decisión

- El servidor debe cerrar la conexión de forma ordenada.
- Todas las consultas de entrada usarán prepared statements.
- Las migraciones se aplicarán en transacciones.
- `PRAGMA foreign_keys=ON` se habilita por conexión.
- WAL se usa para la base local normal; pruebas in-memory pueden usar el modo predeterminado.
- Si un futuro benchmark demuestra bloqueo significativo, se evaluará un worker de base de datos antes de cambiar de motor.
