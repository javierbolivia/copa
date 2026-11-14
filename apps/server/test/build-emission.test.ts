import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// JavaScript compiler entry point is shared with npm run build.
// @ts-expect-error Local .mjs intentionally has no generated declaration.
import { buildProject } from "../scripts/build.mjs";

describe("server build emission", () => {
  let root: string;
  let output: string;
  afterEach(() => {
    if (output) { try { chmodSync(output, 0o666); } catch { /* Output may not have been produced. */ } }
    if (root) rmSync(root, { recursive: true, force: true });
  });
  it("retains identical output bytes and dates while still checking types and emitting changed code", () => {
    root = mkdtempSync(join(tmpdir(), "hallazia-build-test-"));
    const config = join(root, "tsconfig.json"), source = join(root, "source.ts");
    output = join(root, "dist", "source.js");
    writeFileSync(config, JSON.stringify({ compilerOptions: { target: "ES2022", module: "ES2022", outDir: "dist", skipLibCheck: true, types: [] }, files: ["source.ts"] }));
    writeFileSync(source, "export const value: number = 1;\n");
    expect(buildProject(config).failed).toBe(false);
    const original = readFileSync(output, "utf8"), date = new Date("2020-01-01T00:00:00Z");
    utimesSync(output, date, date);
    chmodSync(output, 0o444);
    expect(buildProject(config).failed).toBe(false);
    expect(readFileSync(output, "utf8")).toBe(original);
    expect(statSync(output).mtime.toISOString()).toBe(date.toISOString());
    chmodSync(output, 0o666);
    writeFileSync(source, "export const value: number = 2;\n");
    expect(buildProject(config).failed).toBe(false);
    expect(readFileSync(output, "utf8")).toContain("value = 2");
    writeFileSync(source, "export const value: number = 'wrong';\n");
    const rejected = buildProject(config);
    expect(rejected.failed).toBe(true);
    expect(rejected.diagnostics.some((diagnostic: { code: number }) => diagnostic.code === 2322)).toBe(true);
  });
});
