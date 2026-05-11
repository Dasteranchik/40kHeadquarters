import { IncomingMessage, ServerResponse } from "http";
import { RawData, WebSocket } from "ws";

import { ClientMessage, ServerMessage } from "../api/ws";

const OPEN_SOCKET_STATE = 1;
export const SESSION_COOKIE_NAME = "hq_session";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function getRequestOrigin(res: ServerResponse): string | null {
  const request = (res as ServerResponse & { req?: IncomingMessage }).req;
  const origin = request?.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) {
    return null;
  }

  return origin;
}

export function setCorsHeaders(res: ServerResponse): void {
  const origin = getRequestOrigin(res);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }
}

export function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseClientMessage(data: RawData): ClientMessage | null {
  const raw = typeof data === "string" ? data : data.toString();

  try {
    const parsed = JSON.parse(raw) as { type?: string };
    if (!parsed || typeof parsed.type !== "string") {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

export function send(socket: WebSocket, payload: ServerMessage): void {
  if (socket.readyState !== OPEN_SOCKET_STATE) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

export function getBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

function parseCookies(req: IncomingMessage): Map<string, string> {
  const result = new Map<string, string>();
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return result;
  }

  for (const chunk of cookieHeader.split(";")) {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    try {
      result.set(key, decodeURIComponent(value));
    } catch {
      result.set(key, value);
    }
  }

  return result;
}

export function getCookie(req: IncomingMessage, name: string): string | null {
  return parseCookies(req).get(name) ?? null;
}

export function getSessionToken(req: IncomingMessage): string | null {
  return getBearerToken(req) ?? getCookie(req, SESSION_COOKIE_NAME);
}

export function setSessionCookie(
  res: ServerResponse,
  token: string,
  maxAgeSeconds: number,
): void {
  const maxAge = Math.max(1, Math.trunc(maxAgeSeconds));
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`,
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
  );
}
