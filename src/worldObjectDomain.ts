import type { DetectionObjectKind } from "./detectionDomain";
import type {
  ItemInventory,
  PlayerItemInventories,
  StackableInventory,
} from "./itemDomain";
import type { InfoCategory } from "./planetDomain";
import type { Shop } from "./shopDomain";
import type { GameState, HexCoord, PlayerProductStorages } from "./types";
import type { UnitTag } from "./unitDomain";
import type { WarpVisibility } from "./navigationDomain";
import type { SecretStorage } from "./secretStorageDomain";

export const STATION_CAPABILITIES = [
  "TAGS",
  "RESOURCE_GENERATION",
  "RAW_STOCK",
  "PLAYER_STORAGE",
  "SHOP",
  "INFO_FRAGMENTS",
  "FLEET_COMBAT_POWER",
  "ARMY_COMBAT_POWER",
] as const;

export type StationCapability = (typeof STATION_CAPABILITIES)[number];

const STATION_CAPABILITY_SET = new Set<string>(STATION_CAPABILITIES);

export function isStationCapability(value: unknown): value is StationCapability {
  return typeof value === "string" && STATION_CAPABILITY_SET.has(value);
}

export interface Station {
  id: number;
  name: string;
  position: HexCoord;
  capabilities: StationCapability[];
  tags: UnitTag[];
  resourceGeneration: StackableInventory;
  rawStock: StackableInventory;
  productStorageByPlayerId: PlayerProductStorages;
  itemStorageByPlayerId: PlayerItemInventories;
  shop: Shop;
  infoFragments: Partial<Record<InfoCategory, number>>;
  ownerFactionId: number | null;
  warpVisibility: WarpVisibility;
  secretStorage?: SecretStorage;
  secretStorageAvailable?: boolean;
  fleetCombatPower: number;
  armyCombatPower: number;
}

export interface Shipwreck {
  id: number;
  position: HexCoord;
  inventory: ItemInventory;
  createdOnTurn: number;
  sourceUnitIds: number[];
}

export interface Anomaly {
  id: number;
  position: HexCoord;
  tags: UnitTag[];
  informationRef: string;
}

export type WorldObject =
  | { kind: "PLANET"; id: number; value: GameState["planets"][string] }
  | { kind: "FLEET"; id: number; value: GameState["fleets"][string] }
  | { kind: "STATION"; id: number; value: Station }
  | { kind: "SHIPWRECK"; id: number; value: Shipwreck }
  | { kind: "ANOMALY"; id: number; value: Anomaly };

function sameHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function getObjectsAtHex(state: GameState, coord: HexCoord): WorldObject[] {
  const result: WorldObject[] = [];
  for (const planet of Object.values(state.planets)) {
    if (sameHex(planet.position, coord)) result.push({ kind: "PLANET", id: planet.id, value: planet });
  }
  for (const fleet of Object.values(state.fleets)) {
    if (sameHex(fleet.position, coord)) result.push({ kind: "FLEET", id: fleet.id, value: fleet });
  }
  for (const station of Object.values(state.stations)) {
    if (sameHex(station.position, coord)) result.push({ kind: "STATION", id: station.id, value: station });
  }
  for (const shipwreck of Object.values(state.shipwrecks)) {
    if (sameHex(shipwreck.position, coord)) result.push({ kind: "SHIPWRECK", id: shipwreck.id, value: shipwreck });
  }
  for (const anomaly of Object.values(state.anomalies)) {
    if (sameHex(anomaly.position, coord)) result.push({ kind: "ANOMALY", id: anomaly.id, value: anomaly });
  }
  return result.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
}

export function worldObjectDetectionKind(object: WorldObject): DetectionObjectKind {
  return object.kind;
}
