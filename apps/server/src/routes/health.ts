import { HealthSchema, type Health } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";

import { APP_VERSION } from "../config.js";
import type { AppDatabase } from "../database/database.js";

export function registerHealthRoute(
  app: FastifyInstance,
  database: AppDatabase,
): void {
  app.get<{ Reply: Health }>(
    "/api/health",
    { schema: { response: { 200: HealthSchema } } },
    async () => {
      try {
        const sqliteOk = database.check();
        return {
          status: sqliteOk ? "ok" : "degraded",
          version: APP_VERSION,
          sqlite: {
            status: sqliteOk ? "ok" : "error",
            implementation: "node:sqlite",
            schemaVersion: database.getSchemaVersion(),
          },
        };
      } catch {
        return {
          status: "degraded",
          version: APP_VERSION,
          sqlite: {
            status: "error",
            implementation: "node:sqlite",
            schemaVersion: null,
          },
        };
      }
    },
  );
}
