import type { Fleet, FleetStance, GameState, HexCoord, Planet } from "../../../src/types";
import type { SessionInfo } from "../session";

type Nullable<T> = T | null;

export interface SelectorRuntimeState {
  session: SessionInfo | null;
  selectedFleetId: string | null;
  plannedPath: HexCoord[];
  pendingFleetStances: Record<string, FleetStance>;
}

export function activePlayerId(runtime: SelectorRuntimeState): string | null {
  if (!runtime.session) {
    return null;
  }
  return runtime.session.playerId ?? null;
}

export function isAdmin(runtime: SelectorRuntimeState): boolean {
  return runtime.session?.role === "admin";
}

export function getPlayerResources(
  state: GameState,
  playerId: string | null,
): number {
  if (!playerId) {
    return 0;
  }

  const player = state.players[playerId];
  return player ? player.resources : 0;
}

export function getSelectedFleet(
  runtime: SelectorRuntimeState,
  state: GameState,
): Nullable<Fleet> {
  if (!runtime.selectedFleetId) {
    return null;
  }

  const playerId = activePlayerId(runtime);
  const fleet = state.fleets[runtime.selectedFleetId];
  if (!fleet || !playerId || fleet.ownerPlayerId !== playerId) {
    runtime.selectedFleetId = null;
    runtime.plannedPath = [];
    return null;
  }

  return fleet;
}

export function getSelectedPlanet(
  state: GameState,
  selectedFleet: Nullable<Fleet>,
  getTile: (state: GameState, coord: HexCoord) => { planetId?: string } | null,
): Nullable<Planet> {
  if (!selectedFleet) {
    return null;
  }

  const tile = getTile(state, selectedFleet.position);
  if (!tile?.planetId) {
    return null;
  }

  return state.planets[tile.planetId] ?? null;
}

export function effectiveFleetStance(
  runtime: SelectorRuntimeState,
  fleet: Fleet,
): FleetStance {
  return runtime.pendingFleetStances[fleet.id] ?? fleet.stance;
}

export function reconcilePendingFleetStances(
  runtime: SelectorRuntimeState,
  state: GameState,
): void {
  const next: Record<string, FleetStance> = {};

  for (const [fleetId, stance] of Object.entries(runtime.pendingFleetStances)) {
    const fleet = state.fleets[fleetId];
    if (!fleet) {
      continue;
    }

    if (fleet.stance !== stance) {
      next[fleetId] = stance;
    }
  }

  runtime.pendingFleetStances = next;
}
