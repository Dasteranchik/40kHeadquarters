import type { EntityId, Planet, ResourceStore } from "../types";

export function getPlayerProductStorage(
  planet: Planet,
  playerId: EntityId,
): ResourceStore {
  const key = String(playerId);
  const existing = planet.productStorageByPlayerId[key];
  if (existing) {
    return existing;
  }

  const created: ResourceStore = {};
  planet.productStorageByPlayerId[key] = created;
  return created;
}
