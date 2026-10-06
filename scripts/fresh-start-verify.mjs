import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(import.meta.dirname, "..");

export function copyTrackedWorkspace(source, destination) {
  const tracked = execFileSync("git", ["-C", source, "ls-files", "-z", "--cached"], { maxBuffer: 16 * 1024 * 1024 });
  for (const path of tracked.toString("utf8").split("\0").filter(Boolean)) {
    if (path.startsWith("data/") || path.startsWith("node_modules/")) continue;
    const name = basename(path);
    if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) continue;
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(source, path), target, { recursive: true });
  }
}

function run(command, args, cwd, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command, ...args], { cwd, stdio: "inherit", ...options });
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} terminó con ${code}`)));
    child.once("error", reject);
  });
}

function startServer(cwd, environment) {
  const child = spawn(process.execPath, ["apps/server/dist/index.js"], { cwd, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostic = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { diagnostic = `${diagnostic}${String(chunk)}`.slice(-4000); });
  child.on("error", (error) => { diagnostic = `${diagnostic}\n${error.message}`.slice(-4000); });
  return { child, diagnostic: () => diagnostic };
}

async function waitForHealth(url, server) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.child.exitCode !== null) throw new Error(`El servidor temporal terminó con ${server.child.exitCode}: ${server.diagnostic()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`El servidor temporal no quedó disponible: ${server.diagnostic()}`);
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

async function verifyFreshStart() {
 const temporary = mkdtempSync(join(tmpdir(), "our-platform-fresh-"));
 let first;
 let second;
 try {
  copyTrackedWorkspace(workspace, temporary);
  await run("npm.cmd", ["ci", "--no-audit", "--no-fund"], temporary);
  await run("npm.cmd", ["run", "build"], temporary);
  const port=45_000+Math.floor(Math.random()*1_000),baseUrl=`http://127.0.0.1:${port}`;
  const environment = { ...process.env, PORT: String(port), DATA_DIR: join(temporary, "fresh-data") };
  const firstServer = startServer(temporary, environment);
  first = firstServer.child;
  const health = await waitForHealth(`${baseUrl}/api/health`, firstServer);
  const demoResponse = await fetch(`${baseUrl}/api/demo/projects`, { method: "POST" });
  if (!demoResponse.ok) throw new Error(`Demo devolvió HTTP ${demoResponse.status}`);
  const demo = await demoResponse.json();
  await stop(first);
  const secondServer = startServer(temporary, environment);
  second = secondServer.child;
  await waitForHealth(`${baseUrl}/api/health`, secondServer);
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyFreshStart();
