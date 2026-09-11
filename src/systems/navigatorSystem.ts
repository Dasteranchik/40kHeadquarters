import { hexDistance } from "../hex";
import type { ArtifactInstance, InventoryLocation } from "../itemDomain";
import type { GameState, HexCoord } from "../types";

export interface NavigatorVisionSource {
  position: HexCoord;
  range: number;
  recipients: number[];
}

export interface NavigatorArtifactConfiguration {
  navigatorRange: number;
  navigatorOriginPlayerId: number;
}

export function navigatorArtifactConfiguration(
  artifact: ArtifactInstance,
): NavigatorArtifactConfiguration | null {
  if (artifact.definitionCode !== "NAVIGATOR") return null;
  const range = artifact.configuration.navigatorRange;
  const origin = artifact.configuration.navigatorOriginPlayerId;
  if (
    typeof range !== "number" || !Number.isInteger(range) || range <= 0
    || typeof origin !== "number" || !Number.isInteger(origin) || origin <= 0
  ) {
    return null;
  }
  return { navigatorRange: range, navigatorOriginPlayerId: origin };
}

function locationPosition(state: GameState, location: InventoryLocation): HexCoord | null {
  switch (location.kind) {
    case "FLEET": return state.fleets[location.fleetId]?.position ?? null;
    case "PLANET_STORAGE":
    case "PLANET_SHOP": return state.planets[location.planetId]?.position ?? null;
    case "STATION_STORAGE":
    case "STATION_SHOP": return state.stations[location.stationId]?.position ?? null;
    case "SHIPWRECK": return state.shipwrecks[location.shipwreckId]?.position ?? null;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

function currentHolderPlayerId(state: GameState, location: InventoryLocation): number | null {
  switch (location.kind) {
    case "FLEET": return state.fleets[location.fleetId]?.ownerPlayerId ?? null;
    case "PLANET_STORAGE":
    case "STATION_STORAGE": return location.playerId;
    case "PLANET_SHOP":
    case "STATION_SHOP":
    case "SHIPWRECK": return null;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

export function collectNavigatorVisionSources(state: GameState): NavigatorVisionSource[] {
  const sources: NavigatorVisionSource[] = [];
  for (const fleet of Object.values(state.fleets)) {
    const player = state.players[fleet.ownerPlayerId];
    const faction = player ? state.factions[player.factionId] : undefined;
    if (!faction?.isNavigator || fleet.navigatorRange <= 0) continue;
    sources.push({
      position: { ...fleet.position },
      range: fleet.navigatorRange,
      recipients: [fleet.ownerPlayerId],
    });
  }
  for (const artifact of Object.values(state.artifacts)) {
    const configuration = navigatorArtifactConfiguration(artifact);
    if (!configuration || !state.players[configuration.navigatorOriginPlayerId]) continue;
    const position = locationPosition(state, artifact.owner);
    if (!position) continue;
    const currentHolder = currentHolderPlayerId(state, artifact.owner);
    sources.push({
      position: { ...position },
      range: configuration.navigatorRange,
      recipients: [...new Set([
        configuration.navigatorOriginPlayerId,
        ...(currentHolder && state.players[currentHolder] ? [currentHolder] : []),
      ])],
    });
  }
  return sources;
}

export function collectVisibleWarpTileKeysForPlayer(
  state: GameState,
  playerId: number,
): Set<string> {
  const visible = new Set<string>();
  for (const source of collectNavigatorVisionSources(state)) {
    if (!source.recipients.includes(playerId)) continue;
    for (const tile of state.map.tiles) {
      if (hexDistance(source.position, tile) <= source.range) {
        visible.add(`${tile.q},${tile.r}`);
      }
    }
  }
  return visible;
}
