import type { ResourceKey } from "./planetDomain";

export type StackableInventory = Partial<Record<ResourceKey, number>>;

export const SYSTEM_KNOWLEDGE = {
  EXACT_AUSPEX: "EXACT_AUSPEX",
} as const;

export type SystemKnowledgeCode =
  (typeof SYSTEM_KNOWLEDGE)[keyof typeof SYSTEM_KNOWLEDGE];
export type KnowledgeCode = string;

export interface ItemInventory {
  artifactIds: string[];
  knowledge: KnowledgeCode[];
}

export type InventoryLocation =
  | { kind: "FLEET"; fleetId: number }
  | { kind: "PLANET_STORAGE"; planetId: number; playerId: number }
  | { kind: "PLANET_SHOP"; planetId: number }
  | { kind: "STATION_STORAGE"; stationId: number; playerId: number }
  | { kind: "STATION_SHOP"; stationId: number }
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
  definitionCode: string;
  name: string;
  owner: InventoryLocation;
  configuration: Record<string, JsonValue>;
  passiveEffect?: ArtifactEffect;
  useEffect?: ArtifactEffect;
  cooldownTurns?: number;
  cooldownUntilTurn?: number;
  consumable: boolean;
}

export type PlayerItemInventories = Record<string, ItemInventory>;

export function createEmptyItemInventory(): ItemInventory {
  return { artifactIds: [], knowledge: [] };
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
