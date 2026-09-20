import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import * as path from "path";

import { CorruptDatabaseError, PersistenceError, type GameRepository } from "./gameRepository";
import {
  cloneSnapshot,
  type DocumentSnapshot,
} from "./snapshot";

export type {
  DbAccount,
  DbRole,
  DbSession,
  DocumentSnapshot,
  TurnSnapshot,
  TurnSnapshotPoint,
} from "./snapshot";

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "db.json");

export interface AtomicFileWriter {
  write(filePath: string, contents: string): void;
}

function ensureDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Boolean(
    candidate.gameState
    && typeof candidate.gameState === "object"
    && candidate.accounts
    && typeof candidate.accounts === "object"
  );
}

export const atomicFileWriter: AtomicFileWriter = {
  write(filePath: string, contents: string): void {
    ensureDirectory(filePath);
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    let fileDescriptor: number | null = null;
    try {
      fileDescriptor = openSync(temporaryPath, "wx", 0o600);
      writeFileSync(fileDescriptor, contents, "utf8");
      fsyncSync(fileDescriptor);
      closeSync(fileDescriptor);
      fileDescriptor = null;
      renameSync(temporaryPath, filePath);

      // Persist the renamed directory entry too. Windows may reject opening a
      // directory as a file descriptor; the data file is already fsynced there.
      try {
        const directoryDescriptor = openSync(path.dirname(filePath), "r");
        try {
          fsyncSync(directoryDescriptor);
        } finally {
          closeSync(directoryDescriptor);
        }
      } catch {
        // The required file fsync + atomic rename already succeeded. Directory
        // fsync is a best-effort durability enhancement on supporting systems.
      }
    } catch (error) {
      if (fileDescriptor !== null) {
        try {
          closeSync(fileDescriptor);
        } catch {
          // Preserve the original write failure.
        }
      }
      if (existsSync(temporaryPath)) {
        try {
          unlinkSync(temporaryPath);
        } catch {
          // Preserve the original write failure.
        }
      }
      throw new PersistenceError(`Could not atomically write ${filePath}`, { cause: error });
    }
  },
};

export class DocumentDb implements GameRepository {
  private readonly filePath: string;
  private readonly writer: AtomicFileWriter;
  private snapshot: DocumentSnapshot;

  constructor(
    seed: DocumentSnapshot,
    filePath: string = DEFAULT_DB_PATH,
    writer: AtomicFileWriter = atomicFileWriter,
  ) {
    this.filePath = filePath;
    this.writer = writer;
    this.snapshot = this.loadOrSeed(seed);
  }

  getSnapshot(): DocumentSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  replace(candidate: DocumentSnapshot): void {
    const isolatedCandidate = cloneSnapshot(candidate);
    this.writeSnapshot(isolatedCandidate);
    this.snapshot = isolatedCandidate;
  }

  private loadOrSeed(seed: DocumentSnapshot): DocumentSnapshot {
    ensureDirectory(this.filePath);
    if (!existsSync(this.filePath)) {
      const initial = cloneSnapshot(seed);
      this.writeSnapshot(initial);
      return initial;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
    } catch (error) {
      throw new CorruptDatabaseError(
        `Database ${this.filePath} contains invalid JSON; it was left unchanged`,
        { cause: error },
      );
    }
    if (!isDocumentSnapshot(parsed)) {
      throw new CorruptDatabaseError(
        `Database ${this.filePath} has an invalid snapshot shape; it was left unchanged`,
      );
    }
    return cloneSnapshot(parsed);
  }

  private writeSnapshot(snapshot: DocumentSnapshot): void {
    this.writer.write(this.filePath, JSON.stringify(snapshot, null, 2));
  }
}
