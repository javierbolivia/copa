import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const workspace = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "our-platform-fresh-"));
const excluded = new Set([".git", "data", "node_modules"]);

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command, ...args], { cwd: temporary, stdio: "inherit", ...options });
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} terminó con ${code}`)));
    child.once("error", reject);
  });
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("El servidor temporal no quedó disponible.");
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

let first;
let second;
try {
  for (const entry of readdirSync(workspace, { withFileTypes: true })) {
    if (!excluded.has(entry.name)) cpSync(join(workspace, entry.name), join(temporary, entry.name), { recursive: true });
  }
  await run("npm.cmd", ["ci"]);
  await run("npm.cmd", ["run", "build"]);
  const port=45_000+Math.floor(Math.random()*1_000),baseUrl=`http://127.0.0.1:${port}`;
  const environment = { ...process.env, PORT: String(port), DATA_DIR: join(temporary, "fresh-data") };
  first = spawn(process.execPath, ["apps/server/dist/index.js"], { cwd: temporary, env: environment, stdio: "ignore" });
  const health = await waitForHealth(`${baseUrl}/api/health`);
  const demoResponse = await fetch(`${baseUrl}/api/demo/projects`, { method: "POST" });
  if (!demoResponse.ok) throw new Error(`Demo devolvió HTTP ${demoResponse.status}`);
  const demo = await demoResponse.json();
  await stop(first);
  second = spawn(process.execPath, ["apps/server/dist/index.js"], { cwd: temporary, env: environment, stdio: "ignore" });
  await waitForHealth(`${baseUrl}/api/health`);
  const persistedResponse = await fetch(`${baseUrl}/api/projects/${demo.project.id}/modules/final_product`);
  const persisted = await persistedResponse.json();
  if (!persistedResponse.ok || persisted.results?.length !== 1) throw new Error("El resultado no persistió tras reiniciar.");
  console.log(JSON.stringify({ schemaVersion: health.sqlite.schemaVersion, demoModules: demo.results.length, persistedVersions: persisted.results.length }));
} finally {
  if (first) await stop(first);
  if (second) await stop(second);
  const resolvedTemporary = resolve(temporary);
  if (resolvedTemporary.startsWith(resolve(tmpdir())) && basename(resolvedTemporary).startsWith("our-platform-fresh-")) {
    try { rmSync(resolvedTemporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { console.warn(`No se pudo limpiar el directorio temporal: ${resolvedTemporary}`); }
  }
}
