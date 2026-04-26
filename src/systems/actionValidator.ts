import {
  areNeighbors,
  buildTileIndex,
  coordKey,
  isInsideMap,
  isTilePassable,
} from "../hex";
import {
  isInfoCategory,
  isProductResourceKey,
  isRawResourceKey,
  isResourceKey,
  isTitheLevel,
} from "../planetDomain";
import {
  Action,
  DiplomacyAction,
  GameState,
  HexCoord,
  MoveFleetAction,
  Planet,
  PlanetAction,
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

function playerHasFleetOnPlanet(
  state: GameState,
  playerId: string,
  planet: Planet,
): boolean {
  return Object.values(state.fleets).some(
    (fleet) =>
      fleet.ownerPlayerId === playerId &&
      fleet.position.q === planet.position.q &&
      fleet.position.r === planet.position.r,
  );
}

function validatePlanetAction(
  state: GameState,
  action: PlanetAction,
  moraleUsedByPlayer: Set<string>,
  manualProductionUsedByPlanet: Set<string>,
): ValidationError | null {
  const player = state.players[action.playerId];
  if (!player) {
    return { actionId: action.id, reason: "Player does not exist" };
  }

  const planet = state.planets[action.payload.planetId];
  if (!planet) {
    return { actionId: action.id, reason: "Planet does not exist" };
  }

  if (!playerHasFleetOnPlanet(state, action.playerId, planet)) {
    return {
      actionId: action.id,
      reason: "Player must have at least one fleet in planet hex",
    };
  }

  const kind = action.payload.kind;
  const needsActionFleet =
    kind === "TAKE_STOCK" ||
    kind === "RAID_STOCK" ||
    kind === "TAKE_FROM_STORAGE" ||
    kind === "DEPOSIT_TO_STORAGE";

  if (needsActionFleet) {
    const fleetId = action.payload.fleetId;
    if (!fleetId) {
      return { actionId: action.id, reason: "fleetId is required" };
    }

    const fleet = state.fleets[fleetId];
    if (!fleet || fleet.ownerPlayerId !== action.playerId) {
      return {
        actionId: action.id,
        reason: "fleetId not found or fleet does not belong to player",
      };
    }

    if (fleet.position.q !== planet.position.q || fleet.position.r !== planet.position.r) {
      return {
        actionId: action.id,
        reason: "fleet must be in the same hex as target planet",
      };
    }
  }

  const hasAmount =
    kind === "TAKE_STOCK" ||
    kind === "RAID_STOCK" ||
    kind === "TAKE_FROM_STORAGE" ||
    kind === "DEPOSIT_TO_STORAGE" ||
    kind === "CREATE_PRODUCT";

  if (hasAmount) {
    if (typeof action.payload.amount !== "number" || !Number.isFinite(action.payload.amount)) {
      return { actionId: action.id, reason: "amount must be a number" };
    }

    if (Math.trunc(action.payload.amount) <= 0) {
      return { actionId: action.id, reason: "amount must be positive" };
    }
  }

  if (
    kind === "TAKE_STOCK" ||
    kind === "RAID_STOCK" ||
    kind === "TAKE_FROM_STORAGE" ||
    kind === "DEPOSIT_TO_STORAGE"
  ) {
    if (!isResourceKey(action.payload.resourceKey)) {
      return { actionId: action.id, reason: "resourceKey is invalid" };
    }
  }

  if ((kind === "TAKE_STOCK" || kind === "RAID_STOCK") && !isRawResourceKey(action.payload.resourceKey)) {
    return {
      actionId: action.id,
      reason: "TAKE_STOCK/RAID_STOCK requires a raw resource key",
    };
  }

  if (kind === "CREATE_PRODUCT" && !isProductResourceKey(action.payload.productKey)) {
    return { actionId: action.id, reason: "productKey is invalid" };
  }

  if (
    kind === "INQUISITION_DEPLOY_INFORMANT" &&
    !isInfoCategory(action.payload.infoCategory)
  ) {
    return { actionId: action.id, reason: "infoCategory is invalid" };
  }

  if (kind === "ADMINISTRATUM_SET_TITHE" && !isTitheLevel(action.payload.titheLevel)) {
    return { actionId: action.id, reason: "titheLevel is invalid" };
  }

  if (kind === "ECCLESIARCHY_RAISE_MORALE") {
    if (moraleUsedByPlayer.has(action.playerId)) {
      return {
        actionId: action.id,
        reason: "Player can raise morale only once per turn",
      };
    }

    moraleUsedByPlayer.add(action.playerId);
  }

  if (kind === "PRODUCE_RESOURCE") {
    if (manualProductionUsedByPlanet.has(planet.id)) {
      return {
        actionId: action.id,
        reason: "Planet can use PRODUCE_RESOURCE only once per turn",
      };
    }

    manualProductionUsedByPlanet.add(planet.id);
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
  const planetActions: PlanetAction[] = [];
  const errors: ValidationError[] = [];

  const apUsedByFleet = new Map<string, number>();
  const projectedPositionByFleet = new Map<string, HexCoord>();
  const diplomacyPairSeen = new Set<string>();
  const moraleUsedByPlayer = new Set<string>();
  const manualProductionUsedByPlanet = new Set<string>();
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

    if (action.type === "SET_FLEET_STANCE") {
      const error = validateStanceAction(state, action);
      if (error) {
        errors.push(error);
        continue;
      }
      stanceActions.push(action);
      continue;
    }

    const error = validatePlanetAction(
      state,
      action,
      moraleUsedByPlayer,
      manualProductionUsedByPlanet,
    );
    if (error) {
      errors.push(error);
      continue;
    }

    planetActions.push(action);
  }

  return {
    moveActions,
    diplomacyActions,
    stanceActions,
    planetActions,
    errors,
  };
}
