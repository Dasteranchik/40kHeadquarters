import type { DocumentSnapshot } from "./snapshot";

export class PersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

export class CorruptDatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CorruptDatabaseError";
  }
}

export interface GameRepository {
  getSnapshot(): DocumentSnapshot;
  replace(candidate: DocumentSnapshot): void;
}
