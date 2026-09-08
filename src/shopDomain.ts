import type { ResourceKey } from "./planetDomain";
import {
  createEmptyItemInventory,
  type ItemInventory,
  type KnowledgeCode,
  type StackableInventory,
} from "./itemDomain";

export type DisappearingItemRef =
  | { kind: "RESOURCE"; code: ResourceKey }
  | { kind: "ARTIFACT_DEFINITION"; code: string }
  | { kind: "KNOWLEDGE"; code: KnowledgeCode };

export interface Shop {
  resources: StackableInventory;
  items: ItemInventory;
  disappearingItems: DisappearingItemRef[];
}

export type ShopOwnerRef =
  | { kind: "PLANET"; id: number }
  | { kind: "STATION"; id: number };

export interface ShopTradePayload {
  commandId: string;
  shop: ShopOwnerRef;
  fleetId: number;
  receive: { resourceKey: ResourceKey; amount: number };
  payment: StackableInventory;
}

export function createEmptyShop(): Shop {
  return {
    resources: {},
    items: createEmptyItemInventory(),
    disappearingItems: [],
  };
}

export function isDisappearingResource(shop: Shop, key: ResourceKey): boolean {
  return shop.disappearingItems.some(
    (entry) => entry.kind === "RESOURCE" && entry.code === key,
  );
}
