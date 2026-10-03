import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

export const precompressTextAssets: Plugin = {
  name: "precompress-text-assets",
  apply: "build" as const,
  async writeBundle(options, bundle) {
    const outputDirectory = resolve(import.meta.dirname, options.dir ?? "dist");
    for (const output of Object.values(bundle)) {
      if (!/\.(?:js|css|html)$/.test(output.fileName)) continue;
      const source = await readFile(resolve(outputDirectory, output.fileName));
      await writeFile(resolve(outputDirectory, `${output.fileName}.gz`), gzipSync(source));
    }
  },
};

export default defineConfig(({ mode }) => {
  const workspaceRoot = resolve(import.meta.dirname, "../..");
  const environment = loadEnv(mode, workspaceRoot, "");
  const backendPort = Number(environment.PORT || 4310);

  return {
    plugins: [react(), precompressTextAssets],
    resolve: { dedupe: ["react", "react-dom"] },
    optimizeDeps: { entries: ["index.html"], include: ["@puckeditor/core"] },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": `http://127.0.0.1:${backendPort}`,
      },
    },
  };
});
