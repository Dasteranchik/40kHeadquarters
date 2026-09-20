import type { Shop, ShopOwnerRef } from "../../../src/shopDomain";
import type { Fleet, GameState } from "../../../src/types";

export interface ShopAtFleet {
  owner: ShopOwnerRef;
  label: string;
  shop: Shop;
}

export function shopOwnerKey(owner: ShopOwnerRef): string {
  return `${owner.kind}:${owner.id}`;
}

export function shopsAtFleet(state: GameState, fleet: Fleet): ShopAtFleet[] {
  const result: ShopAtFleet[] = [];
  for (const planet of Object.values(state.planets)) {
    if (planet.position.q === fleet.position.q && planet.position.r === fleet.position.r) {
      result.push({
        owner: { kind: "PLANET", id: planet.id },
        label: `Planet ${planet.name} (#${planet.id})`,
        shop: planet.shop,
      });
    }
  }
  for (const station of Object.values(state.stations)) {
    if (
      station.capabilities.includes("SHOP")
      && station.position.q === fleet.position.q
      && station.position.r === fleet.position.r
    ) {
      result.push({
        owner: { kind: "STATION", id: station.id },
        label: `Station ${station.name} (#${station.id})`,
        shop: station.shop,
      });
    }
  }
  return result.sort((a, b) =>
    a.owner.kind.localeCompare(b.owner.kind) || a.owner.id - b.owner.id
  );
}

export function selectedShop(
  state: GameState,
  fleet: Fleet,
  selectedOwnerKey: string,
): ShopAtFleet | null {
  return shopsAtFleet(state, fleet).find(
    (entry) => shopOwnerKey(entry.owner) === selectedOwnerKey,
  ) ?? null;
}
