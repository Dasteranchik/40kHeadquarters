import { PlanningSnapshot } from "../api/ws";
import { collectVisibleTileKeysByPlayerId } from "../systems/fogOfWarSystem";
import { estimateDetectedStat } from "../systems/fogOfWarSystem";
import { validateActions } from "../systems/actionValidator";
import { Action, Fleet, GameState, HexCoord, Planet, TurnResolution } from "../types";
import { coordKey } from "../hex";
import { Session } from "./contracts";
import { createEmptyItemInventory } from "../itemDomain";
import { collectVisibleWarpTileKeysForPlayer } from "../systems/navigatorSystem";
import type { Station } from "../worldObjectDomain";

function canSessionSeeFleetOwner(
  session: Session,
  _state: GameState,
  ownerPlayerId: number,
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

  return false;
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
  _spottingTiles: Set<string>,
): boolean {
  if (canSessionSeeFleetOwner(session, state, fleet.ownerPlayerId)) {
    return true;
  }

  const viewerId = session.playerId;
  return Boolean(viewerId && state.detection.recordsByPlayerId[String(viewerId)]?.[`FLEET:${fleet.id}`]);
}

function planetForPlayer(planet: Planet, playerId: number): Planet {
  const ownStorage = planet.productStorageByPlayerId[String(playerId)];
  const ownItems = planet.itemStorageByPlayerId[String(playerId)];
  return {
    ...planet,
    productStorageByPlayerId: ownStorage
      ? { [String(playerId)]: { ...ownStorage } }
      : {},
    itemStorageByPlayerId: ownItems
      ? { [String(playerId)]: { ...ownItems } }
      : {},
  };
}

function stationForPlayer(station: Station, playerId: number): Station {
  const ownStorage = station.productStorageByPlayerId[String(playerId)];
  const ownItems = station.itemStorageByPlayerId[String(playerId)];
  return {
    ...station,
    productStorageByPlayerId: ownStorage ? { [String(playerId)]: { ...ownStorage } } : {},
    itemStorageByPlayerId: ownItems ? { [String(playerId)]: { ...ownItems } } : {},
  };
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
    [viewerId]: {
      ...visibleState,
      visiblePlanets: visibleState.visiblePlanets.map((planet) =>
        planetForPlayer(planet, viewerId),
      ),
      visibleStations: visibleState.visibleStations.map((station) =>
        stationForPlayer(station, viewerId),
      ),
    },
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
      if (session.role === "admin" || fleet.ownerPlayerId === session.playerId) {
        result[fleetId] = { ...fleet, confidence: "EXACT" };
        continue;
      }
      const viewerId = session.playerId;
      if (!viewerId) continue;
      const confidence = state.detection.recordsByPlayerId[String(viewerId)]?.[
        `FLEET:${fleet.id}`
      ]?.confidence ?? "ESTIMATED";
      const exact = confidence === "EXACT";
      result[fleetId] = {
        ...fleet,
        combatPower: exact ? fleet.combatPower : estimateDetectedStat(
          fleet.combatPower, 0.3, `${viewerId}:${fleet.id}:combat:${state.turnNumber}`,
        ),
        health: exact ? fleet.health : estimateDetectedStat(
          fleet.health, 0.3, `${viewerId}:${fleet.id}:health:${state.turnNumber}`,
        ),
        influence: exact ? fleet.influence : estimateDetectedStat(
          fleet.influence, 0.3, `${viewerId}:${fleet.id}:influence:${state.turnNumber}`,
        ),
        movementPoints: 0,
        maxMovementPoints: 0,
        navigatorRange: 0,
        visionRange: 0,
        shareVisionWithAllies: false,
        capacity: 0,
        inventory: {},
        itemInventory: createEmptyItemInventory(),
        confidence,
      };
    }
  }

  return result;
}

export function buildStateForSession(session: Session, state: GameState): GameState {
  const pendingArmyTransportRequests = session.role === "admin"
    ? state.pendingArmyTransportRequests
    : state.pendingArmyTransportRequests.filter((request) => {
        const army = state.fleets[request.armyId];
        const fleet = state.fleets[request.fleetId];
        return Boolean(session.playerId && (army?.ownerPlayerId === session.playerId || fleet?.ownerPlayerId === session.playerId));
      });
  if (session.role === "admin") {
    return { ...state, pendingArmyTransportRequests };
  }
  const playerId = session.playerId;
  const detections = playerId
    ? state.detection.recordsByPlayerId[String(playerId)] ?? {}
    : {};
  const visibleWarpTiles = playerId
    ? collectVisibleWarpTileKeysForPlayer(state, playerId)
    : new Set<string>();
  const visiblePlanets = Object.fromEntries(
    Object.entries(state.planets)
      .filter(([, planet]) => Boolean(detections[`PLANET:${planet.id}`]))
      .map(([planetId, planet]) => [planetId, planetForPlayer(planet, playerId!)]),
  );
  const visibleStations = Object.fromEntries(
    Object.entries(state.stations)
      .filter(([, station]) => Boolean(detections[`STATION:${station.id}`]))
      .map(([stationId, station]) => [stationId, stationForPlayer(station, playerId!)]),
  );
  const visibleShipwrecks = Object.fromEntries(
    Object.entries(state.shipwrecks).filter(([, shipwreck]) =>
      Boolean(detections[`SHIPWRECK:${shipwreck.id}`]),
    ),
  );
  const visibleAnomalies = Object.fromEntries(
    Object.entries(state.anomalies)
      .filter(([, anomaly]) => Boolean(detections[`ANOMALY:${anomaly.id}`]))
      .map(([id, anomaly]) => [id, { ...anomaly, informationRef: "" }]),
  );
  const visibleArtifactIds = new Set<string>();
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.ownerPlayerId === playerId) fleet.itemInventory.artifactIds.forEach((id) => visibleArtifactIds.add(id));
  }
  for (const planet of Object.values(visiblePlanets)) {
    planet.shop.items.artifactIds.forEach((id) => visibleArtifactIds.add(id));
    Object.values(planet.itemStorageByPlayerId).forEach((items) =>
      items.artifactIds.forEach((id) => visibleArtifactIds.add(id)),
    );
  }
  for (const station of Object.values(visibleStations)) {
    station.shop.items.artifactIds.forEach((id) => visibleArtifactIds.add(id));
    Object.values(station.itemStorageByPlayerId).forEach((items) =>
      items.artifactIds.forEach((id) => visibleArtifactIds.add(id)),
    );
  }
  for (const shipwreck of Object.values(visibleShipwrecks)) {
    shipwreck.inventory.artifactIds.forEach((id) => visibleArtifactIds.add(id));
  }
  const { audit: _audit, processedCommands: _processedCommands, ...safeState } = state;
  return {
    ...safeState,
    map: {
      ...state.map,
      tiles: state.map.tiles.map((tile) => {
        const canSeePlanet = tile.planetId === undefined || visiblePlanets[String(tile.planetId)];
        const canSeeWarp = visibleWarpTiles.has(coordKey(tile));
        if (canSeePlanet && canSeeWarp) return tile;
        const {
          planetId: _planetId,
          warpDisturbanceLevel: _warpDisturbanceLevel,
          ...safeTile
        } = tile;
        if (canSeePlanet && !canSeeWarp) return safeTile;
        if (!canSeePlanet && canSeeWarp) {
          return { ...safeTile, warpDisturbanceLevel: tile.warpDisturbanceLevel };
        }
        return safeTile;
      }),
    },
    planets: visiblePlanets,
    stations: visibleStations,
    shipwrecks: visibleShipwrecks,
    anomalies: visibleAnomalies,
    artifacts: Object.fromEntries(
      Object.entries(state.artifacts).filter(([artifactId]) => visibleArtifactIds.has(artifactId)),
    ),
    fleets: filterFleetsForSession(session, state, state.fleets),
    events: state.events.filter((event) =>
      Boolean(playerId && event.playerIds.includes(playerId)),
    ),
    detection: { recordsByPlayerId: playerId ? { [String(playerId)]: detections } : {} },
    pendingArmyTransportRequests,
  } as GameState;
}

function buildPlanningSnapshot(state: GameState, actions: Iterable<Action>): PlanningSnapshot {
  const validated = validateActions(state, [...actions]);
  const plannedPathByFleetId = new Map<
    number,
    { ownerPlayerId: number; path: HexCoord[] }
  >();

  for (const action of validated.moveActions) {
    const fleet = state.fleets[action.payload.fleetId];
    if (!fleet) {
      continue;
    }

    const current = plannedPathByFleetId.get(fleet.id);
    if (!current) {
      plannedPathByFleetId.set(fleet.id, {
        ownerPlayerId: fleet.ownerPlayerId,
        path: [...action.payload.path],
      });
      continue;
    }

    current.path.push(...action.payload.path);
  }

  return {
    movePreviews: [...plannedPathByFleetId.entries()]
      .filter(([, value]) => value.path.length > 0)
      .sort(([a], [b]) => a - b)
      .map(([fleetId, value]) => ({
        fleetId,
        ownerPlayerId: value.ownerPlayerId,
        path: value.path.map((coord) => ({ ...coord })),
        projectedPosition: { ...value.path[value.path.length - 1] },
      })),
  };
}

export function buildPlanningForSession(
  session: Session,
  state: GameState,
  actions: Iterable<Action>,
): PlanningSnapshot {
  const fullSnapshot = buildPlanningSnapshot(state, actions);
  if (session.role === "admin") {
    return fullSnapshot;
  }

  const playerId = session.playerId;
  if (!playerId) {
    return { movePreviews: [] };
  }

  return {
    movePreviews: fullSnapshot.movePreviews.filter(
      (preview) => preview.ownerPlayerId === playerId,
    ),
  };
}

export function buildResolutionForSession(
  session: Session,
  state: GameState,
  resolution: TurnResolution,
  ownerByFleetIdBeforeResolution: Map<number, number>,
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

  const canSeeFleetId = (fleetId: number): boolean => {
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
      createdShipwreckIds: resolution.combat.createdShipwreckIds.filter((shipwreckId) =>
        Boolean(viewerId && state.detection.recordsByPlayerId[String(viewerId)]?.[`SHIPWRECK:${shipwreckId}`]),
      ),
    },
    detection: resolution.detection.filter((entry) => entry.playerId === viewerId),
    visibility: filterVisibilityForSession(session, resolution),
  };
}
