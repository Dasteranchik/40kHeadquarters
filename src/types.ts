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

export type GamePhase = "PLANNING" | "LOCKED" | "RESOLUTION" | "UPDATE";

export type TerrainType = "OPEN" | "NEBULA" | "OBSTACLE";

export interface Tile extends HexCoord {
  terrainType: TerrainType;
  planetId?: string;
}

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[];
}

export type ResourceStore = Partial<Record<ResourceKey, number>>;
export type IntelFragmentMap = Partial<Record<InfoCategory, number>>;

export interface Planet {
  id: string;
  position: HexCoord;
  worldType: PlanetWorldType;
  worldTags: PlanetTag[];
  population: number;
  morale: number;
  titheLevel: TitheLevel;
  titheTarget: number;
  tithePaid: number;
  resourceProduction: number;
  influenceValue: number;
  visionRange: number;
  overviewRange: number;
  rawStock: ResourceStore;
  productStorage: ResourceStore;
  infoFragments: IntelFragmentMap;
}

export type PlayerAlignment = "IMPERIAL" | "NON_IMPERIAL";

export interface Faction {
  id: string;
  name: string;
  description?: string;
}

export interface Player {
  id: string;
  name: string;
  resources: number;
  alliances: string[];
  wars: string[];
  exploredTiles: HexCoord[];
  alignment: PlayerAlignment;
  factionId: string;
  intelFragments: IntelFragmentMap;
}

export type FleetStance = "ATTACK" | "DEFENSE";
export type FleetDomain = "SPACE" | "GROUND";

export interface Fleet {
  id: string;
  ownerPlayerId: string;
  position: HexCoord;
  combatPower: number;
  health: number;
  influence: number;
  actionPoints: number;
  visionRange: number;
  capacity: number;
  stance: FleetStance;
  domain: FleetDomain;
  inventory: ResourceStore;
}

export interface PendingPlanetTitheChange {
  planetId: string;
  titheLevel: TitheLevel;
  requestedByPlayerId: string;
  applyOnTurn: number;
}

export interface PendingPlanetInformantAction {
  planetId: string;
  playerId: string;
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
  pendingTitheChanges: PendingPlanetTitheChange[];
  pendingInformantActions: PendingPlanetInformantAction[];
}

export type DiplomacyActionType = "DECLARE_WAR" | "PROPOSE_ALLIANCE";

export interface MoveFleetAction {
  id: string;
  playerId: string;
  type: "MOVE_FLEET";
  payload: {
    fleetId: string;
    path: HexCoord[];
  };
}

export interface DiplomacyAction {
  id: string;
  playerId: string;
  type: "DIPLOMACY";
  payload: {
    targetPlayerId: string;
    action: DiplomacyActionType;
  };
}

export interface SetFleetStanceAction {
  id: string;
  playerId: string;
  type: "SET_FLEET_STANCE";
  payload: {
    fleetId: string;
    stance: FleetStance;
  };
}

export type PlanetActionKind =
  | "TAKE_STOCK"
  | "RAID_STOCK"
  | "PRODUCE_RESOURCE"
  | "DEPOSIT_TO_STORAGE"
  | "TAKE_FROM_STORAGE"
  | "CREATE_PRODUCT"
  | "ECCLESIARCHY_RAISE_MORALE"
  | "INQUISITION_DEPLOY_INFORMANT"
  | "ADMINISTRATUM_SET_TITHE";

export interface PlanetAction {
  id: string;
  playerId: string;
  type: "PLANET_ACTION";
  payload: {
    planetId: string;
    kind: PlanetActionKind;
    fleetId?: string;
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
  fleetId: string;
  from: HexCoord;
  to: HexCoord;
  spentAP: number;
  remainingAP: number;
}

export interface MovementReport {
  executed: MovementExecution[];
}

export interface DiplomacyReport {
  declaredWars: Array<{ playerAId: string; playerBId: string }>;
  formedAlliances: Array<{ playerAId: string; playerBId: string }>;
}

export interface CombatDamageEvent {
  fleetId: string;
  damage: number;
  healthAfter: number;
}

export interface CombatReport {
  damageEvents: CombatDamageEvent[];
  destroyedFleetIds: string[];
}

export interface EconomyReport {
  globalIncome: number;
  playerIncome: Record<string, number>;
}

export interface PlanetEvent {
  actionId?: string;
  planetId: string;
  kind:
    | "PENDING_INFORMANT_APPLIED"
    | "PENDING_TITHE_APPLIED"
    | "TURN_GENERATION"
    | "MANUAL_GENERATION"
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
  id: string;
  ownerPlayerId: string;
  position: HexCoord;
  combatPower: number;
  health: number;
  influence: number;
  confidence: "EXACT" | "ESTIMATED";
}

export interface PlayerVisibleState {
  playerId: string;
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
