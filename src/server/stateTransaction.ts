import type { Action, GameState } from "../types";
import type { GameRepository } from "../storage/gameRepository";
import {
  CURRENT_SCHEMA_VERSION,
  type DbAccount,
  type DbSession,
  type DocumentSnapshot,
  type TurnSnapshot,
} from "../storage/snapshot";
import type { Account } from "./contracts";
import { validateDocumentSnapshot } from "./stateValidation";

interface StateTransactionDeps {
  repository: GameRepository;
  state: GameState;
  accounts: Map<string, Account>;
  turnSnapshots: TurnSnapshot[];
  pendingActions: Map<string, Action>;
  pendingAllianceProposals: Set<string>;
  readyPlayers: Set<number>;
  getSessions: () => Record<string, DbSession>;
  restoreSessions: (sessions: Record<string, DbSession>) => void;
  onPersistenceFailure?: (error: unknown) => void;
}

interface CommittedRuntime {
  snapshot: DocumentSnapshot;
  pendingActions: Map<string, Action>;
  pendingAllianceProposals: Set<string>;
  readyPlayers: Set<number>;
}

function replaceObject<T extends object>(target: T, source: T): void {
  for (const key of Object.keys(target) as Array<keyof T>) delete target[key];
  Object.assign(target, structuredClone(source));
}

function buildSnapshot(deps: StateTransactionDeps): DocumentSnapshot {
  const storedAccounts: Record<string, DbAccount> = {};
  for (const [username, account] of deps.accounts.entries()) {
    storedAccounts[username] = { ...account };
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameState: structuredClone(deps.state),
    accounts: storedAccounts,
    sessions: deps.getSessions(),
    turnSnapshots: structuredClone(deps.turnSnapshots),
  };
}

function captureRuntime(deps: StateTransactionDeps): CommittedRuntime {
  return {
    snapshot: buildSnapshot(deps),
    pendingActions: structuredClone(deps.pendingActions),
    pendingAllianceProposals: structuredClone(deps.pendingAllianceProposals),
    readyPlayers: structuredClone(deps.readyPlayers),
  };
}

function restoreMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source.entries()) target.set(key, structuredClone(value));
}

function restoreSet<T>(target: Set<T>, source: Set<T>): void {
  target.clear();
  for (const value of source) target.add(value);
}

export interface StateTransactionManager {
  persistAndCommit: () => void;
  resetCommittedBaseline: () => void;
}

export function createStateTransactionManager(
  deps: StateTransactionDeps,
): StateTransactionManager {
  let committed = captureRuntime(deps);

  function restoreCommittedRuntime(): void {
    replaceObject(deps.state, committed.snapshot.gameState);
    deps.accounts.clear();
    for (const [username, account] of Object.entries(committed.snapshot.accounts)) {
      deps.accounts.set(username, structuredClone(account));
    }
    deps.turnSnapshots.splice(
      0,
      deps.turnSnapshots.length,
      ...structuredClone(committed.snapshot.turnSnapshots ?? []),
    );
    deps.restoreSessions(structuredClone(committed.snapshot.sessions ?? {}));
    restoreMap(deps.pendingActions, committed.pendingActions);
    restoreSet(deps.pendingAllianceProposals, committed.pendingAllianceProposals);
    restoreSet(deps.readyPlayers, committed.readyPlayers);
  }

  function persistAndCommit(): void {
    const candidate = captureRuntime(deps);
    try {
      validateDocumentSnapshot(candidate.snapshot);
      deps.repository.replace(candidate.snapshot);
      committed = candidate;
    } catch (error) {
      restoreCommittedRuntime();
      if (error instanceof Error && error.name !== "StateValidationError") {
        deps.onPersistenceFailure?.(error);
      }
      throw error;
    }
  }

  return {
    persistAndCommit,
    resetCommittedBaseline: () => {
      committed = captureRuntime(deps);
    },
  };
}
