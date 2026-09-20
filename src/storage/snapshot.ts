import type { GameState } from "../types";

export const CURRENT_SCHEMA_VERSION = 3 as const;

export type DbRole = "admin" | "player";

export interface DbAccount {
  username: string;
  passwordHash: string;
  role: DbRole;
  playerId?: number;
}

export interface DbSession {
  token: string;
  username: string;
  role: DbRole;
  playerId?: number;
  expiresAt: number;
}

export type TurnSnapshotPoint = "START" | "END";

export interface TurnSnapshot {
  id: string;
  turnNumber: number;
  point: TurnSnapshotPoint;
  timestamp: number;
  gameState: GameState;
}

export interface DocumentSnapshot {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  gameState: GameState;
  accounts: Record<string, DbAccount>;
  sessions?: Record<string, DbSession>;
  turnSnapshots?: TurnSnapshot[];
}

export function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}
