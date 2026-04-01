import {
  areNeighbors,
  buildTileIndex,
  coordKey,
  isInsideMap,
  isTilePassable,
} from "../hex";
import {
  Action,
  DiplomacyAction,
  GameState,
  HexCoord,
  MoveFleetAction,
  SetFleetStanceAction,
  Tile,
  ValidatedTurnActions,
  ValidationError,
} from "../types";

function sortedActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => a.id.localeCompare(b.id));
}

function validateMoveAction(
  state: GameState,
  action: MoveFleetAction,
  apUsedByFleet: Map<string, number>,
  projectedPositionByFleet: Map<string, HexCoord>,
  tileIndex: Map<string, Tile>,
): ValidationError | null {
  const fleet = state.fleets[action.payload.fleetId];
  if (!fleet) {
    return { actionId: action.id, reason: "Fleet does not exist" };
  }

  if (fleet.ownerPlayerId !== action.playerId) {
    return { actionId: action.id, reason: "Fleet does not belong to player" };
  }

  const pathLength = action.payload.path.length;
  const alreadyUsed = apUsedByFleet.get(fleet.id) ?? 0;
  if (alreadyUsed + pathLength > fleet.actionPoints) {
    return {
      actionId: action.id,
      reason: "Total path length for fleet exceeds action points",
    };
  }

  let prev = projectedPositionByFleet.get(fleet.id) ?? fleet.position;
  for (const step of action.payload.path) {
    if (!isInsideMap(step, state.map)) {
      return { actionId: action.id, reason: "Step is outside map bounds" };
    }

    const tile = tileIndex.get(coordKey(step));
    if (!tile) {
      return { actionId: action.id, reason: "Tile does not exist" };
    }

    if (!isTilePassable(tile)) {
      return { actionId: action.id, reason: "Path crosses an obstacle tile" };
    }

    if (!areNeighbors(prev, step)) {
      return { actionId: action.id, reason: "Each path step must be adjacent" };
    }

    prev = step;
  }

  apUsedByFleet.set(fleet.id, alreadyUsed + pathLength);
  projectedPositionByFleet.set(fleet.id, prev);
  return null;
}

function validateDiplomacyAction(
  state: GameState,
  action: DiplomacyAction,
  byPair: Set<string>,
): ValidationError | null {
  const { targetPlayerId } = action.payload;

  if (!state.players[action.playerId]) {
    return { actionId: action.id, reason: "Player does not exist" };
  }

  if (!state.players[targetPlayerId]) {
    return { actionId: action.id, reason: "Target player does not exist" };
  }

  if (targetPlayerId === action.playerId) {
    return { actionId: action.id, reason: "Cannot target self in diplomacy" };
  }

  const pairKey = `${action.playerId}:${targetPlayerId}`;
  if (byPair.has(pairKey)) {
    return {
      actionId: action.id,
      reason: "Only one diplomacy action per (player,target) pair per turn",
    };
  }

  byPair.add(pairKey);
  return null;
}

function validateStanceAction(
  state: GameState,
  action: SetFleetStanceAction,
): ValidationError | null {
  const fleet = state.fleets[action.payload.fleetId];
  if (!fleet) {
    return { actionId: action.id, reason: "Fleet does not exist" };
  }

  if (fleet.ownerPlayerId !== action.playerId) {
    return { actionId: action.id, reason: "Fleet does not belong to player" };
  }

  if (action.payload.stance !== "ATTACK" && action.payload.stance !== "DEFENSE") {
    return { actionId: action.id, reason: "Fleet stance must be ATTACK or DEFENSE" };
  }

  return null;
}

export function validateActions(
  state: GameState,
  actions: Action[],
): ValidatedTurnActions {
  const moveActions: MoveFleetAction[] = [];
  const diplomacyActions: DiplomacyAction[] = [];
  const stanceActions: SetFleetStanceAction[] = [];
  const errors: ValidationError[] = [];

  const apUsedByFleet = new Map<string, number>();
  const projectedPositionByFleet = new Map<string, HexCoord>();
  const diplomacyPairSeen = new Set<string>();
  const tileIndex = buildTileIndex(state.map);

  for (const action of sortedActions(actions)) {
    if (action.type === "MOVE_FLEET") {
      const error = validateMoveAction(
        state,
        action,
        apUsedByFleet,
        projectedPositionByFleet,
        tileIndex,
      );
      if (error) {
        errors.push(error);
        continue;
      }
      moveActions.push(action);
      continue;
    }

    if (action.type === "DIPLOMACY") {
      const error = validateDiplomacyAction(state, action, diplomacyPairSeen);
      if (error) {
        errors.push(error);
        continue;
      }
      diplomacyActions.push(action);
      continue;
    }

    const error = validateStanceAction(state, action);
    if (error) {
      errors.push(error);
      continue;
    }
    stanceActions.push(action);
  }

  return {
    moveActions,
    diplomacyActions,
    stanceActions,
    errors,
  };
}