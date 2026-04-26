import type { ClientMessage, ServerMessage } from "../../../src/api/ws";
import type { FleetStance, GameState, HexCoord } from "../../../src/types";
import { SESSION_STORAGE_KEY, type SessionInfo } from "../session";

export interface NetworkRuntimeState {
  session: SessionInfo | null;
  socket: WebSocket | null;
  gameState: GameState | null;
  selectedFleetId: string | null;
  plannedPath: HexCoord[];
  reconnectTimer: number | null;
  pendingFleetStances: Record<string, FleetStance>;
}

export interface NetworkSessionDeps {
  runtime: NetworkRuntimeState;
  apiBase: string;
  wsBase: string;
  getLoginCredentials: () => { username: string; password: string };
  setStatus: (message: string) => void;
  appendEvent: (message: string) => void;
  refreshHud: () => void;
  renderScene: () => void;
  hideHexContextMenu: () => void;
  reconcilePendingFleetStances: (state: GameState) => void;
}

export interface NetworkSessionController {
  setSession: (session: SessionInfo | null) => void;
  apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  loadStateSnapshot: () => Promise<void>;
  login: () => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  sendMessage: (message: ClientMessage) => boolean;
  connectSocket: () => void;
}

export function createNetworkSessionController(
  deps: NetworkSessionDeps,
): NetworkSessionController {
  function setSession(session: SessionInfo | null): void {
    deps.runtime.session = session;
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      deps.runtime.pendingFleetStances = {};
    }

    deps.refreshHud();
  }

  function getAuthHeaders(): Record<string, string> {
    if (!deps.runtime.session) {
      return {
        "Content-Type": "application/json",
      };
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.runtime.session.token}`,
    };
  }

  async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${deps.apiBase}${path}`, {
      ...init,
      headers: {
        ...getAuthHeaders(),
        ...(init?.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
    }

    return body;
  }

  async function loadStateSnapshot(): Promise<void> {
    if (!deps.runtime.session) {
      return;
    }

    const payload = await apiRequest<{ state: GameState }>("/api/state", {
      method: "GET",
    });

    deps.runtime.gameState = payload.state;
    deps.reconcilePendingFleetStances(payload.state);
    deps.refreshHud();

    window.requestAnimationFrame(() => {
      deps.renderScene();
    });
  }

  function handleServerMessage(message: ServerMessage): void {
    if (message.type === "stateUpdate") {
      deps.runtime.gameState = message.state;
      deps.reconcilePendingFleetStances(message.state);
      deps.hideHexContextMenu();
      deps.refreshHud();
      deps.renderScene();
      return;
    }

    deps.appendEvent(
      `Turn ${message.changes.turnNumber} resolved: ${message.changes.validationErrors.length} validation error(s), ${message.changes.combat.destroyedFleetIds.length} destroyed`,
    );
  }

  function connectSocket(): void {
    const session = deps.runtime.session;
    if (!session) {
      return;
    }

    if (deps.runtime.reconnectTimer) {
      window.clearTimeout(deps.runtime.reconnectTimer);
      deps.runtime.reconnectTimer = null;
    }

    if (deps.runtime.socket && deps.runtime.socket.readyState === WebSocket.OPEN) {
      deps.runtime.socket.close();
    }

    const socket = new WebSocket(`${deps.wsBase}?token=${encodeURIComponent(session.token)}`);
    deps.runtime.socket = socket;

    socket.addEventListener("open", () => {
      deps.setStatus(`Connected to ${deps.wsBase}`);
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as ServerMessage;
        handleServerMessage(payload);
      } catch {
        deps.appendEvent("Received malformed message");
      }
    });

    socket.addEventListener("close", () => {
      if (!deps.runtime.session) {
        return;
      }
      deps.setStatus("Disconnected. Reconnecting...");
      deps.runtime.reconnectTimer = window.setTimeout(connectSocket, 1600);
    });

    socket.addEventListener("error", () => {
      deps.setStatus("Socket error. Reconnecting...");
      socket.close();
    });
  }

  async function login(): Promise<void> {
    const { username, password } = deps.getLoginCredentials();
    if (!username || !password) {
      deps.setStatus("Enter username and password");
      return;
    }

    try {
      const session = await apiRequest<SessionInfo>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      setSession(session);
      try {
        await loadStateSnapshot();
      } catch (error) {
        deps.appendEvent(`State snapshot failed: ${(error as Error).message}`);
      }
      connectSocket();
      deps.appendEvent(`Logged in as ${session.username}`);
    } catch (error) {
      deps.setStatus(`Login failed: ${(error as Error).message}`);
    }
  }

  async function restoreSession(): Promise<void> {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const session = JSON.parse(raw) as SessionInfo;
      deps.runtime.session = session;
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    try {
      const me = await apiRequest<Omit<SessionInfo, "token">>("/api/me", {
        method: "GET",
      });

      setSession({
        token: deps.runtime.session.token,
        username: me.username,
        role: me.role,
        playerId: me.playerId,
        expiresAt: me.expiresAt,
      });
      try {
        await loadStateSnapshot();
      } catch {
        // Defer to websocket stateUpdate if snapshot call fails.
      }
      connectSocket();
    } catch {
      setSession(null);
    }
  }

  async function logout(): Promise<void> {
    try {
      if (deps.runtime.session) {
        await apiRequest("/api/logout", {
          method: "POST",
        });
      }
    } catch {
      // Ignore logout transport issues.
    }

    if (deps.runtime.socket) {
      deps.runtime.socket.close();
    }

    deps.runtime.gameState = null;
    deps.runtime.selectedFleetId = null;
    deps.runtime.plannedPath = [];
    deps.runtime.pendingFleetStances = {};
    deps.hideHexContextMenu();
    setSession(null);
    deps.renderScene();
    deps.setStatus("Not authenticated");
  }

  function sendMessage(message: ClientMessage): boolean {
    const socket = deps.runtime.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      deps.setStatus("Socket is not connected");
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }

  return {
    setSession,
    apiRequest,
    loadStateSnapshot,
    login,
    restoreSession,
    logout,
    sendMessage,
    connectSocket,
  };
}
