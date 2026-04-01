import { IncomingMessage, ServerResponse } from "http";
import { RawData, WebSocket } from "ws";

import { ClientMessage, ServerMessage } from "../api/ws";

const OPEN_SOCKET_STATE = 1;

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function setCorsHeaders(res: ServerResponse): void {
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