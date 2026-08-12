import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";

import { createApp } from "./app.js";
import { loadConfig, WORKSPACE_ROOT } from "./config.js";

loadDotEnv({ path: resolve(WORKSPACE_ROOT, ".env"), quiet: true });

const config = loadConfig();
const app = await createApp({
  databasePath: config.databasePath,
  logger: true,
  serveFrontend: true,
});

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
