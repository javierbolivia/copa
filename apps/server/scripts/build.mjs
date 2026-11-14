import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Check every source on each build, but do not rewrite byte-identical outputs.
// A read-only handle held by an archive viewer must not block unchanged files.
export function buildProject(configPath) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return { diagnostics: [config.error], failed: true };
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(configPath, ".."), undefined, configPath);
  if (parsed.errors.length) return { diagnostics: parsed.errors, failed: true };
  const host = ts.createCompilerHost(parsed.options);
  const writeFile = host.writeFile;
  host.writeFile = (filename, data, writeByteOrderMark, ...rest) => {
    const bytes = writeByteOrderMark ? "\uFEFF" + data : data;
    try { if (readFileSync(filename, "utf8") === bytes) return; } catch { /* Missing or unreadable output still goes through the normal writer. */ }
    writeFile(filename, data, writeByteOrderMark, ...rest);
  };
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences, host });
  const emitted = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
  return { diagnostics, failed: emitted.emitSkipped || diagnostics.some(item => item.category === ts.DiagnosticCategory.Error) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = buildProject(resolve("tsconfig.build.json"));
  if (result.diagnostics.length) process.stderr.write(ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => ts.sys.newLine,
  }));
  if (result.failed) process.exitCode = 1;
}
