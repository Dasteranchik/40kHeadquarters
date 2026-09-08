import type { TurnSnapshot, TurnSnapshotPoint } from "../storage/documentDb";
import type { GameState } from "../types";
import { normalizeGameState } from "../server/normalization";

export const MAX_TURN_SNAPSHOTS = 100;

export function captureTurnSnapshotEntry(
  history: TurnSnapshot[],
  state: GameState,
  point: TurnSnapshotPoint,
  turnNumber: number,
  timestamp = Date.now(),
): TurnSnapshot {
  const entry: TurnSnapshot = {
    id: `${turnNumber}-${point.toLowerCase()}-${timestamp}`,
    turnNumber,
    point,
    timestamp,
    gameState: structuredClone(state),
  };
  history.push(entry);
  history.splice(0, Math.max(0, history.length - MAX_TURN_SNAPSHOTS));
  return entry;
}

export function restorePlanningTurnSnapshot(
  target: GameState,
  snapshot: TurnSnapshot,
): boolean {
  if (snapshot.gameState.phase !== "PLANNING") return false;
  // Audit and processed-command history are technical safety journals rather
  // than rollbackable gameplay state. Rewinding either would erase the audit
  // trail and allow delayed retries to mutate the restored branch again.
  const audit = structuredClone(target.audit);
  const processedCommands = structuredClone(target.processedCommands);
  const nextAuditId = target.nextIds.audit;
  const restored = normalizeGameState(structuredClone(snapshot.gameState));
  restored.audit = audit;
  restored.processedCommands = processedCommands;
  restored.nextIds.audit = Math.max(nextAuditId, restored.nextIds.audit);
  for (const key of Object.keys(target) as Array<keyof GameState>) {
    delete (target as Partial<GameState>)[key];
  }
  Object.assign(target, restored);
  return true;
}
