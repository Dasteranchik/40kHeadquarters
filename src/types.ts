import {
  InfoCategory,
  PlanetTag,
  PlanetWorldType,
  ProductResourceKey,
  ProductConversionRates,
  ResourceKey,
  TitheLevel,
} from "./planetDomain";
import type { AuditEntry } from "./auditDomain";
import type { ProcessedCommand } from "./commandDomain";
import type { DetectionState } from "./detectionDomain";
import type { DetectionResult } from "./detectionDomain";
import type {
  ArtifactInstance,
  ItemInventory,
  PlayerItemInventories,
  StackableInventory,
} from "./itemDomain";
import type { Shop } from "./shopDomain";
import type { TurnTimerState } from "./turnTimerDomain";
import type { UnitTag } from "./unitDomain";
import type { Anomaly, Shipwreck, Station } from "./worldObjectDomain";
import type { SecretStorage } from "./secretStorageDomain";
import type { UnitVariant } from "./unitVariantDomain";
import type { WarpVisibility } from "./navigationDomain";
import type { FormationInstance } from "./formationDomain";
import type { DoctrineDefinition } from "./doctrineDomain";
import type { ItemKindDefinition } from "./itemDomain";
import type { TagDefinition, TagRelation } from "./tagDomain";

export interface HexCoord {
  q: number;
  r: number;
}
export type EntityId = number;

export type GamePhase = "PLANNING" | "RESOLUTION" | "UPDATE";

export type TerrainType = "OPEN" | "NEBULA" | "OBSTACLE";

export interface Tile extends HexCoord {
  terrainType: TerrainType;
  /** Server-authoritative SPACE movement cost for entering this tile (1..6). */
  warpDisturbanceLevel: number;
  planetId?: EntityId;
}

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[];
}

export type ResourceStore = StackableInventory;
export type PlayerProductStorages = Record<string, ResourceStore>;
export type IntelFragmentMap = Partial<Record<InfoCategory, number>>;

export interface Planet {
  id: number;
  name: string;
  position: HexCoord;
  worldType: PlanetWorldType;
  worldTags: PlanetTag[];
  tags?: UnitTag[];
  population: number;
  morale: number;
  titheLevel: TitheLevel;
  maxTitheLevel: TitheLevel;
  titheTarget: number;
  tithePaid: number;
  titheContributions: ResourceStore;
  resourceGeneration: ResourceStore;
  resourceProduction: number;
  influenceValue: number;
  visionRange: number;
  rawStock: ResourceStore;
  productStorageByPlayerId: PlayerProductStorages;
  itemStorageByPlayerId: PlayerItemInventories;
  shop: Shop;
  infoFragments: IntelFragmentMap;
  secretStorage?: SecretStorage;
  /** Personalized projection marker; the storage contents and verifier remain server-side. */
  secretStorageAvailable?: boolean;
}

export type PlayerAlignment = "IMPERIAL" | "NON_IMPERIAL";

export interface Faction {
  id: number;
  code: string;
  name: string;
  description?: string;
  isChaos: boolean;
  isAdministratum: boolean;
}

export interface SystemSettings {
  /** Minimum SPACE movement points restored at the end of a turn. */
  baseFleetMovementPoints: number;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  canTakePlanetResources: boolean;
  resources: number;
  alliances: EntityId[];
  wars: EntityId[];
  exploredTiles: HexCoord[];
  alignment: PlayerAlignment;
  factionId: number;
  intelFragments: IntelFragmentMap;
  manualNavigator: boolean;
  /** Computed server-side and present in client projections; never persisted as authority. */
  effectiveNavigator?: boolean;
}

export type FleetStance = "ATTACK" | "DEFENSE";
export type FleetDomain = "SPACE" | "GROUND";

export interface Unit {
  id: number;
  ownerPlayerId: EntityId;
  name?: string;
  position: HexCoord;
  /** Legacy projection only when individual formations exist. */
  combatPower: number;
  /** Legacy projection only when individual formations exist. */
  health: number;
  morale?: number;
  commanderArtifactId?: string | null;
  formationIds?: string[];
  attachedArtifactIds?: string[];
  assignedDoctrineIds?: string[];
  influence: number;
  movementPoints: number;
  maxMovementPoints: number;
  isNavigator: boolean;
  warpVisibility: WarpVisibility;
  visionRange: number;
  shareVisionWithAllies: boolean;
  capacity: number;
  stance: FleetStance;
  domain: FleetDomain;
  inventory: ResourceStore;
  itemInventory: ItemInventory;
  tags: UnitTag[];
  unitVariantId?: EntityId;
  /** Present only in personalized client projections. */
  confidence?: "EXACT" | "ESTIMATED";
  /** Set only for a GROUND army currently embarked on a SPACE fleet. */
  carrierFleetId?: EntityId;
}

/** @deprecated Use Unit. Kept as a snapshot/API compatibility alias. */
export type Fleet = Unit;

export interface ArmyTransportRequest {
  id: string;
  armyId: EntityId;
  fleetId: EntityId;
  requestedByPlayerId: EntityId;
  requestedOnTurn: number;
}

export interface PendingPlanetTitheChange {
  planetId: EntityId;
  titheLevel: TitheLevel;
  requestedByPlayerId: EntityId;
  applyOnTurn: number;
}

export interface AdministratumWorldReport {
  planetId: EntityId;
  reportedAtTurn: number;
  sequence: number;
}

export interface AdministratumTitheProposal {
  planetId: EntityId;
  playerId: EntityId;
  requestedOnTurn: number;
  titheLevel: TitheLevel;
}

export interface PendingPlanetInformantAction {
  planetId: EntityId;
  playerId: EntityId;
  infoCategory: InfoCategory;
  applyOnTurn: number;
}

export interface GameState {
  gameId: string;
  turnNumber: number;
  phase: GamePhase;
  systemSettings: SystemSettings;
  productConversionRates: ProductConversionRates;
  map: MapState;
  players: Record<string, Player>;
  fleets: Record<string, Fleet>;
  planets: Record<string, Planet>;
  stations: Record<string, Station>;
  shipwrecks: Record<string, Shipwreck>;
  anomalies: Record<string, Anomaly>;
  artifacts: Record<string, ArtifactInstance>;
  factions: Record<string, Faction>;
  unitVariants: Record<string, UnitVariant>;
  formations?: Record<string, FormationInstance>;
  itemKinds?: Record<string, ItemKindDefinition>;
  tags?: Record<string, TagDefinition>;
  tagRelations?: TagRelation[];
  doctrines?: Record<string, DoctrineDefinition>;
  nextIds: {
    player: number;
    faction: number;
    planet: number;
    unit: number;
    event: number;
    station: number;
    shipwreck: number;
    anomaly: number;
    artifact: number;
    audit: number;
    unitVariant: number;
    formation?: number;
  };
  events: GameEvent[];
  audit: AuditEntry[];
  detection: DetectionState;
  processedCommands: ProcessedCommand[];
  turnTimer: TurnTimerState;
  pendingTitheChanges: PendingPlanetTitheChange[];
  pendingInformantActions: PendingPlanetInformantAction[];
  pendingArmyTransportRequests: ArmyTransportRequest[];
  administratumWorldReports: AdministratumWorldReport[];
  administratumTitheProposals: AdministratumTitheProposal[];
}


export interface GameEvent {
  id: number;
  turnNumber: number;
  kind: "COMBAT" | "MOVEMENT" | "DIPLOMACY" | "SYSTEM" | "DETECTION" | "SHOP" | "SHIPWRECK" | "ADMINISTRATUM";
  message: string;
  playerIds: number[];
}

export type DiplomacyActionType = "DECLARE_WAR" | "PROPOSE_ALLIANCE";

export interface MoveFleetAction {
  id: string;
  playerId: EntityId;
  type: "MOVE_FLEET";
  payload: {
    fleetId: EntityId;
    path: HexCoord[];
  };
}

export interface DiplomacyAction {
  id: string;
  playerId: EntityId;
  type: "DIPLOMACY";
  payload: {
    targetPlayerId: EntityId;
    action: DiplomacyActionType;
  };
}

export interface SetFleetStanceAction {
  id: string;
  playerId: EntityId;
  type: "SET_FLEET_STANCE";
  payload: {
    fleetId: EntityId;
    stance: FleetStance;
  };
}

export type PlanetActionKind =
  | "TAKE_STOCK"
  | "RAID_STOCK"
  | "DEPOSIT_TO_STORAGE"
  | "TAKE_FROM_STORAGE"
  | "CREATE_PRODUCT"
  | "ECCLESIARCHY_RAISE_MORALE"
  | "INQUISITION_DEPLOY_INFORMANT"
  | "ADMINISTRATUM_SET_TITHE";

export interface PlanetAction {
  id: string;
  playerId: EntityId;
  type: "PLANET_ACTION";
  payload: {
    planetId: EntityId;
    kind: PlanetActionKind;
    fleetId?: EntityId;
    resourceKey?: ResourceKey;
    amount?: number;
    productKey?: ProductResourceKey;
    infoCategory?: InfoCategory;
    titheLevel?: TitheLevel;
  };
}

export type Action =
  | MoveFleetAction
  | DiplomacyAction
  | SetFleetStanceAction
  | PlanetAction;

export interface ValidationError {
  actionId: string;
  reason: string;
}

export interface ValidatedTurnActions {
  moveActions: MoveFleetAction[];
  diplomacyActions: DiplomacyAction[];
  stanceActions: SetFleetStanceAction[];
  planetActions: PlanetAction[];
  errors: ValidationError[];
}

export interface MovementExecution {
  actionId: string;
  fleetId: EntityId;
  from: HexCoord;
  to: HexCoord;
  spentMovementPoints: number;
  remainingMovementPoints: number;
}

export interface MovementReport {
  executed: MovementExecution[];
}

export interface DiplomacyReport {
  declaredWars: Array<{ playerAId: EntityId; playerBId: EntityId }>;
  formedAlliances: Array<{ playerAId: EntityId; playerBId: EntityId }>;
}

export interface CombatDamageEvent {
  fleetId: EntityId;
  attackerFleetIds: EntityId[];
  damage: number;
  healthAfter: number;
}

export interface CombatReport {
  damageEvents: CombatDamageEvent[];
  destroyedFleetIds: EntityId[];
  createdShipwreckIds: number[];
}

export interface EconomyReport {
  globalIncome: number;
  playerIncome: Record<string, number>;
}

export interface PlanetEvent {
  actionId?: string;
  planetId: EntityId;
  kind:
    | "PENDING_INFORMANT_APPLIED"
    | "PENDING_TITHE_APPLIED"
    | "ADMINISTRATUM_TITHE_APPLIED"
    | "TURN_GENERATION"
    | "TAKE_STOCK"
    | "RAID_STOCK"
    | "TAKE_FROM_STORAGE"
    | "DEPOSIT_TO_STORAGE"
    | "CREATE_PRODUCT"
    | "RAISE_MORALE"
    | "SCHEDULE_INFORMANT"
    | "SCHEDULE_TITHE"
    | "REJECTED";
  details: string;
}

export interface PlanetReport {
  events: PlanetEvent[];
}

export interface VisibleFleet {
  id: number;
  ownerPlayerId: EntityId;
  position: HexCoord;
  combatPower: number;
  health: number;
  influence: number;
  confidence: "EXACT" | "ESTIMATED";
}

export interface PlayerVisibleState {
  playerId: EntityId;
  visibleTiles: HexCoord[];
  exploredTiles: HexCoord[];
  fleets: VisibleFleet[];
  visiblePlanets: Planet[];
  visibleStations: Station[];
  visibleShipwrecks: Shipwreck[];
  visibleAnomalies: Anomaly[];
}

export interface TurnResolution {
  turnNumber: number;
  validationErrors: ValidationError[];
  movement: MovementReport;
  diplomacy: DiplomacyReport;
  combat: CombatReport;
  economy: EconomyReport;
  planet: PlanetReport;
  detection: DetectionResult[];
  administratum: Array<{
    planetId: number;
    titheLevel: TitheLevel;
    notifiedPlayerIds: number[];
  }>;
  visibility: Record<string, PlayerVisibleState>;
}
