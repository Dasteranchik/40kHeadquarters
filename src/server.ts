import { createServer, IncomingMessage, ServerResponse } from "http";
import { RawData, WebSocket, WebSocketServer } from "ws";

import { createFactionAdminHandlers } from "./server/admin/factions";
import { createFleetAdminHandlers } from "./server/admin/fleets";
import { AdminHandlerDeps } from "./server/admin/deps";
import { createPlanetAdminHandlers } from "./server/admin/planets";
import { createPlayerAdminHandlers } from "./server/admin/players";
import { createRelationAdminHandlers } from "./server/admin/relations";
import { Account, ClientContext, Session } from "./server/contracts";
import { normalizeGameState } from "./server/normalization";
import { createPublicApiHandlers } from "./server/publicApi";
import { createRealtimeController } from "./server/realtime";
import { handleApiRequest as routeApiRequest } from "./server/router";
import { createInitialDocumentSnapshot } from "./server/seed";
import { createSessionManager } from "./server/sessions";
import { parseClientMessage, send, writeJson } from "./server/transport";
import { buildStateForSession } from "./server/visibility";
import { DbAccount, DocumentDb } from "./storage/documentDb";
import { Action } from "./types";

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const db = new DocumentDb(createInitialDocumentSnapshot());
const persisted = db.getSnapshot();

const state = normalizeGameState(persisted.gameState);
const pendingActions = new Map<string, Action>();
const pendingAllianceProposals = new Set<string>();
const readyPlayers = new Set<string>();
const clients = new Map<WebSocket, ClientContext>();

const accounts = new Map<string, Account>();
for (const account of Object.values(persisted.accounts)) {
  accounts.set(account.username, { ...account });
}

if (!accounts.has("admin")) {
  accounts.set("admin", {
    username: "admin",
    password: "admin123",
    role: "admin",
    playerId: "p1",
  });
}

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
  });
}

persistDatabase();

const sessionManager = createSessionManager(SESSION_TTL_MS);

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

const realtime = createRealtimeController({
  state,
  pendingActions,
  pendingAllianceProposals,
  readyPlayers,
  clients,
  persistDatabase,
});

function broadcastState(): void {
  realtime.broadcastState();
}

function removeSessionsForPlayer(playerId: string): void {
  sessionManager.removeSessionsForPlayer(playerId);
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
};
const playerAdmin = createPlayerAdminHandlers(adminDeps);
const planetAdmin = createPlanetAdminHandlers(adminDeps);
const fleetAdmin = createFleetAdminHandlers(adminDeps);
const factionAdmin = createFactionAdminHandlers(adminDeps);
const relationAdmin = createRelationAdminHandlers(adminDeps);

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
};

const httpServer = createServer((req, res) => {
  void routeApiRequest(req, res, apiHandlers);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  const session = sessionManager.getSessionByToken(token);

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
  console.log(`[server] default admin: admin / admin123`);
  console.log(`[server] default player creds: p1/p1, p2/p2, p3/p3`);
});












