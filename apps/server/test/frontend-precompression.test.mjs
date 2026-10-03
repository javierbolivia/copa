import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { precompressTextAssets } from "../../web/vite.config.js";

describe("frontend text asset precompression", () => {
  let outputDirectory;

  afterEach(async () => {
    if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
    outputDirectory = undefined;
  });

  it("writes gzip sidecars matching the finalized JS, CSS, and HTML assets", async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), "hallazia-precompression-"));
    const assets = {
      "index.js": "const app = 'final';\n",
      "assets/index.css": "body { color: rebeccapurple; }\n",
      "index.html": "<!doctype html><title>Final</title>\n",
      "assets/logo.svg": "<svg></svg>",
    };

    for (const [fileName, contents] of Object.entries(assets)) {
      const filePath = join(outputDirectory, fileName);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, contents);
    }

    const writeBundle = precompressTextAssets.writeBundle;
    if (typeof writeBundle !== "function") {
      throw new Error("Expected the precompression writeBundle hook to be callable");
    }
    await writeBundle.call(
      {},
      { dir: outputDirectory },
      Object.keys(assets).map((fileName) => ({ fileName })),
    );

    for (const fileName of ["index.js", "assets/index.css", "index.html"]) {
      const original = await readFile(join(outputDirectory, fileName));
      const compressed = await readFile(join(outputDirectory, `${fileName}.gz`));
      expect(gunzipSync(compressed)).toEqual(original);
    }

    await expect(readFile(join(outputDirectory, "assets/logo.svg.gz"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
