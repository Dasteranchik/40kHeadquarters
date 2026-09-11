import { buildTileIndex, coordKey } from "../hex";
import { MovementExecution, MovementReport, MoveFleetAction, GameState } from "../types";

function orderedMoves(actions: MoveFleetAction[]): MoveFleetAction[] {
  return [...actions].sort((a, b) => a.id.localeCompare(b.id));
}

export function executeMovement(
  state: GameState,
  actions: MoveFleetAction[],
  onFleetEnteredHex?: (fleetId: number) => void,
): MovementReport {
  const executed: MovementExecution[] = [];
  const tileIndex = buildTileIndex(state.map);

  for (const action of orderedMoves(actions)) {
    const fleet = state.fleets[action.payload.fleetId];
    if (!fleet) {
      continue;
    }

    const from = { ...fleet.position };
    let spentMovementPoints = 0;

    if (action.payload.path.length > 0) {
      for (const step of action.payload.path) {
        const cost = tileIndex.get(coordKey(step))?.warpDisturbanceLevel;
        if (!cost || fleet.movementPoints < cost) {
          break;
        }
        fleet.movementPoints -= cost;
        spentMovementPoints += cost;
        fleet.position = { q: step.q, r: step.r };
        for (const army of Object.values(state.fleets)) {
          if (army.domain === "GROUND" && army.carrierFleetId === fleet.id) {
            army.position = { ...fleet.position };
          }
        }
        onFleetEnteredHex?.(fleet.id);
      }
    }

    executed.push({
      actionId: action.id,
      fleetId: fleet.id,
      from,
      to: { ...fleet.position },
      spentAP: spentMovementPoints,
      remainingAP: fleet.movementPoints,
    });
  }

  return { executed };
}
