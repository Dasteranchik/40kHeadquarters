import { IncomingMessage, ServerResponse } from "http";

import { GameState } from "../types";
import { Account, LoginRequest } from "./contracts";
import { SessionManager } from "./sessions";
import { getBearerToken, readJsonBody, writeJson } from "./transport";
import { buildStateForSession } from "./visibility";

export interface PublicApiDeps {
  accounts: Map<string, Account>;
  state: GameState;
  sessionManager: SessionManager;
}

export interface PublicApiHandlers {
  handleLogin: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleMe: (req: IncomingMessage, res: ServerResponse) => void;
  handleState: (req: IncomingMessage, res: ServerResponse) => void;
  handleLogout: (req: IncomingMessage, res: ServerResponse) => void;
}

export function createPublicApiHandlers(deps: PublicApiDeps): PublicApiHandlers {
  async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<LoginRequest>(req);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      writeJson(res, 400, { error: "Invalid login payload" });
      return;
    }

    const account = deps.accounts.get(body.username);
    if (!account || account.password !== body.password) {
      writeJson(res, 401, { error: "Invalid credentials" });
      return;
    }

    const session = deps.sessionManager.createSession(account);
    writeJson(res, 200, {
      token: session.token,
      username: session.username,
      role: session.role,
      playerId: session.playerId,
      expiresAt: session.expiresAt,
    });
  }

  function handleMe(req: IncomingMessage, res: ServerResponse): void {
    const session = deps.sessionManager.requireSession(req, res);
    if (!session) {
      return;
    }

    writeJson(res, 200, {
      username: session.username,
      role: session.role,
      playerId: session.playerId,
      expiresAt: session.expiresAt,
    });
  }

  function handleState(req: IncomingMessage, res: ServerResponse): void {
    const session = deps.sessionManager.requireSession(req, res);
    if (!session) {
      return;
    }

    writeJson(res, 200, {
      state: buildStateForSession(session, deps.state),
    });
  }

  function handleLogout(req: IncomingMessage, res: ServerResponse): void {
    const token = getBearerToken(req);
    if (token) {
      deps.sessionManager.deleteSession(token);
    }

    writeJson(res, 200, { ok: true });
  }

  return {
    handleLogin,
    handleMe,
    handleState,
    handleLogout,
  };
}
