import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";

import { GameState } from "../types";

export type DbRole = "admin" | "player";

export interface DbAccount {
  username: string;
  password: string;
  role: DbRole;
  playerId?: string;
}

export interface DocumentSnapshot {
  gameState: GameState;
  accounts: Record<string, DbAccount>;
}

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "db.json");

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DocumentSnapshot>;
  return Boolean(candidate.gameState && candidate.accounts);
}

export class DocumentDb {
  private readonly filePath: string;
  private snapshot: DocumentSnapshot;

  constructor(seed: DocumentSnapshot, filePath: string = DEFAULT_DB_PATH) {
    this.filePath = filePath;
    this.snapshot = this.loadOrSeed(seed);
  }

  getSnapshot(): DocumentSnapshot {
    return deepClone(this.snapshot);
  }

  replace(snapshot: DocumentSnapshot): void {
    this.snapshot = deepClone(snapshot);
    this.writeSnapshot(this.snapshot);
  }

  private loadOrSeed(seed: DocumentSnapshot): DocumentSnapshot {
    ensureDirectory(this.filePath);

    if (!existsSync(this.filePath)) {
      const initial = deepClone(seed);
      this.writeSnapshot(initial);
      return initial;
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isDocumentSnapshot(parsed)) {
        return deepClone(parsed);
      }
    } catch {
      // fall through to seed replacement below
    }

    const fallback = deepClone(seed);
    this.writeSnapshot(fallback);
    return fallback;
  }

  private writeSnapshot(snapshot: DocumentSnapshot): void {
    ensureDirectory(this.filePath);
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf8");
  }
}