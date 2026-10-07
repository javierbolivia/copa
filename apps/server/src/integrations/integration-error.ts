import type { LlmPhysicalRequestUsage } from "@our-platform/shared";
import type { JsonSchemaValidationIssue } from "./structured-output.js";

export type IntegrationErrorCode =
  | "missing_api_key"
  | "authentication_failed"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "network_error"
  | "http_error"
  | "invalid_response"
  | "schema_mismatch"
  | "fixture_missing"
  // Granular categories used by clients that can distinguish the failing stage.
  | "transport_error"
  | "http_auth_error"
  | "http_balance_error"
  | "http_rate_limit"
  | "http_provider_error"
  | "non_json_response"
  | "invalid_schema"
  | "empty_completion"
  | "unsupported_model"
  | "request_budget_exceeded";

const YOUTUBE_REMOTE_REASON_CODES = [
  "dailyLimitExceeded",
  "quotaExceeded",
  "userRateLimitExceeded",
] as const;
type YouTubeRemoteReasonCode = (typeof YOUTUBE_REMOTE_REASON_CODES)[number];

export interface IntegrationErrorOptions {
  readonly status?: number;
  /** Allowlisted provider reason only; never a raw error message or response body. */
  readonly remoteReasonCode?: YouTubeRemoteReasonCode;
  readonly retryable?: boolean;
  readonly cause?: unknown;
  readonly validationIssues?: readonly JsonSchemaValidationIssue[];
  readonly attemptCount?: number;
  readonly physicalRequests?: readonly LlmPhysicalRequestUsage[];
}

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly status: number | undefined;
  readonly remoteReasonCode: YouTubeRemoteReasonCode | undefined;
  readonly retryable: boolean;
  readonly validationIssues: readonly JsonSchemaValidationIssue[] | undefined;
  readonly attemptCount: number | undefined;
  readonly physicalRequests: readonly LlmPhysicalRequestUsage[] | undefined;

  constructor(code: IntegrationErrorCode, message: string, options: IntegrationErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "IntegrationError";
    this.code = code;
    this.status = options.status;
    this.remoteReasonCode = options.remoteReasonCode;
    this.retryable = options.retryable ?? false;
    this.validationIssues = options.validationIssues;
    this.attemptCount = options.attemptCount;
    this.physicalRequests = options.physicalRequests;
  }
}

export function normalizeFetchError(error: unknown, service: string): IntegrationError {
  if (error instanceof IntegrationError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new IntegrationError("timeout", `${service} no respondió dentro del tiempo permitido.`, {
      retryable: true,
      cause: error,
    });
  }
  return new IntegrationError("network_error", `No se pudo conectar con ${service}.`, {
    retryable: true,
    cause: error,
  });
}

export async function readErrorType(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { type?: unknown; code?: unknown; errors?: Array<{ reason?: unknown }> };
    };
    const value = body.error?.errors?.[0]?.reason ?? body.error?.code ?? body.error?.type;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function httpIntegrationError(service: string, status: number, remoteType?: string): IntegrationError {
  const remoteReasonCode = service === "YouTube"
    ? YOUTUBE_REMOTE_REASON_CODES.find((reason) => reason === remoteType)
    : undefined;
  const diagnostics = {
    status,
    ...(remoteReasonCode === undefined ? {} : { remoteReasonCode }),
  };
  if (remoteType === "insufficient_quota" || remoteType === "quotaExceeded" || remoteType === "dailyLimitExceeded") {
    return new IntegrationError("quota_exceeded", `${service} informó que la cuota disponible se agotó.`, diagnostics);
  }
  if (remoteType === "rate_limit_error" || remoteType === "userRateLimitExceeded") {
    return new IntegrationError("rate_limited", `${service} limitó temporalmente las solicitudes.`, { ...diagnostics, retryable: true });
  }
  if (status === 401 || status === 403) {
    return new IntegrationError("authentication_failed", `${service} rechazó las credenciales configuradas.`, diagnostics);
  }
  if (status === 429) {
    return new IntegrationError("rate_limited", `${service} limitó temporalmente las solicitudes.`, { ...diagnostics, retryable: true });
  }
  return new IntegrationError("http_error", `${service} respondió con HTTP ${status}.`, {
    ...diagnostics,
    retryable: status >= 500,
  });
}
