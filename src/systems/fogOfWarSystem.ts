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

function hashToUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const normalized = (hash >>> 0) / 4294967295;
  return normalized;
}

function estimateStat(baseValue: number, spread: number, seed: string): number {
  const n = hashToUnitInterval(seed);
  const factor = 1 + (n * 2 - 1) * spread;
  const estimated = Math.round(baseValue * factor);
  return Math.max(0, estimated);
}

function planetSightRange(planet: Planet): number {
  return Math.max(0, Math.trunc(planet.overviewRange ?? planet.visionRange));
}

export function collectVisibleTileKeysForPlayer(
  state: GameState,
  player: Player,
): Set<string> {
  const visible = new Set<string>();

  for (const planet of Object.values(state.planets)) {
    const range = planetSightRange(planet);
    for (const tile of state.map.tiles) {
      if (hexDistance(planet.position, tile) <= range) {
        visible.add(coordKey(tile));
      }
    }
  }

  const fleets = Object.values(state.fleets).filter(
    (fleet) => fleet.ownerPlayerId === player.id,
  );

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
  playerId: string,
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

function visibleFleetForPlayer(
  viewerId: string,
  fleet: Fleet,
  turnNumber: number,
): VisibleFleet {
  if (fleet.ownerPlayerId === viewerId) {
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
    combatPower: estimateStat(
      fleet.combatPower,
      0.3,
      `${viewerId}:${fleet.id}:combat:${turnNumber}`,
    ),
    health: estimateStat(
      fleet.health,
      0.3,
      `${viewerId}:${fleet.id}:health:${turnNumber}`,
    ),
    influence: estimateStat(
      fleet.influence,
      0.3,
      `${viewerId}:${fleet.id}:influence:${turnNumber}`,
    ),
    confidence: "ESTIMATED",
  };
}

function collectVisiblePlanets(
  visibleTileKeys: Set<string>,
  planets: Record<string, Planet>,
): Planet[] {
  return Object.values(planets).filter((planet) =>
    visibleTileKeys.has(coordKey(planet.position)),
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

    const fleets = allFleets
      .filter((fleet) => visibleTileKeys.has(coordKey(fleet.position)))
      .map((fleet) => visibleFleetForPlayer(player.id, fleet, state.turnNumber));

    result[player.id] = {
      playerId: player.id,
      visibleTiles: [...visibleTileKeys].map(parseCoordKey),
      exploredTiles: player.exploredTiles,
      fleets,
      visiblePlanets: collectVisiblePlanets(visibleTileKeys, state.planets),
    };
  }

  return result;
}
