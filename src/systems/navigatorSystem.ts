import { hexDistance } from "../hex";
import type { ArtifactInstance, InventoryLocation } from "../itemDomain";
import type { WarpVisibility } from "../navigationDomain";
import type { GameState, HexCoord } from "../types";

export interface NavigatorVisionSource {
  position: HexCoord;
  range: Exclude<WarpVisibility, null>;
  recipients: number[];
}

function locationPosition(state: GameState, location: InventoryLocation): HexCoord | null {
  switch (location.kind) {
    case "FLEET": return state.fleets[location.fleetId]?.position ?? null;
    case "PLANET_STORAGE":
    case "PLANET_SHOP": return state.planets[location.planetId]?.position ?? null;
    case "STATION_STORAGE":
    case "STATION_SHOP": return state.stations[location.stationId]?.position ?? null;
    case "PLANET_SECRET": return state.planets[location.planetId]?.position ?? null;
    case "STATION_SECRET": return state.stations[location.stationId]?.position ?? null;
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
    case "PLANET_SECRET":
    case "STATION_SECRET":
    case "SHIPWRECK": return null;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

export function ownsNavigatorFleet(state: GameState, playerId: number): boolean {
  return Object.values(state.fleets).some(
    (fleet) => fleet.ownerPlayerId === playerId && fleet.isNavigator,
  );
}

export function ownsNavigatorItem(state: GameState, playerId: number): boolean {
  return Object.values(state.artifacts).some(
    (artifact) => artifact.isNavigator && currentHolderPlayerId(state, artifact.owner) === playerId,
  );
}

export function isEffectiveNavigator(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return Boolean(
    player
    && (player.manualNavigator || ownsNavigatorFleet(state, playerId) || ownsNavigatorItem(state, playerId)),
  );
}

function artifactWarpSource(
  state: GameState,
  artifact: ArtifactInstance,
): NavigatorVisionSource | null {
  if (artifact.warpVisibility === null) return null;
  const position = locationPosition(state, artifact.owner);
  if (!position) return null;
  const currentHolderId = currentHolderPlayerId(state, artifact.owner);
  const recipients = [...new Set([
    ...(artifact.navigatorOriginPlayerId && state.players[artifact.navigatorOriginPlayerId]
      ? [artifact.navigatorOriginPlayerId]
      : []),
    ...(currentHolderId && state.players[currentHolderId] ? [currentHolderId] : []),
  ])];
  if (recipients.length === 0) return null;
  return {
    position: { ...position },
    range: artifact.warpVisibility,
    recipients,
  };
}

export function collectNavigatorVisionSources(state: GameState): NavigatorVisionSource[] {
  const sources: NavigatorVisionSource[] = [];
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.warpVisibility === null) continue;
    const player = state.players[fleet.ownerPlayerId];
    const faction = player ? state.factions[player.factionId] : undefined;
    if (!fleet.isNavigator && !faction?.isChaos) continue;
    sources.push({
      position: { ...fleet.position },
      range: fleet.warpVisibility,
      recipients: [fleet.ownerPlayerId],
    });
  }
  for (const artifact of Object.values(state.artifacts)) {
    const source = artifactWarpSource(state, artifact);
    if (source) sources.push(source);
  }
  for (const station of Object.values(state.stations)) {
    if (station.ownerFactionId === null || station.warpVisibility === null) continue;
    const recipients = Object.values(state.players)
      .filter((player) => player.factionId === station.ownerFactionId)
      .map((player) => player.id);
    if (recipients.length === 0) continue;
    sources.push({
      position: { ...station.position },
      range: station.warpVisibility,
      recipients,
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
