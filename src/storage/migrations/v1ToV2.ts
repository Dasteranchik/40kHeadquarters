import { hashPassword, isPasswordHash } from "../../auth/password";

interface LegacyAccount {
  username?: unknown;
  password?: unknown;
  passwordHash?: unknown;
  role?: unknown;
  playerId?: unknown;
}

export interface SchemaV1Snapshot {
  schemaVersion?: 1;
  gameState: unknown;
  accounts: Record<string, LegacyAccount>;
  sessions?: unknown;
  turnSnapshots?: unknown;
}

export interface SchemaV2Snapshot {
  schemaVersion: 2;
  gameState: unknown;
  accounts: Record<string, {
    username: string;
    passwordHash: string;
    role: "admin" | "player";
    playerId?: number;
  }>;
  sessions?: unknown;
  turnSnapshots?: unknown;
}

export function migrateV1ToV2(snapshot: SchemaV1Snapshot): SchemaV2Snapshot {
  const accounts: SchemaV2Snapshot["accounts"] = {};
  for (const [key, rawAccount] of Object.entries(snapshot.accounts)) {
    if (!rawAccount || typeof rawAccount !== "object") {
      throw new Error(`Invalid legacy account ${key}`);
    }
    const username = typeof rawAccount.username === "string" ? rawAccount.username : key;
    const role = rawAccount.role;
    if (role !== "admin" && role !== "player") {
      throw new Error(`Invalid role for legacy account ${username}`);
    }
    // The historical seed credential is public knowledge. Never preserve it
    // as a valid administrator login during migration; bootstrap creates the
    // replacement from deployment configuration.
    if (username === "admin" && role === "admin" && rawAccount.password === "admin123") {
      continue;
    }
    const passwordHash = isPasswordHash(rawAccount.passwordHash)
      ? rawAccount.passwordHash
      : typeof rawAccount.password === "string"
        ? hashPassword(rawAccount.password)
        : null;
    if (!passwordHash) throw new Error(`Legacy account ${username} has no password`);

    accounts[username] = {
      username,
      passwordHash,
      role,
      ...(typeof rawAccount.playerId === "number" ? { playerId: rawAccount.playerId } : {}),
    };
  }

  return {
    schemaVersion: 2,
    gameState: snapshot.gameState,
    accounts,
    ...(snapshot.sessions === undefined ? {} : { sessions: snapshot.sessions }),
    ...(snapshot.turnSnapshots === undefined ? {} : { turnSnapshots: snapshot.turnSnapshots }),
  };
}
