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

export interface Planet {
  id: string;
  position: HexCoord;
  resourceProduction: number;
  influenceValue: number;
  visionRange: number;
}

export interface Player {
  id: string;
  name: string;
  resources: number;
  alliances: string[];
  wars: string[];
  exploredTiles: HexCoord[];
}

export type FleetStance = "ATTACK" | "DEFENSE";

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
}

export interface GameState {
  gameId: string;
  turnNumber: number;
  phase: GamePhase;
  map: MapState;
  players: Record<string, Player>;
  fleets: Record<string, Fleet>;
  planets: Record<string, Planet>;
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

export type Action = MoveFleetAction | DiplomacyAction | SetFleetStanceAction;

export interface ValidationError {
  actionId: string;
  reason: string;
}

export interface ValidatedTurnActions {
  moveActions: MoveFleetAction[];
  diplomacyActions: DiplomacyAction[];
  stanceActions: SetFleetStanceAction[];
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
  visibility: Record<string, PlayerVisibleState>;
}