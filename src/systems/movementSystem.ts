import { MovementExecution, MovementReport, MoveFleetAction, GameState } from "../types";

function orderedMoves(actions: MoveFleetAction[]): MoveFleetAction[] {
  return [...actions].sort((a, b) => a.id.localeCompare(b.id));
}

export function executeMovement(
  state: GameState,
  actions: MoveFleetAction[],
): MovementReport {
  const executed: MovementExecution[] = [];

  for (const action of orderedMoves(actions)) {
    const fleet = state.fleets[action.payload.fleetId];
    if (!fleet) {
      continue;
    }

    const from = { ...fleet.position };
    const pathLength = action.payload.path.length;

    if (pathLength > 0) {
      fleet.position = action.payload.path[pathLength - 1];
      fleet.actionPoints = Math.max(0, fleet.actionPoints - pathLength);
    }

    executed.push({
      actionId: action.id,
      fleetId: fleet.id,
      from,
      to: { ...fleet.position },
      spentAP: pathLength,
      remainingAP: fleet.actionPoints,
    });
  }

  return { executed };
}