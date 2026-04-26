import {
  computePopulationProduction,
  isInfoCategory,
  isResourceKey,
  RAW_OUTPUTS_BY_WORLD_TYPE,
} from "../../planetDomain";
import { Account } from "../contracts";
import { HexCoord, IntelFragmentMap, Planet, ResourceStore, Tile, GameState } from "../../types";
import { isFiniteNumber } from "../../utils/validation";

export function getTileAt(state: GameState, coord: HexCoord): Tile | null {
  return state.map.tiles.find((tile) => tile.q === coord.q && tile.r === coord.r) ?? null;
}

export function parseResourceStore(value: unknown): ResourceStore | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: ResourceStore = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isResourceKey(key) || !isFiniteNumber(raw)) {
      return null;
    }

    const amount = Math.max(0, Math.trunc(raw));
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

export function parseIntelFragments(value: unknown): IntelFragmentMap | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: IntelFragmentMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isInfoCategory(key) || !isFiniteNumber(raw)) {
      return null;
    }

    const amount = Math.max(0, Math.trunc(raw));
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

export function computePlanetResourceProduction(planet: Planet): number {
  const outputs = RAW_OUTPUTS_BY_WORLD_TYPE[planet.worldType] ?? [];
  return computePopulationProduction(planet.population) * outputs.length;
}

export function setPlanetResourceProduction(planet: Planet): void {
  planet.resourceProduction = computePlanetResourceProduction(planet);
}

export function getDefaultFactionId(state: GameState): string | null {
  const factionIds = Object.keys(state.factions).sort((a, b) => a.localeCompare(b));
  return factionIds.length > 0 ? factionIds[0] : null;
}

export function findPlayerAccount(
  accounts: Map<string, Account>,
  playerId: string,
): [string, Account] | null {
  for (const entry of accounts.entries()) {
    const [, account] = entry;
    if (account.playerId === playerId && account.role === "player") {
      return entry;
    }
  }

  return null;
}

export function removeAccountsForPlayer(accounts: Map<string, Account>, playerId: string): void {
  for (const [username, account] of accounts.entries()) {
    if (account.playerId === playerId && account.role === "player") {
      accounts.delete(username);
    }
  }
}
