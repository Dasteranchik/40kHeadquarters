import { createServer, IncomingMessage, ServerResponse } from "http";
import { RawData, WebSocket, WebSocketServer } from "ws";

import { createFactionAdminHandlers } from "./server/admin/factions";
import { createFleetAdminHandlers } from "./server/admin/fleets";
import { AdminHandlerDeps } from "./server/admin/deps";
import { createPlanetAdminHandlers } from "./server/admin/planets";
import { createPlayerAdminHandlers } from "./server/admin/players";
import { createRelationAdminHandlers } from "./server/admin/relations";
import { createProductConversionAdminHandlers } from "./server/admin/productConversion";
import { createWorldObjectAdminHandlers } from "./server/admin/worldObjects";
import { createSystemSettingsAdminHandlers } from "./server/admin/systemSettings";
import { createUnitVariantAdminHandlers } from "./server/admin/unitVariants";
import { Account, ClientContext, Session } from "./server/contracts";
import { ensureBootstrapAdmin } from "./server/bootstrapAdmin";
import { createGracefulShutdownController } from "./server/gracefulShutdown";
import { normalizeGameState } from "./server/normalization";
import {
  createStructuredLogger,
  handleHealthRequest,
  serializeError,
  type ServerMetrics,
} from "./server/observability";
import { createPublicApiHandlers } from "./server/publicApi";
import { createRealtimeController } from "./server/realtime";
import { handleApiRequest as routeApiRequest } from "./server/router";
import { createInitialDocumentSnapshot } from "./server/seed";
import { createSessionManager } from "./server/sessions";
import { createStateTransactionManager } from "./server/stateTransaction";
import { parseClientMessage, send, writeJson } from "./server/transport";
import { buildPlanningForSession, buildStateForSession } from "./server/visibility";
import { DbSession, DocumentDb, type TurnSnapshot, type TurnSnapshotPoint } from "./storage/documentDb";
import { migrateDocumentSnapshot } from "./storage/migrations";
import { Action } from "./types";
import { createTurnTimerController, type TurnTimerController } from "./turn/turnTimer";
import { detectObjectsForFleetAtCurrentHex } from "./systems/detectionSystem";
import { appendAudit } from "./systems/auditSystem";
import { captureTurnSnapshotEntry, restorePlanningTurnSnapshot } from "./turn/turnSnapshot";

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;
const logger = createStructuredLogger();
const metrics: ServerMetrics = {
  wsConnections: 0,
  commandErrorsTotal: 0,
  persistenceFailuresTotal: 0,
  lastResolutionDurationMs: null,
  lastResolutionCompletedAt: null,
};
let persistenceHealthy = true;
let serverReady = false;

let db: DocumentDb;
try {
  db = new DocumentDb(createInitialDocumentSnapshot());
} catch (error) {
  logger.error("database_load_failed", serializeError(error));
  throw error;
}
const persisted = migrateDocumentSnapshot(db.getSnapshot());

const state = normalizeGameState(persisted.gameState);
const configuredTurnDurationMs = Number(process.env.TURN_DURATION_MS);
if (Number.isFinite(configuredTurnDurationMs) && configuredTurnDurationMs > 0) {
  state.turnTimer.durationMs = Math.trunc(configuredTurnDurationMs);
}
for (const fleet of Object.values(state.fleets)) {
  detectObjectsForFleetAtCurrentHex(state, fleet.id);
}
const pendingActions = new Map<string, Action>();
const pendingAllianceProposals = new Set<string>();
const readyPlayers = new Set<number>();
const clients = new Map<WebSocket, ClientContext>();
const turnSnapshots: TurnSnapshot[] = [...(persisted.turnSnapshots ?? [])].slice(-100);

function captureTurnSnapshot(point: TurnSnapshotPoint, turnNumber: number): void {
  captureTurnSnapshotEntry(turnSnapshots, state, point, turnNumber);
}

if (!turnSnapshots.some((snapshot) =>
  snapshot.turnNumber === state.turnNumber && snapshot.point === "START"
)) {
  captureTurnSnapshot("START", state.turnNumber);
}

const accounts = new Map<string, Account>();
for (const account of Object.values(persisted.accounts)) {
  accounts.set(account.username, { ...account });
}

const adminBootstrapped = ensureBootstrapAdmin(accounts, {
  username: process.env.BOOTSTRAP_ADMIN_USERNAME,
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
});

let sessionManager: ReturnType<typeof createSessionManager>;
let transactionManager: ReturnType<typeof createStateTransactionManager>;

function persistDatabase(): void {
  transactionManager.persistAndCommit();
  persistenceHealthy = true;
}

const restoredSessions = Object.fromEntries(
  Object.entries(persisted.sessions ?? {}).filter(([, session]) => {
    const account = accounts.get(session.username);
    return Boolean(
      account
      && account.role === session.role
      && account.playerId === session.playerId,
    );
  }),
) as Record<string, DbSession>;

sessionManager = createSessionManager(
  SESSION_TTL_MS,
  restoredSessions,
  persistDatabase,
);
transactionManager = createStateTransactionManager({
  repository: db,
  state,
  accounts,
  turnSnapshots,
  pendingActions,
  pendingAllianceProposals,
  readyPlayers,
  getSessions: sessionManager.getSessions,
  restoreSessions: sessionManager.restoreSessions,
  onPersistenceFailure: (error) => {
    persistenceHealthy = false;
    metrics.persistenceFailuresTotal += 1;
    logger.error("persistence_failed", {
      ...serializeError(error),
      turnNumber: state.turnNumber,
      phase: state.phase,
    });
  },
});
persistDatabase();
if (adminBootstrapped) {
  logger.info("bootstrap_admin_created", {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
  });
}

function requireAdmin(req: IncomingMessage, res: ServerResponse): Session | null {
  return sessionManager.requireAdmin(req, res);
}

function ensurePlanningPhase(res: ServerResponse): boolean {
  if (state.phase !== "PLANNING") {
    writeJson(res, 409, { error: "Operation allowed only in PLANNING phase" });
    return false;
  }
  return true;
}

let turnTimer: TurnTimerController | null = null;
const realtime = createRealtimeController({
  state,
  pendingActions,
  pendingAllianceProposals,
  readyPlayers,
  clients,
  persistDatabase,
  cancelTurnTimer: () => turnTimer?.cancel(),
  startNewPlanningTimer: () => {
    turnTimer?.startNewPlanning(false, false);
    captureTurnSnapshot("START", state.turnNumber);
    try {
      persistDatabase();
    } finally {
      turnTimer?.restore();
    }
  },
  captureTurnSnapshot,
  onResolutionComplete: (durationMs, succeeded) => {
    metrics.lastResolutionDurationMs = durationMs;
    metrics.lastResolutionCompletedAt = new Date().toISOString();
    logger.info("turn_resolution_completed", {
      durationMs,
      succeeded,
      turnNumber: state.turnNumber,
    });
  },
  onCommandError: ({ commandId, playerId, username, message }) => {
    metrics.commandErrorsTotal += 1;
    logger.warn("command_rejected", {
      ...(commandId ? { commandId } : {}),
      ...(playerId === undefined ? {} : { playerId }),
      username,
      message,
    });
  },
});

turnTimer = createTurnTimerController({
  state,
  onElapsed: () => {
    realtime.finishCurrentTurn("TIMER");
  },
  persist: persistDatabase,
});
turnTimer.restore();

function listTurnSnapshots(): TurnSnapshot[] {
  return turnSnapshots.map((snapshot) => ({
    ...snapshot,
    gameState: structuredClone(snapshot.gameState),
  }));
}

function rollbackTurnSnapshot(snapshotId: string, account: string): boolean {
  const snapshot = turnSnapshots.find((entry) => entry.id === snapshotId);
  if (!snapshot || snapshot.gameState.phase !== "PLANNING") return false;
  turnTimer?.cancel();
  if (!restorePlanningTurnSnapshot(state, snapshot)) return false;
  pendingActions.clear();
  pendingAllianceProposals.clear();
  readyPlayers.clear();
  appendAudit(state, {
    actor: { kind: "ADMIN", account },
    operation: "ROLLBACK_TURN_SNAPSHOT",
    entityType: "TURN_SNAPSHOT",
    entityId: snapshotId,
    after: { turnNumber: state.turnNumber, point: snapshot.point },
  });
  turnTimer?.startNewPlanning(false, false);
  captureTurnSnapshot("START", state.turnNumber);
  try {
    persistDatabase();
  } finally {
    turnTimer?.restore();
  }
  realtime.broadcastState();
  return true;
}

function broadcastState(): void {
  realtime.broadcastState();
}

function removeSessionsForPlayer(playerId: number, notify = true): void {
  sessionManager.removeSessionsForPlayer(playerId, notify);
}

function auditAdminMutation(
  req: IncomingMessage,
  input: Omit<Parameters<typeof appendAudit>[1], "actor">,
): void {
  const session = sessionManager.getSessionFromRequest(req);
  appendAudit(state, {
    ...input,
    actor: { kind: "ADMIN", account: session?.username ?? "unknown-admin" },
  });
}

const adminDeps: AdminHandlerDeps = {
  state,
  accounts,
  pendingActions,
  pendingAllianceProposals,
  readyPlayers,
  requireAdmin,
  ensurePlanningPhase,
  persistDatabase,
  broadcastState,
  removeSessionsForPlayer,
  listTurnSnapshots,
  rollbackTurnSnapshot,
  auditAdminMutation,
};
const playerAdmin = createPlayerAdminHandlers(adminDeps);
const planetAdmin = createPlanetAdminHandlers(adminDeps);
const fleetAdmin = createFleetAdminHandlers(adminDeps);
const factionAdmin = createFactionAdminHandlers(adminDeps);
const relationAdmin = createRelationAdminHandlers(adminDeps);
const productConversionAdmin = createProductConversionAdminHandlers(adminDeps);
const worldObjectAdmin = createWorldObjectAdminHandlers(adminDeps);
const systemSettingsAdmin = createSystemSettingsAdminHandlers(adminDeps);
const unitVariantAdmin = createUnitVariantAdminHandlers(adminDeps);

const publicApi = createPublicApiHandlers({
  accounts,
  state,
  sessionManager,
});

const apiHandlers = {
  ...publicApi,
  ...playerAdmin,
  ...factionAdmin,
  ...planetAdmin,
  ...fleetAdmin,
  ...relationAdmin,
  ...productConversionAdmin,
  ...worldObjectAdmin,
  ...systemSettingsAdmin,
  ...unitVariantAdmin,
  handleAdminEndTurn: (req: IncomingMessage, res: ServerResponse): void => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const completed = realtime.finishCurrentTurn("ADMIN_OVERRIDE", {
      kind: "ADMIN",
      account: session.username,
    });
    if (!completed) {
      writeJson(res, 409, { error: "Turn is not in PLANNING or resolution is already running" });
      return;
    }
    writeJson(res, 200, { ok: true, turnNumber: state.turnNumber });
  },
};

let shutdownController: ReturnType<typeof createGracefulShutdownController> | null = null;
const httpServer = createServer((req, res) => {
  if (handleHealthRequest(req, res, {
    isReady: () => serverReady,
    isShuttingDown: () => shutdownController?.isShuttingDown() ?? false,
    persistenceHealthy: () => persistenceHealthy,
    metrics,
  })) return;
  if (shutdownController?.isShuttingDown()) {
    writeJson(res, 503, { error: "Server is shutting down" });
    return;
  }
  void routeApiRequest(req, res, apiHandlers).catch((error: unknown) => {
    logger.error("http_request_failed", {
      ...serializeError(error),
      method: req.method,
      path: new URL(req.url ?? "/", "http://localhost").pathname,
    });
    if (!res.headersSent) writeJson(res, persistenceHealthy ? 500 : 503, { error: "Request failed" });
    else if (!res.writableEnded) res.end();
  });
});

const wss = new WebSocketServer({ server: httpServer });

shutdownController = createGracefulShutdownController({
  httpServer,
  webSocketServer: wss,
  cancelTurnTimer: () => turnTimer?.cancel(),
  persistFinalState: persistDatabase,
  logger,
});
shutdownController.installSignalHandlers();

wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  if (shutdownController?.isShuttingDown()) {
    socket.close(1012, "Server shutting down");
    return;
  }
  const sessionFromRequest = sessionManager.getSessionFromRequest(request);
  const url = new URL(request.url ?? "/", "http://localhost");
  const tokenFromQuery = url.searchParams.get("token");
  const session =
    sessionFromRequest ?? sessionManager.getSessionByToken(tokenFromQuery);

  if (!session) {
    socket.close(4401, "Unauthorized");
    return;
  }

  const context: ClientContext = {
    socket,
    session,
  };

  clients.set(socket, context);
  metrics.wsConnections = clients.size;
  logger.info("ws_connection_opened", {
    wsConnections: metrics.wsConnections,
    username: session.username,
    ...(session.playerId === undefined ? {} : { playerId: session.playerId }),
  });

  send(socket, {
    type: "stateUpdate",
    state: buildStateForSession(session, state),
    planning: buildPlanningForSession(session, state, pendingActions.values()),
  });

  socket.on("message", (raw: RawData) => {
    if (shutdownController?.isShuttingDown()) return;
    const message = parseClientMessage(raw);
    if (!message) {
      return;
    }

    try {
      realtime.handleClientMessage(context, message);
    } catch (error) {
      metrics.commandErrorsTotal += 1;
      const commandId = "commandId" in message && typeof message.commandId === "string"
        ? message.commandId
        : undefined;
      logger.error("command_failed", {
        ...serializeError(error),
        ...(commandId ? { commandId } : {}),
        username: session.username,
        ...(session.playerId === undefined ? {} : { playerId: session.playerId }),
      });
      send(socket, {
        type: "operationResult",
        ok: false,
        message: persistenceHealthy ? "Command failed" : "Persistence unavailable",
        ...(commandId ? { commandId } : {}),
      });
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
    metrics.wsConnections = clients.size;
    logger.info("ws_connection_closed", { wsConnections: metrics.wsConnections });
  });

  socket.on("error", (error) => {
    clients.delete(socket);
    metrics.wsConnections = clients.size;
    logger.warn("ws_connection_error", {
      ...serializeError(error),
      wsConnections: metrics.wsConnections,
    });
  });
});

httpServer.listen(PORT, () => {
  serverReady = true;
  logger.info("server_ready", { port: PORT });
});
