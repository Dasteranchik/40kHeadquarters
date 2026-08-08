import {
  InfoCategory,
  PlanetTag,
  PlanetWorldType,
  ProductResourceKey,
  ResourceKey,
  TitheLevel,
} from "./planetDomain";

export interface HexCoord {
  q: number;
  r: number;
}
export type EntityId = any;

export type GamePhase = "PLANNING" | "RESOLUTION" | "UPDATE";

export type TerrainType = "OPEN" | "NEBULA" | "OBSTACLE";

export interface Tile extends HexCoord {
  terrainType: TerrainType;
  planetId?: EntityId;
}

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[];
}

export type ResourceStore = Partial<Record<ResourceKey, number>>;
export type PlayerProductStorages = Record<string, ResourceStore>;
export type IntelFragmentMap = Partial<Record<InfoCategory, number>>;

export interface Planet {
  id: number;
  name: string;
  position: HexCoord;
  worldType: PlanetWorldType;
  worldTags: PlanetTag[];
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
  overviewRange: number;
  rawStock: ResourceStore;
  productStorageByPlayerId: PlayerProductStorages;
  infoFragments: IntelFragmentMap;
}

export type PlayerAlignment = "IMPERIAL" | "NON_IMPERIAL";

export interface Faction {
  id: number;
  code: string;
  name: string;
  description?: string;
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
}

export type FleetStance = "ATTACK" | "DEFENSE";
export type FleetDomain = "SPACE" | "GROUND";

export interface Fleet {
  id: number;
  ownerPlayerId: EntityId;
  position: HexCoord;
  combatPower: number;
  health: number;
  influence: number;
  actionPoints: number;
  visionRange: number;
  shareVisionWithAllies: boolean;
  capacity: number;
  stance: FleetStance;
  domain: FleetDomain;
  inventory: ResourceStore;
  /** Set only for a GROUND army currently embarked on a SPACE fleet. */
  carrierFleetId?: EntityId;
}

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
  map: MapState;
  players: Record<string, Player>;
  fleets: Record<string, Fleet>;
  planets: Record<string, Planet>;
  factions: Record<string, Faction>;
  nextIds: { player: number; faction: number; planet: number; unit: number; event: number };
  events: GameEvent[];
  pendingTitheChanges: PendingPlanetTitheChange[];
  pendingInformantActions: PendingPlanetInformantAction[];
  pendingArmyTransportRequests: ArmyTransportRequest[];
}


export interface GameEvent {
  id: number;
  turnNumber: number;
  kind: "COMBAT" | "MOVEMENT" | "DIPLOMACY" | "SYSTEM";
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
  spentAP: number;
  remainingAP: number;
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
}

export interface TurnResolution {
  turnNumber: number;
  validationErrors: ValidationError[];
  movement: MovementReport;
  diplomacy: DiplomacyReport;
  combat: CombatReport;
  economy: EconomyReport;
  planet: PlanetReport;
  visibility: Record<string, PlayerVisibleState>;
}
