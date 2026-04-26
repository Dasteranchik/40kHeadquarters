import { randomUUID } from "crypto";
import { IncomingMessage, ServerResponse } from "http";

import { Account, Session } from "./contracts";
import { getBearerToken, writeJson } from "./transport";

export interface SessionManager {
  createSession: (account: Account) => Session;
  getSessionByToken: (token: string | null) => Session | null;
  getSessionFromRequest: (req: IncomingMessage) => Session | null;
  requireSession: (req: IncomingMessage, res: ServerResponse) => Session | null;
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Session | null;
  deleteSession: (token: string) => void;
  removeSessionsForPlayer: (playerId: string) => void;
}

export function createSessionManager(sessionTtlMs: number): SessionManager {
  const sessions = new Map<string, Session>();

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
      return null;
    }

    return session;
  }

  function getSessionFromRequest(req: IncomingMessage): Session | null {
    return getSessionByToken(getBearerToken(req));
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
    sessions.delete(token);
  }

  function removeSessionsForPlayer(playerId: string): void {
    for (const [token, session] of sessions.entries()) {
      if (session.playerId === playerId) {
        sessions.delete(token);
      }
    }
  }

  return {
    createSession,
    getSessionByToken,
    getSessionFromRequest,
    requireSession,
    requireAdmin,
    deleteSession,
    removeSessionsForPlayer,
  };
}
