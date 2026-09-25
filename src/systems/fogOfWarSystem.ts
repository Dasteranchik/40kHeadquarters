import { coordKey, hexDistance, parseCoordKey } from "../hex";
import {
  Fleet,
  GameState,
  HexCoord,
  Planet,
  Player,
  PlayerVisibleState,
  VisibleFleet,
} from "../types";
import { areMutualAllies } from "../utils/relations";
import { getDetectionRecord, hasDetectedObject } from "./detectionSystem";

function hashToUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const normalized = (hash >>> 0) / 4294967295;
  return normalized;
}

export function estimateDetectedStat(baseValue: number, spread: number, seed: string): number {
  const n = hashToUnitInterval(seed);
  const factor = 1 + (n * 2 - 1) * spread;
  const estimated = Math.round(baseValue * factor);
  return Math.max(0, estimated);
}

export function collectVisibleTileKeysForPlayer(
  state: GameState,
  player: Player,
): Set<string> {
  const visible = new Set<string>();

  const fleets = Object.values(state.fleets).filter((fleet) => {
    if (fleet.ownerPlayerId === player.id) {
      return true;
    }

    return (
      fleet.shareVisionWithAllies &&
      areMutualAllies(state.players, player.id, fleet.ownerPlayerId)
    );
  });

  for (const fleet of fleets) {
    for (const tile of state.map.tiles) {
      if (hexDistance(fleet.position, tile) <= fleet.visionRange) {
        visible.add(coordKey(tile));
      }
    }
  }

  return visible;
}

export function collectVisibleTileKeysByPlayerId(
  state: GameState,
  playerId: number,
): Set<string> {
  const player = state.players[playerId];
  if (!player) {
    return new Set<string>();
  }

  return collectVisibleTileKeysForPlayer(state, player);
}

function mergeExploration(player: Player, visible: Set<string>): HexCoord[] {
  const explored = new Set(player.exploredTiles.map(coordKey));
  for (const key of visible) {
    explored.add(key);
  }

  return [...explored].map(parseCoordKey);
}

export function visibleFleetForPlayer(
  viewerId: number,
  fleet: Fleet,
  turnNumber: number,
  confidence: "EXACT" | "ESTIMATED" = "ESTIMATED",
): VisibleFleet {
  if (fleet.ownerPlayerId === viewerId || confidence === "EXACT") {
    return {
      id: fleet.id,
      ownerPlayerId: fleet.ownerPlayerId,
      position: fleet.position,
      combatPower: fleet.combatPower,
      health: fleet.health,
      influence: fleet.influence,
      confidence: "EXACT",
    };
  }

  return {
    id: fleet.id,
    ownerPlayerId: fleet.ownerPlayerId,
    position: fleet.position,
    combatPower: estimateDetectedStat(
      fleet.combatPower,
      0.3,
      `${viewerId}:${fleet.id}:combat:${turnNumber}`,
    ),
    health: estimateDetectedStat(
      fleet.health,
      0.3,
      `${viewerId}:${fleet.id}:health:${turnNumber}`,
    ),
    influence: estimateDetectedStat(
      fleet.influence,
      0.3,
      `${viewerId}:${fleet.id}:influence:${turnNumber}`,
    ),
    confidence: "ESTIMATED",
  };
}

function collectVisiblePlanets(
  state: GameState,
  playerId: number,
  planets: Record<string, Planet>,
): Planet[] {
  return Object.values(planets).filter((planet) =>
    hasDetectedObject(state, playerId, "PLANET", planet.id),
  );
}

export function recalcVisibility(
  state: GameState,
): Record<string, PlayerVisibleState> {
  const result: Record<string, PlayerVisibleState> = {};
  const allFleets = Object.values(state.fleets);

  for (const player of Object.values(state.players)) {
    const visibleTileKeys = collectVisibleTileKeysForPlayer(state, player);
    player.exploredTiles = mergeExploration(player, visibleTileKeys);

    const playerDetections = state.detection.recordsByPlayerId[String(player.id)] ?? {};
    const fleets = allFleets
      .filter((fleet) =>
        fleet.ownerPlayerId === player.id || hasDetectedObject(state, player.id, "FLEET", fleet.id),
      )
      .map((fleet) => visibleFleetForPlayer(
        player.id,
        fleet,
        state.turnNumber,
        getDetectionRecord(state, player.id, "FLEET", fleet.id)?.confidence,
      ));

    result[player.id] = {
      playerId: player.id,
      visibleTiles: [...visibleTileKeys].map(parseCoordKey),
      exploredTiles: player.exploredTiles,
      fleets,
      visiblePlanets: collectVisiblePlanets(state, player.id, state.planets),
      visibleStations: Object.values(state.stations).filter((station) =>
        hasDetectedObject(state, player.id, "STATION", station.id),
      ),
      visibleShipwrecks: Object.values(state.shipwrecks).filter((shipwreck) =>
        hasDetectedObject(state, player.id, "SHIPWRECK", shipwreck.id),
      ),
      visibleAnomalies: Object.values(state.anomalies).filter((anomaly) =>
        hasDetectedObject(state, player.id, "ANOMALY", anomaly.id),
      ),
    };
  }

  return result;
}
