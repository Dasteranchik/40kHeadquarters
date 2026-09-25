import type { ResourceKey } from "./planetDomain";
import type { WarpVisibility } from "./navigationDomain";
import type { UnitEffect } from "./effectDomain";

export type StackableInventory = Partial<Record<ResourceKey, number>>;

export const SYSTEM_KNOWLEDGE = {
  EXACT_AUSPEX: "EXACT_AUSPEX",
} as const;

export type SystemKnowledgeCode =
  (typeof SYSTEM_KNOWLEDGE)[keyof typeof SYSTEM_KNOWLEDGE];
export type KnowledgeCode = string;

export type ItemType = "RAW" | "PRODUCT" | "ARTIFACT" | "KNOWLEDGE";

export interface ItemKindDefinition {
  id: string;
  type: ItemType;
  name: string;
  description?: string;
  tags: string[];
  /** Required for a combat-capable individual PRODUCT. */
  baseCombatPower?: number;
  maxHealth?: number;
  effects?: UnitEffect[];
  commanderCapable?: boolean;
  isNavigator?: boolean;
  warpVisibility?: WarpVisibility;
  configuration?: Record<string, JsonValue>;
}

export interface ItemInventory {
  artifactIds: string[];
  knowledge: KnowledgeCode[];
  /** Individual PRODUCT items; stackable legacy REGIMENTS remain separate. */
  productIds?: string[];
}

export type InventoryLocation =
  | { kind: "FLEET"; fleetId: number }
  | { kind: "PLANET_STORAGE"; planetId: number; playerId: number }
  | { kind: "PLANET_SHOP"; planetId: number }
  | { kind: "STATION_STORAGE"; stationId: number; playerId: number }
  | { kind: "STATION_SHOP"; stationId: number }
  | { kind: "PLANET_SECRET"; planetId: number }
  | { kind: "STATION_SECRET"; stationId: number }
  | { kind: "SHIPWRECK"; shipwreckId: number };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ArtifactEffect {
  effectCode: string;
  params: Record<string, JsonValue>;
}

export interface ArtifactInstance {
  id: string;
  type?: "ARTIFACT";
  kind?: string;
  definitionCode: string;
  name: string;
  owner: InventoryLocation;
  configuration: Record<string, JsonValue>;
  isNavigator: boolean;
  warpVisibility: WarpVisibility;
  /** Stable Warp Visibility recipient; independent from the current holder. */
  navigatorOriginPlayerId?: number;
  passiveEffect?: ArtifactEffect;
  useEffect?: ArtifactEffect;
  cooldownTurns?: number;
  cooldownUntilTurn?: number;
  consumable: boolean;
  tags?: string[];
  effects?: UnitEffect[];
  attachedUnitId?: number;
}

export type PlayerItemInventories = Record<string, ItemInventory>;

export function createEmptyItemInventory(): ItemInventory {
  return { artifactIds: [], knowledge: [], productIds: [] };
}

export function inventoryLocationKey(location: InventoryLocation): string {
  switch (location.kind) {
    case "FLEET":
      return `FLEET:${location.fleetId}`;
    case "PLANET_STORAGE":
      return `PLANET_STORAGE:${location.planetId}:${location.playerId}`;
    case "PLANET_SHOP":
      return `PLANET_SHOP:${location.planetId}`;
    case "STATION_STORAGE":
      return `STATION_STORAGE:${location.stationId}:${location.playerId}`;
    case "STATION_SHOP":
      return `STATION_SHOP:${location.stationId}`;
    case "PLANET_SECRET":
      return `PLANET_SECRET:${location.planetId}`;
    case "STATION_SECRET":
      return `STATION_SECRET:${location.stationId}`;
    case "SHIPWRECK":
      return `SHIPWRECK:${location.shipwreckId}`;
    default: {
      const exhaustive: never = location;
      return String(exhaustive);
    }
  }
}

export function isKnowledgeCode(value: unknown): value is KnowledgeCode {
  return typeof value === "string" && /^[A-Z0-9_:-]{2,80}$/.test(value);
}
