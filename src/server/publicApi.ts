import { IncomingMessage, ServerResponse } from "http";

import { GameState } from "../types";
import { verifyPassword, hashPassword, validatePasswordPolicy } from "../auth/password";
import { Account, ChangePasswordRequest, LoginRequest } from "./contracts";
import { SessionManager } from "./sessions";
import {
  clearSessionCookie,
  getSessionToken,
  readJsonBody,
  setSessionCookie,
  writeJson,
} from "./transport";
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
  handleChangePassword: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export function createPublicApiHandlers(deps: PublicApiDeps): PublicApiHandlers {
  async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<LoginRequest>(req);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      writeJson(res, 400, { error: "Invalid login payload" });
      return;
    }

    const account = deps.accounts.get(body.username);
    if (!account || !verifyPassword(body.password, account.passwordHash)) {
      writeJson(res, 401, { error: "Invalid credentials" });
      return;
    }

    const session = deps.sessionManager.createSession(account);
    const maxAgeSeconds = Math.max(
      1,
      Math.trunc((session.expiresAt - Date.now()) / 1000),
    );
    setSessionCookie(res, session.token, maxAgeSeconds);
    writeJson(res, 200, {
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
    const token = getSessionToken(req);
    if (token) {
      deps.sessionManager.deleteSession(token);
    }

    clearSessionCookie(res);
    writeJson(res, 200, { ok: true });
  }

  async function handleChangePassword(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const session = deps.sessionManager.requireSession(req, res);
    if (!session) return;
    const body = await readJsonBody<ChangePasswordRequest>(req);
    if (
      !body
      || typeof body.currentPassword !== "string"
      || typeof body.newPassword !== "string"
    ) {
      writeJson(res, 400, { error: "Invalid password change payload" });
      return;
    }
    const passwordError = validatePasswordPolicy(body.newPassword);
    if (passwordError) {
      writeJson(res, 400, { error: passwordError });
      return;
    }
    const account = deps.accounts.get(session.username);
    if (!account || !verifyPassword(body.currentPassword, account.passwordHash)) {
      writeJson(res, 401, { error: "Invalid credentials" });
      return;
    }

    account.passwordHash = hashPassword(body.newPassword);
    // The current authenticated session guarantees this also persists the
    // password change through the session manager's transactional callback.
    deps.sessionManager.removeSessionsForUsername(account.username);
    clearSessionCookie(res);
    writeJson(res, 200, { ok: true, sessionsRevoked: true });
  }

  return {
    handleLogin,
    handleMe,
    handleState,
    handleLogout,
    handleChangePassword,
  };
}
