import { isResourceKey, type ResourceKey } from "../planetDomain";
import type { GameState, ResourceStore } from "../types";

function add(store: ResourceStore, key: ResourceKey, amount: number): void {
  const current = store[key] ?? 0;
  store[key] = Math.round((current + amount) * 100) / 100;
}

export function applyStationGeneration(state: GameState): void {
  for (const station of Object.values(state.stations)) {
    if (
      !station.capabilities.includes("RESOURCE_GENERATION")
      || !station.capabilities.includes("RAW_STOCK")
    ) continue;
    for (const [key, rawAmount] of Object.entries(station.resourceGeneration)) {
      if (!isResourceKey(key) || typeof rawAmount !== "number" || rawAmount <= 0) continue;
      add(station.rawStock, key, rawAmount);
    }
  }
}

// TODO(DEC-017): stored Planet/Station combat-power fields are deliberately
// not wired into combat until participation and targeting rules are decided.
