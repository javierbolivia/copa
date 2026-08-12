import { resolve } from "node:path";

export const APP_VERSION = "0.1.0";
export const LOCAL_HOST = "127.0.0.1";
export const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 4310;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT debe ser un entero entre 1 y 65535.");
  }
  return port;
}

export interface AppConfig {
  readonly host: typeof LOCAL_HOST;
  readonly port: number;
  readonly databasePath: string;
}

export function loadConfig(): AppConfig {
  const dataDirectory = resolve(WORKSPACE_ROOT, process.env.DATA_DIR ?? "data");
  return {
    host: LOCAL_HOST,
    port: parsePort(process.env.PORT),
    databasePath: resolve(dataDirectory, "our-platform.db"),
  };
}
