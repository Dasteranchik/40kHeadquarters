import { ResourceEndpointKind, ResourceTransferPayload } from "../api/ws";
import { isResourceKey, type ResourceKey } from "../planetDomain";
import type { Fleet, GameState, HexCoord, Planet, ResourceStore } from "../types";

export interface TransferActor {
  role: "admin" | "player";
  playerId?: string;
}

export interface TransferResult {
  ok: boolean;
  moved: number;
  message: string;
}

interface ResolvedEndpoint {
  kind: ResourceEndpointKind;
  id: string;
  position: HexCoord;
  store: ResourceStore;
  fleet: Fleet | null;
  planet: Planet | null;
}

function getStoreAmount(store: ResourceStore, key: ResourceKey): number {
  const value = store[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function isResourceEndpointKind(value: unknown): value is ResourceEndpointKind {
  return value === "FLEET" || value === "PLANET_STORAGE";
}

function addToStore(store: ResourceStore, key: ResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }

  store[key] = getStoreAmount(store, key) + amount;
}

function takeFromStore(store: ResourceStore, key: ResourceKey, amount: number): number {
  const available = getStoreAmount(store, key);
  const moved = Math.min(available, Math.max(0, Math.trunc(amount)));
  if (moved <= 0) {
    return 0;
  }

  const left = available - moved;
  if (left <= 0) {
    delete store[key];
  } else {
    store[key] = left;
  }

  return moved;
}

function inventoryLoad(fleet: Fleet): number {
  return Object.values(fleet.inventory).reduce((sum, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return sum;
    }
    return sum + Math.max(0, Math.trunc(value));
  }, 0);
}

function resolveEndpoint(state: GameState, kind: ResourceEndpointKind, id: string): ResolvedEndpoint | null {
  if (kind === "FLEET") {
    const fleet = state.fleets[id];
    if (!fleet) {
      return null;
    }

    return {
      kind,
      id,
      position: fleet.position,
      store: fleet.inventory,
      fleet,
      planet: null,
    };
  }

  const planet = state.planets[id];
  if (!planet) {
    return null;
  }

  return {
    kind,
    id,
    position: planet.position,
  store: planet.productStorage,
    fleet: null,
    planet,
  };
}

function sameHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

function playerHasFleetAt(
  state: GameState,
  playerId: string,
  coord: HexCoord,
): boolean {
  return Object.values(state.fleets).some(
    (fleet) =>
      fleet.ownerPlayerId === playerId &&
      fleet.position.q === coord.q &&
      fleet.position.r === coord.r,
  );
}

function validateActorAccess(
  state: GameState,
  actor: TransferActor,
  from: ResolvedEndpoint,
  to: ResolvedEndpoint,
): string | null {
  if (actor.role === "admin") {
    return null;
  }

  if (!actor.playerId) {
    return "Player context is missing";
  }

  const fleetEndpoints = [from, to].filter((endpoint) => endpoint.fleet);
  if (fleetEndpoints.length === 0) {
    return "Player transfer requires at least one fleet endpoint";
  }

  for (const endpoint of fleetEndpoints) {
    if (endpoint.fleet && endpoint.fleet.ownerPlayerId !== actor.playerId) {
      return "You can transfer resources only with your own fleets";
    }
  }

  const planetEndpoints = [from, to].filter((endpoint) => endpoint.planet);
  for (const endpoint of planetEndpoints) {
    if (!playerHasFleetAt(state, actor.playerId, endpoint.position)) {
      return "You can use planet transfer only on your controlled planets (with your fleet in hex)";
    }
  }

  return null;
}

function transferIntoFleet(
  targetFleet: Fleet,
  key: ResourceKey,
  requested: number,
): number {
  const freeCapacity = Math.max(0, Math.trunc(targetFleet.capacity) - inventoryLoad(targetFleet));
  const moved = Math.min(freeCapacity, requested);
  if (moved <= 0) {
    return 0;
  }

  addToStore(targetFleet.inventory, key, moved);
  return moved;
}

function moveResource(
  from: ResolvedEndpoint,
  to: ResolvedEndpoint,
  key: ResourceKey,
  requested: number,
): TransferResult {
  const available = getStoreAmount(from.store, key);
  if (available <= 0) {
    return {
      ok: false,
      moved: 0,
      message: `Source does not have ${key}`,
    };
  }

  const wanted = Math.min(available, requested);
  const taken = takeFromStore(from.store, key, wanted);
  if (taken <= 0) {
    return {
      ok: false,
      moved: 0,
      message: `Failed to take ${key} from source`,
    };
  }

  let moved = taken;
  if (to.fleet) {
    moved = transferIntoFleet(to.fleet, key, taken);
    if (moved <= 0) {
      addToStore(from.store, key, taken);
      return {
        ok: false,
        moved: 0,
        message: `Fleet ${to.fleet.id} has no free capacity`,
      };
    }
  } else {
    addToStore(to.store, key, taken);
  }

  if (moved < taken) {
    addToStore(from.store, key, taken - moved);
  }

  return {
    ok: true,
    moved,
    message: `Transferred ${moved} ${key} from ${from.kind}:${from.id} to ${to.kind}:${to.id}`,
  };
}

export function applyPlanningResourceTransfer(
  state: GameState,
  actor: TransferActor,
  payload: ResourceTransferPayload,
): TransferResult {
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.from ||
    typeof payload.from !== "object" ||
    !payload.to ||
    typeof payload.to !== "object" ||
    typeof payload.from.id !== "string" ||
    typeof payload.to.id !== "string"
  ) {
    return {
      ok: false,
      moved: 0,
      message: "Invalid resource transfer payload",
    };
  }

  const amount = Math.trunc(payload.amount);
  if (!Number.isFinite(payload.amount) || amount <= 0) {
    return {
      ok: false,
      moved: 0,
      message: "Transfer amount must be a positive integer",
    };
  }

  if (!isResourceKey(payload.resourceKey)) {
    return {
      ok: false,
      moved: 0,
      message: "Invalid resource key",
    };
  }

  if (
    !isResourceEndpointKind(payload.from.kind) ||
    !isResourceEndpointKind(payload.to.kind)
  ) {
    return {
      ok: false,
      moved: 0,
      message: "Invalid resource endpoint kind",
    };
  }

  if (payload.from.kind === payload.to.kind && payload.from.id === payload.to.id) {
    return {
      ok: false,
      moved: 0,
      message: "Source and destination must be different",
    };
  }

  const from = resolveEndpoint(state, payload.from.kind, payload.from.id);
  if (!from) {
    return {
      ok: false,
      moved: 0,
      message: "Source endpoint not found",
    };
  }

  const to = resolveEndpoint(state, payload.to.kind, payload.to.id);
  if (!to) {
    return {
      ok: false,
      moved: 0,
      message: "Destination endpoint not found",
    };
  }

  if (!sameHex(from.position, to.position)) {
    return {
      ok: false,
      moved: 0,
      message: "Source and destination must be in the same hex",
    };
  }

  const accessError = validateActorAccess(state, actor, from, to);
  if (accessError) {
    return {
      ok: false,
      moved: 0,
      message: accessError,
    };
  }

  return moveResource(from, to, payload.resourceKey, amount);
}
