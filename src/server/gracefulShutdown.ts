import type { Server } from "http";
import type { WebSocketServer } from "ws";

import type { StructuredLogger } from "./observability";

export interface GracefulShutdownController {
  installSignalHandlers: () => void;
  isShuttingDown: () => boolean;
  shutdown: (signal: NodeJS.Signals | "MANUAL") => Promise<void>;
}

interface GracefulShutdownDeps {
  httpServer: Server;
  webSocketServer: WebSocketServer;
  cancelTurnTimer: () => void;
  persistFinalState: () => void;
  logger: StructuredLogger;
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections?.();
  });
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
  for (const client of server.clients) client.close(1012, "Server shutting down");
  return new Promise((resolve) => server.close(() => resolve()));
}

export function createGracefulShutdownController(
  deps: GracefulShutdownDeps,
): GracefulShutdownController {
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  async function shutdown(signal: NodeJS.Signals | "MANUAL"): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      deps.logger.info("shutdown_started", { signal });
      deps.cancelTurnTimer();
      try {
        deps.persistFinalState();
      } catch (error) {
        deps.logger.error("shutdown_persistence_failed", {
          signal,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        process.exitCode = 1;
      }
      await Promise.allSettled([
        closeWebSocketServer(deps.webSocketServer),
        closeHttpServer(deps.httpServer),
      ]);
      deps.logger.info("shutdown_complete", { signal });
    })();
    return shutdownPromise;
  }

  function installSignalHandlers(): void {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        void shutdown(signal);
      });
    }
  }

  return {
    installSignalHandlers,
    isShuttingDown: () => shuttingDown,
    shutdown,
  };
}
