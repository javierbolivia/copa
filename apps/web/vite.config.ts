import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const workspaceRoot = resolve(import.meta.dirname, "../..");
  const environment = loadEnv(mode, workspaceRoot, "");
  const backendPort = Number(environment.PORT || 4310);

  return {
    plugins: [react()],
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
