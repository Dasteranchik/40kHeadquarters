import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/auth/password";
import { createInitialDocumentSnapshot } from "../src/server/seed";
import { createStateTransactionManager } from "../src/server/stateTransaction";
import { DocumentDb, type AtomicFileWriter } from "../src/storage/documentDb";
import {
  CorruptDatabaseError,
  PersistenceError,
  type GameRepository,
} from "../src/storage/gameRepository";
import { migrateDocumentSnapshot } from "../src/storage/migrations";

function withTemporaryDatabase(run: (filePath: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "40khq-persistence-"));
  try {
    run(join(directory, "db.json"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("DocumentDb keeps the committed snapshot and file when atomic write fails", () => {
  withTemporaryDatabase((filePath) => {
    const seed = createInitialDocumentSnapshot();
    const initialDb = new DocumentDb(seed, filePath);
    const beforeFile = readFileSync(filePath, "utf8");
    const failingWriter: AtomicFileWriter = {
      write: () => {
        throw new Error("simulated disk failure");
      },
    };
    const db = new DocumentDb(seed, filePath, failingWriter);
    const candidate = db.getSnapshot();
    candidate.gameState.turnNumber += 1;

    assert.throws(() => db.replace(candidate), /simulated disk failure/);
    assert.deepEqual(db.getSnapshot(), initialDb.getSnapshot());
    assert.equal(readFileSync(filePath, "utf8"), beforeFile);
  });
});

test("DocumentDb reports corrupted JSON and never replaces it with seed", () => {
  withTemporaryDatabase((filePath) => {
    const corrupted = "{ definitely-not-json";
    writeFileSync(filePath, corrupted, "utf8");

    assert.throws(
      () => new DocumentDb(createInitialDocumentSnapshot(), filePath),
      CorruptDatabaseError,
    );
    assert.equal(readFileSync(filePath, "utf8"), corrupted);
  });
});

test("legacy plaintext accounts migrate through v1, v2 and v3 to scrypt", () => {
  const legacy = createInitialDocumentSnapshot() as unknown as Record<string, unknown>;
  delete legacy.schemaVersion;
  legacy.accounts = {
    admin: {
      username: "admin",
      password: "admin123",
      role: "admin",
    },
    commander: {
      username: "commander",
      password: "legacy-secret",
      role: "admin",
    },
  };

  const migrated = migrateDocumentSnapshot(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.accounts.admin, undefined);
  assert.equal("password" in migrated.accounts.commander, false);
  assert.equal(verifyPassword("legacy-secret", migrated.accounts.commander.passwordHash), true);
});

test("transaction manager restores all live state after repository failure", () => {
  const seed = createInitialDocumentSnapshot();
  seed.accounts.admin = {
    username: "admin",
    passwordHash: hashPassword("correct horse battery staple"),
    role: "admin",
  };
  const state = structuredClone(seed.gameState);
  const accounts = new Map(Object.entries(seed.accounts));
  const repository: GameRepository = {
    getSnapshot: () => structuredClone(seed),
    replace: () => {
      throw new PersistenceError("disk full");
    },
  };
  const manager = createStateTransactionManager({
    repository,
    state,
    accounts,
    turnSnapshots: [],
    pendingActions: new Map(),
    pendingAllianceProposals: new Set(),
    readyPlayers: new Set(),
    getSessions: () => ({}),
    restoreSessions: () => {},
  });

  const originalTurn = state.turnNumber;
  state.turnNumber += 10;
  accounts.delete("admin");
  assert.throws(() => manager.persistAndCommit(), PersistenceError);
  assert.equal(state.turnNumber, originalTurn);
  assert.equal(accounts.has("admin"), true);
});
