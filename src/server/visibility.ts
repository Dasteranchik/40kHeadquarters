import { collectVisibleTileKeysByPlayerId } from "../systems/fogOfWarSystem";
import { Fleet, GameState, TurnResolution } from "../types";
import { areMutualAllies } from "../utils/relations";
import { coordKey } from "../hex";
import { Session } from "./contracts";

function canSessionSeeFleetOwner(
  session: Session,
  state: GameState,
  ownerPlayerId: string,
): boolean {
  if (session.role === "admin") {
    return true;
  }

  const viewerId = session.playerId;
  if (!viewerId) {
    return false;
  }

  if (viewerId === ownerPlayerId) {
    return true;
  }

  return areMutualAllies(state.players, viewerId, ownerPlayerId);
}

function collectSpottingTilesForSession(session: Session, state: GameState): Set<string> {
  if (session.role === "admin") {
    return new Set<string>();
  }

  const viewerId = session.playerId;
  if (!viewerId) {
    return new Set<string>();
  }

  return collectVisibleTileKeysByPlayerId(state, viewerId);
}

function canSessionSeeFleet(
  session: Session,
  state: GameState,
  fleet: Fleet,
  spottingTiles: Set<string>,
): boolean {
  if (canSessionSeeFleetOwner(session, state, fleet.ownerPlayerId)) {
    return true;
  }

  return spottingTiles.has(coordKey(fleet.position));
}

function filterVisibilityForSession(
  session: Session,
  resolution: TurnResolution,
): TurnResolution["visibility"] {
  if (session.role === "admin") {
    return resolution.visibility;
  }

  const viewerId = session.playerId;
  if (!viewerId) {
    return {};
  }

  const visibleState = resolution.visibility[viewerId];
  if (!visibleState) {
    return {};
  }

  return {
    [viewerId]: visibleState,
  };
}

export function filterFleetsForSession(
  session: Session,
  state: GameState,
  fleets: Record<string, Fleet>,
): Record<string, Fleet> {
  const result: Record<string, Fleet> = {};
  const spottingTiles = collectSpottingTilesForSession(session, state);

  for (const [fleetId, fleet] of Object.entries(fleets)) {
    if (canSessionSeeFleet(session, state, fleet, spottingTiles)) {
      result[fleetId] = fleet;
    }
  }

  return result;
}

export function buildStateForSession(session: Session, state: GameState): GameState {
  return {
    ...state,
    fleets: filterFleetsForSession(session, state, state.fleets),
  };
}

export function buildResolutionForSession(
  session: Session,
  state: GameState,
  resolution: TurnResolution,
  ownerByFleetIdBeforeResolution: Map<string, string>,
): TurnResolution {
  if (session.role === "admin") {
    return resolution;
  }

  const viewerId = session.playerId;
  const spottingTiles = collectSpottingTilesForSession(session, state);
  const visibleFleetIds = new Set(
    (viewerId ? resolution.visibility[viewerId]?.fleets : undefined)?.map((fleet) => fleet.id) ??
      [],
  );

  const canSeeFleetId = (fleetId: string): boolean => {
    const fleetNow = state.fleets[fleetId];
    if (fleetNow && canSessionSeeFleet(session, state, fleetNow, spottingTiles)) {
      return true;
    }

    const ownerId = ownerByFleetIdBeforeResolution.get(fleetId);
    if (!ownerId) {
      return false;
    }

    if (canSessionSeeFleetOwner(session, state, ownerId)) {
      return true;
    }

    return visibleFleetIds.has(fleetId);
  };

  return {
    ...resolution,
    movement: {
      executed: resolution.movement.executed.filter((entry) =>
        canSeeFleetId(entry.fleetId),
      ),
    },
    combat: {
      damageEvents: resolution.combat.damageEvents.filter((event) =>
        canSeeFleetId(event.fleetId),
      ),
      destroyedFleetIds: resolution.combat.destroyedFleetIds.filter((fleetId) =>
        canSeeFleetId(fleetId),
      ),
    },
    visibility: filterVisibilityForSession(session, resolution),
  };
}