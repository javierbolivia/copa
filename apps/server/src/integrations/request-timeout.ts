import { IntegrationError } from "./integration-error.js";

/** Keep the deadline active until headers AND the response body have been read. */
export async function withIntegrationTimeout<T>(
  service: string,
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(controller.signal);
  } catch (error) {
    // Body parsers and HTTP error readers may wrap or swallow the abort error.
    if (controller.signal.aborted) {
      throw new IntegrationError("timeout", `${service} no respondió dentro del tiempo permitido.`, {
        retryable: true,
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
