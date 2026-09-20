import type { IncomingMessage, ServerResponse } from "http";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface StructuredLogger {
  log: (level: LogLevel, event: string, fields?: LogFields) => void;
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
}

export function createStructuredLogger(): StructuredLogger {
  function log(level: LogLevel, event: string, fields: LogFields = {}): void {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields,
    });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.log(entry);
  }
  return {
    log,
    info: (event, fields) => log("info", event, fields),
    warn: (event, fields) => log("warn", event, fields),
    error: (event, fields) => log("error", event, fields),
  };
}

export interface ServerMetrics {
  wsConnections: number;
  commandErrorsTotal: number;
  persistenceFailuresTotal: number;
  lastResolutionDurationMs: number | null;
  lastResolutionCompletedAt: string | null;
}

export interface HealthState {
  isReady: () => boolean;
  isShuttingDown: () => boolean;
  persistenceHealthy: () => boolean;
  metrics: ServerMetrics;
}

export function handleHealthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  state: HealthState,
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/health" && url.pathname !== "/ready") return false;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (url.pathname === "/health") {
    res.statusCode = 200;
    res.end(JSON.stringify({ status: "ok", metrics: state.metrics }));
    return true;
  }

  const ready = state.isReady() && !state.isShuttingDown() && state.persistenceHealthy();
  res.statusCode = ready ? 200 : 503;
  res.end(JSON.stringify({ status: ready ? "ready" : "not_ready", metrics: state.metrics }));
  return true;
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack };
  }
  return { errorMessage: String(error) };
}
