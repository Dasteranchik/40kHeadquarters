import {
  isProductResourceKey,
  isRawResourceKey,
  isResourceKey,
  type ResourceKey,
} from "../planetDomain";
import {
  isDisappearingResource,
  type Shop,
  type ShopOwnerRef,
  type ShopTradePayload,
} from "../shopDomain";
import type { Fleet, GameState, HexCoord, ResourceStore } from "../types";

export interface ShopTradeActor {
  role: "admin" | "player";
  playerId?: number;
}

export interface ShopTradeResult {
  ok: boolean;
  message: string;
  received: number;
  paymentTotal: number;
  disappeared: ResourceStore;
}

interface ResolvedShop {
  shop: Shop;
  position: HexCoord;
  entityType: "PLANET" | "STATION";
  entityId: number;
}

function amountIn(store: ResourceStore, key: ResourceKey): number {
  const value = store[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function add(store: ResourceStore, key: ResourceKey, amount: number): void {
  const next = Math.round((amountIn(store, key) + amount) * 100) / 100;
  if (next > 0) store[key] = next;
}

function remove(store: ResourceStore, key: ResourceKey, amount: number): void {
  const next = Math.round((amountIn(store, key) - amount) * 100) / 100;
  if (next <= 0) delete store[key];
  else store[key] = next;
}

function sameHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function resolveShop(state: GameState, owner: ShopOwnerRef): ResolvedShop | null {
  switch (owner.kind) {
    case "PLANET": {
      const planet = state.planets[owner.id];
      return planet
        ? { shop: planet.shop, position: planet.position, entityType: "PLANET", entityId: planet.id }
        : null;
    }
    case "STATION": {
      const station = state.stations[owner.id];
      return station?.capabilities.includes("SHOP")
        ? { shop: station.shop, position: station.position, entityType: "STATION", entityId: station.id }
        : null;
    }
    default: {
      const exhaustive: never = owner;
      return exhaustive;
    }
  }
}

function requiredPayment(
  receiveKey: ResourceKey,
  paymentKeys: ResourceKey[],
  amount: number,
): { category: "RAW" | "PRODUCT"; total: number } | null {
  const receiveRaw = isRawResourceKey(receiveKey);
  const paymentRaw = paymentKeys.every(isRawResourceKey);
  const paymentProduct = paymentKeys.every(isProductResourceKey);
  if (receiveRaw && paymentRaw) return { category: "RAW", total: amount * 2 };
  if (!receiveRaw && paymentProduct) return { category: "PRODUCT", total: amount * 2 };
  if (!receiveRaw && paymentRaw) return { category: "RAW", total: amount * 10 };
  // TODO(DEC-016): PRODUCT player payment -> RAW Shop exchange is intentionally unsupported.
  return null;
}

function validateFleet(
  state: GameState,
  actor: ShopTradeActor,
  fleetId: number,
  position: HexCoord,
): Fleet | null {
  const fleet = state.fleets[fleetId];
  if (!fleet || !sameHex(fleet.position, position)) return null;
  if (actor.role === "player" && fleet.ownerPlayerId !== actor.playerId) return null;
  return fleet;
}

export function tradeWithShop(
  state: GameState,
  actor: ShopTradeActor,
  payload: ShopTradePayload,
): ShopTradeResult {
  const failed = (message: string): ShopTradeResult => ({
    ok: false,
    message,
    received: 0,
    paymentTotal: 0,
    disappeared: {},
  });
  const resolved = resolveShop(state, payload.shop);
  if (!resolved) return failed("Shop not found or disabled");
  const fleet = validateFleet(state, actor, payload.fleetId, resolved.position);
  if (!fleet) return failed("Buyer must control a fleet in the Shop hex");
  const receiveKey = payload.receive?.resourceKey;
  const receiveAmount = Math.trunc(payload.receive?.amount);
  if (!isResourceKey(receiveKey) || !Number.isFinite(payload.receive?.amount) || receiveAmount <= 0) {
    return failed("Invalid requested Shop resource or amount");
  }
  if (amountIn(resolved.shop.resources, receiveKey) < receiveAmount) {
    return failed("Shop does not have enough requested resource");
  }
  if (!payload.payment || typeof payload.payment !== "object") {
    return failed("Payment composition is required");
  }
  const paymentEntries = Object.entries(payload.payment).filter(([, value]) => value !== undefined);
  if (paymentEntries.length === 0) return failed("Payment composition is empty");
  const normalizedPayment: Array<[ResourceKey, number]> = [];
  for (const [key, rawAmount] of paymentEntries) {
    if (!isResourceKey(key) || typeof rawAmount !== "number" || !Number.isFinite(rawAmount)) {
      return failed("Payment contains an invalid resource");
    }
    const amount = Math.trunc(rawAmount);
    if (amount <= 0 || amount !== rawAmount) return failed("Payment amounts must be positive integers");
    normalizedPayment.push([key, amount]);
  }
  const pricing = requiredPayment(
    receiveKey,
    normalizedPayment.map(([key]) => key),
    receiveAmount,
  );
  if (!pricing) return failed("Unsupported exchange path (TODO DEC-016)");
  const paymentTotal = normalizedPayment.reduce((sum, [, amount]) => sum + amount, 0);
  if (paymentTotal !== pricing.total) {
    return failed(`Payment must total exactly ${pricing.total} ${pricing.category}`);
  }
  for (const [key, amount] of normalizedPayment) {
    if (amountIn(fleet.inventory, key) < amount) return failed(`Fleet lacks ${amount} ${key}`);
  }

  remove(resolved.shop.resources, receiveKey, receiveAmount);
  add(fleet.inventory, receiveKey, receiveAmount);
  const disappeared: ResourceStore = {};
  for (const [key, amount] of normalizedPayment) {
    remove(fleet.inventory, key, amount);
    if (isDisappearingResource(resolved.shop, key)) disappeared[key] = amount;
    else add(resolved.shop.resources, key, amount);
  }
  return {
    ok: true,
    message: `Traded ${paymentTotal} resources for ${receiveAmount} ${receiveKey}`,
    received: receiveAmount,
    paymentTotal,
    disappeared,
  };
}
