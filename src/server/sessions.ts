import { randomUUID } from "crypto";
import { IncomingMessage, ServerResponse } from "http";

import { Account, Session } from "./contracts";
import { getSessionToken, writeJson } from "./transport";

export interface SessionManager {
  createSession: (account: Account) => Session;
  getSessionByToken: (token: string | null) => Session | null;
  getSessionFromRequest: (req: IncomingMessage) => Session | null;
  requireSession: (req: IncomingMessage, res: ServerResponse) => Session | null;
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Session | null;
  deleteSession: (token: string) => void;
  removeSessionsForPlayer: (playerId: number) => void;
  getSessions: () => Record<string, Session>;
}

export function createSessionManager(
  sessionTtlMs: number,
  initialSessions: Record<string, Session> = {},
  onChanged: () => void = () => {},
): SessionManager {
  const sessions = new Map<string, Session>();
  const now = Date.now();
  for (const [token, session] of Object.entries(initialSessions)) {
    if (
      session.token === token
      && typeof session.username === "string"
      && (session.role === "admin" || session.role === "player")
      && Number.isFinite(session.expiresAt)
      && session.expiresAt > now
    ) {
      sessions.set(token, { ...session });
    }
  }

  function createSession(account: Account): Session {
    const token = randomUUID();
    const session: Session = {
      token,
      username: account.username,
      role: account.role,
      playerId: account.playerId,
      expiresAt: Date.now() + sessionTtlMs,
    };

    sessions.set(token, session);
    onChanged();
    return session;
  }

  function getSessionByToken(token: string | null): Session | null {
    if (!token) {
      return null;
    }

    const session = sessions.get(token);
    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
      onChanged();
      return null;
    }

    return session;
  }

  function getSessionFromRequest(req: IncomingMessage): Session | null {
    return getSessionByToken(getSessionToken(req));
  }

  function requireSession(req: IncomingMessage, res: ServerResponse): Session | null {
    const session = getSessionFromRequest(req);
    if (!session) {
      writeJson(res, 401, { error: "Unauthorized" });
      return null;
    }

    return session;
  }

  function requireAdmin(req: IncomingMessage, res: ServerResponse): Session | null {
    const session = requireSession(req, res);
    if (!session) {
      return null;
    }

    if (session.role !== "admin") {
      writeJson(res, 403, { error: "Admin role required" });
      return null;
    }

    return session;
  }

  function deleteSession(token: string): void {
    if (sessions.delete(token)) {
      onChanged();
    }
  }

  function removeSessionsForPlayer(playerId: number): void {
    let changed = false;
    for (const [token, session] of sessions.entries()) {
      if (session.playerId === playerId) {
        sessions.delete(token);
        changed = true;
      }
    }
    if (changed) {
      onChanged();
    }
  }

  function getSessions(): Record<string, Session> {
    return Object.fromEntries(
      [...sessions.entries()].map(([token, session]) => [token, { ...session }]),
    );
  }

  return {
    createSession,
    getSessionByToken,
    getSessionFromRequest,
    requireSession,
    requireAdmin,
    deleteSession,
    removeSessionsForPlayer,
    getSessions,
  };
}
