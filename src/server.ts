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
import { Account, ClientContext, Session } from "./server/contracts";
import { normalizeGameState } from "./server/normalization";
import { createPublicApiHandlers } from "./server/publicApi";
import { createRealtimeController } from "./server/realtime";
import { handleApiRequest as routeApiRequest } from "./server/router";
import { createInitialDocumentSnapshot } from "./server/seed";
import { createSessionManager } from "./server/sessions";
import { parseClientMessage, send, writeJson } from "./server/transport";
import { buildPlanningForSession, buildStateForSession } from "./server/visibility";
import { DbAccount, DbSession, DocumentDb, type TurnSnapshot, type TurnSnapshotPoint } from "./storage/documentDb";
import { Action } from "./types";
import { createTurnTimerController, type TurnTimerController } from "./turn/turnTimer";
import { detectObjectsForFleetAtCurrentHex } from "./systems/detectionSystem";
import { appendAudit } from "./systems/auditSystem";
import { captureTurnSnapshotEntry, restorePlanningTurnSnapshot } from "./turn/turnSnapshot";

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const db = new DocumentDb(createInitialDocumentSnapshot());
const persisted = db.getSnapshot();

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

if (!accounts.has("admin")) {
  accounts.set("admin", {
    username: "admin",
    password: "admin123",
    role: "admin",
    playerId: 1,
  });
}

let sessionManager: ReturnType<typeof createSessionManager>;

function persistDatabase(): void {
  const storedAccounts: Record<string, DbAccount> = {};
  for (const [username, account] of accounts.entries()) {
    storedAccounts[username] = {
      username: account.username,
      password: account.password,
      role: account.role,
      playerId: account.playerId,
    };
  }

  db.replace({
    gameState: state,
    accounts: storedAccounts,
    sessions: sessionManager?.getSessions() ?? persisted.sessions ?? {},
    turnSnapshots,
  });
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
persistDatabase();

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
    turnTimer?.startNewPlanning();
    captureTurnSnapshot("START", state.turnNumber);
    persistDatabase();
  },
  captureTurnSnapshot,
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
  turnTimer?.startNewPlanning();
  captureTurnSnapshot("START", state.turnNumber);
  persistDatabase();
  realtime.broadcastState();
  return true;
}

function broadcastState(): void {
  realtime.broadcastState();
}

function removeSessionsForPlayer(playerId: number): void {
  sessionManager.removeSessionsForPlayer(playerId);
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

const httpServer = createServer((req, res) => {
  void routeApiRequest(req, res, apiHandlers);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
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

  send(socket, {
    type: "stateUpdate",
    state: buildStateForSession(session, state),
    planning: buildPlanningForSession(session, state, pendingActions.values()),
  });

  socket.on("message", (raw: RawData) => {
    const message = parseClientMessage(raw);
    if (!message) {
      return;
    }

    realtime.handleClientMessage(context, message);
  });

  socket.on("close", () => {
    clients.delete(socket);
  });

  socket.on("error", () => {
    clients.delete(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] API + WS ready on http://localhost:${PORT}`);
  console.log("[server] seed accounts loaded (admin, p1, p2, p3)");
});
