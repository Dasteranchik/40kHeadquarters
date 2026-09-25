import {
  createEmptyItemInventory,
  inventoryLocationKey,
  type InventoryLocation,
  type ItemInventory,
  type KnowledgeCode,
} from "../itemDomain";
import type { GameState } from "../types";
import { secretStorageAllowsArtifact, secretStorageAllowsKnowledge } from "../secretStorageDomain";

export interface ItemActor {
  role: "admin" | "player";
  playerId?: number;
}

export interface ItemOperationResult {
  ok: boolean;
  changed: boolean;
  message: string;
}

export function resolveItemInventory(
  state: GameState,
  location: InventoryLocation,
  create = false,
): ItemInventory | null {
  switch (location.kind) {
    case "FLEET":
      return state.fleets[location.fleetId]?.itemInventory ?? null;
    case "PLANET_STORAGE": {
      const planet = state.planets[location.planetId];
      if (!planet || !state.players[location.playerId]) return null;
      const existing = planet.itemStorageByPlayerId[String(location.playerId)];
      if (existing || !create) return existing ?? null;
      return planet.itemStorageByPlayerId[String(location.playerId)] = createEmptyItemInventory();
    }
    case "PLANET_SHOP":
      return state.planets[location.planetId]?.shop.items ?? null;
    case "STATION_STORAGE": {
      const station = state.stations[location.stationId];
      if (!station?.capabilities.includes("PLAYER_STORAGE") || !state.players[location.playerId]) {
        return null;
      }
      const existing = station.itemStorageByPlayerId[String(location.playerId)];
      if (existing || !create) return existing ?? null;
      return station.itemStorageByPlayerId[String(location.playerId)] = createEmptyItemInventory();
    }
    case "STATION_SHOP": {
      const station = state.stations[location.stationId];
      return station?.capabilities.includes("SHOP") ? station.shop.items : null;
    }
    case "PLANET_SECRET":
      return state.planets[location.planetId]?.secretStorage?.itemInventory ?? null;
    case "STATION_SECRET":
      return state.stations[location.stationId]?.secretStorage?.itemInventory ?? null;
    case "SHIPWRECK":
      return state.shipwrecks[location.shipwreckId]?.inventory ?? null;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

export function actorCanAccessItemLocation(
  state: GameState,
  actor: ItemActor,
  location: InventoryLocation,
): boolean {
  if (actor.role === "admin") return true;
  if (!actor.playerId) return false;
  switch (location.kind) {
    case "FLEET":
      return state.fleets[location.fleetId]?.ownerPlayerId === actor.playerId;
    case "PLANET_STORAGE":
    case "STATION_STORAGE":
      return location.playerId === actor.playerId;
    case "PLANET_SHOP":
    case "STATION_SHOP":
    // TODO(SECRET-STORAGE-TRANSFER): password authentication reveals storage
    // contents only. Physical player transfers remain disabled until their
    // range/location rules are specified; do not infer them here.
    case "PLANET_SECRET":
    case "STATION_SECRET":
    case "SHIPWRECK":
      return false;
    default: {
      const exhaustive: never = location;
      return Boolean(exhaustive);
    }
  }
}

export function transferArtifact(
  state: GameState,
  actor: ItemActor,
  artifactId: string,
  source: InventoryLocation,
  target: InventoryLocation,
): ItemOperationResult {
  if (inventoryLocationKey(source) === inventoryLocationKey(target)) {
    return { ok: false, changed: false, message: "Source and target inventories must differ" };
  }
  if (!actorCanAccessItemLocation(state, actor, source) || !actorCanAccessItemLocation(state, actor, target)) {
    return { ok: false, changed: false, message: "Inventory access denied" };
  }
  const artifact = state.artifacts[artifactId];
  const sourceInventory = resolveItemInventory(state, source);
  const targetInventory = resolveItemInventory(state, target, true);
  if (!artifact || !sourceInventory || !targetInventory) {
    return { ok: false, changed: false, message: "Artifact or inventory not found" };
  }
  if (
    inventoryLocationKey(artifact.owner) !== inventoryLocationKey(source)
    || !sourceInventory.artifactIds.includes(artifactId)
  ) {
    return { ok: false, changed: false, message: "Artifact is not owned by source inventory" };
  }
  if (artifact.attachedUnitId !== undefined) {
    return { ok: false, changed: false, message: "Attached Artifact cannot be transferred" };
  }
  if (target.kind === "PLANET_SECRET") {
    const storage = state.planets[target.planetId]?.secretStorage;
    if (!storage || !secretStorageAllowsArtifact(storage, artifact.definitionCode)) {
      return { ok: false, changed: false, message: "Artifact type is not allowed in Secret Storage" };
    }
  }
  if (target.kind === "STATION_SECRET") {
    const storage = state.stations[target.stationId]?.secretStorage;
    if (!storage || !secretStorageAllowsArtifact(storage, artifact.definitionCode)) {
      return { ok: false, changed: false, message: "Artifact type is not allowed in Secret Storage" };
    }
  }
  if (targetInventory.artifactIds.includes(artifactId)) {
    return { ok: false, changed: false, message: "Target already contains artifact" };
  }

  const sourceIndex = sourceInventory.artifactIds.indexOf(artifactId);
  sourceInventory.artifactIds.splice(sourceIndex, 1);
  targetInventory.artifactIds.push(artifactId);
  artifact.owner = target;
  return { ok: true, changed: true, message: `Artifact ${artifactId} transferred` };
}

export function copyKnowledge(
  state: GameState,
  actor: ItemActor,
  knowledge: KnowledgeCode,
  source: InventoryLocation,
  target: InventoryLocation,
): ItemOperationResult {
  if (!actorCanAccessItemLocation(state, actor, source) || !actorCanAccessItemLocation(state, actor, target)) {
    return { ok: false, changed: false, message: "Inventory access denied" };
  }
  const sourceInventory = resolveItemInventory(state, source);
  const targetInventory = resolveItemInventory(state, target, true);
  if (!sourceInventory || !targetInventory) {
    return { ok: false, changed: false, message: "Inventory not found" };
  }
  if (target.kind === "PLANET_SECRET") {
    const storage = state.planets[target.planetId]?.secretStorage;
    if (!storage || !secretStorageAllowsKnowledge(storage, knowledge)) {
      return { ok: false, changed: false, message: "Knowledge type is not allowed in Secret Storage" };
    }
  }
  if (target.kind === "STATION_SECRET") {
    const storage = state.stations[target.stationId]?.secretStorage;
    if (!storage || !secretStorageAllowsKnowledge(storage, knowledge)) {
      return { ok: false, changed: false, message: "Knowledge type is not allowed in Secret Storage" };
    }
  }
  if (!sourceInventory.knowledge.includes(knowledge)) {
    return { ok: false, changed: false, message: "Source does not contain knowledge" };
  }
  if (targetInventory.knowledge.includes(knowledge)) {
    return { ok: true, changed: false, message: `Target already knows ${knowledge}` };
  }
  targetInventory.knowledge.push(knowledge);
  return { ok: true, changed: true, message: `Knowledge ${knowledge} copied` };
}
