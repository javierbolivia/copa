import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseDirectory = resolve(rootDirectory, "data", "spike");
const databasePath = resolve(databaseDirectory, "sqlite-spike.db");

mkdirSync(databaseDirectory, { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) {
  rmSync(`${databasePath}${suffix}`, { force: true });
}

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");
database.exec("PRAGMA journal_mode = WAL");
database.exec(`
  CREATE TABLE spike_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT NOT NULL
  ) STRICT
`);

const insert = database.prepare(
  "INSERT INTO spike_items (name, state) VALUES (?, ?)",
);
const selectByName = database.prepare(
  "SELECT id, name, state FROM spike_items WHERE name = ?",
);

insert.run("crud-item", "created");
assert.equal(selectByName.get("crud-item").state, "created");

database
  .prepare("UPDATE spike_items SET state = ? WHERE name = ?")
  .run("updated", "crud-item");
assert.equal(selectByName.get("crud-item").state, "updated");

database.exec("BEGIN");
insert.run("rolled-back-item", "temporary");
database.exec("ROLLBACK");
assert.equal(selectByName.get("rolled-back-item"), undefined);

database.exec("BEGIN");
insert.run("persisted-item", "committed");
database.exec("COMMIT");

database.prepare("DELETE FROM spike_items WHERE name = ?").run("crud-item");
assert.equal(selectByName.get("crud-item"), undefined);
database.close();

const reopenedDatabase = new DatabaseSync(databasePath, { readOnly: true });
const persisted = reopenedDatabase
  .prepare("SELECT id, name, state FROM spike_items ORDER BY id")
  .all();
assert.equal(persisted.length, 1);
assert.equal(persisted[0].name, "persisted-item");
assert.equal(persisted[0].state, "committed");
reopenedDatabase.close();

console.log(
  JSON.stringify(
    {
      status: "PASS",
      implementation: "node:sqlite DatabaseSync",
      node: process.version,
      databasePath,
      checks: [
        "create database",
        "create table",
        "insert",
        "select",
        "update",
        "delete",
        "transaction rollback",
        "transaction commit",
        "close and reopen",
        "disk persistence",
      ],
      persisted,
    },
    null,
    2,
  ),
);
