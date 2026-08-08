import { WebSocket } from "ws";

import {
  InfoCategory,
  PlanetTag,
  PlanetWorldType,
  TitheLevel,
} from "../planetDomain";
import {
  FleetDomain,
  FleetStance,
  IntelFragmentMap,
  PlayerAlignment,
  ResourceStore,
  PlayerProductStorages,
} from "../types";

export type Role = "admin" | "player";

export interface Account {
  username: string;
  password: string;
  role: Role;
  playerId?: number;
}

export interface Session {
  token: string;
  username: string;
  role: Role;
  playerId?: number;
  expiresAt: number;
}

export interface ClientContext {
  socket: WebSocket;
  session: Session;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AddPlayerRequest {
  name: string;
  color?: string;
  canTakePlanetResources?: boolean;
  username?: string;
  password?: string;
  alignment?: PlayerAlignment;
  factionId?: number;
}

export interface AddPlanetRequest {
  name: string;
  q: number;
  r: number;
  worldType?: PlanetWorldType;
  worldTags?: PlanetTag[];
  population?: number;
  morale?: number;
  titheLevel?: TitheLevel;
  maxTitheLevel?: TitheLevel;
  tithePaid?: number;
  titheContributions?: ResourceStore;
  resourceGeneration?: ResourceStore;
  influenceValue?: number;
  visionRange?: number;
  overviewRange?: number;
  rawStock?: ResourceStore;
  productStorageByPlayerId?: PlayerProductStorages;
  infoFragments?: IntelFragmentMap;
}

export interface AddFleetRequest {
  ownerPlayerId: number;
  q: number;
  r: number;
  combatPower?: number;
  health?: number;
  influence?: number;
  actionPoints?: number;
  visionRange?: number;
  capacity?: number;
  stance?: FleetStance;
  domain?: FleetDomain;
  inventory?: ResourceStore;
}

export interface AddArmyRequest {
  ownerPlayerId: number;
  destination:
    | { kind: "PLANET"; planetId: number }
    | { kind: "FLEET"; fleetId: number };
  combatPower?: number;
  health?: number;
  influence?: number;
  visionRange?: number;
  stance?: FleetStance;
}

export interface AddFactionRequest {
  code: string;
  name: string;
  description?: string;
}

export interface UpdatePlayerRequest {
  name?: string;
  color?: string;
  canTakePlanetResources?: boolean;
  resources?: number;
  username?: string;
  password?: string;
  alignment?: PlayerAlignment;
  factionId?: number;
}

export interface UpdatePlanetRequest {
  name?: string;
  q?: number;
  r?: number;
  worldType?: PlanetWorldType;
  worldTags?: PlanetTag[];
  population?: number;
  morale?: number;
  titheLevel?: TitheLevel;
  maxTitheLevel?: TitheLevel;
  tithePaid?: number;
  titheContributions?: ResourceStore;
  resourceGeneration?: ResourceStore;
  influenceValue?: number;
  visionRange?: number;
  overviewRange?: number;
  rawStock?: ResourceStore;
  productStorageByPlayerId?: PlayerProductStorages;
  infoFragments?: IntelFragmentMap;
}


export interface UpdateFleetRequest {
  ownerPlayerId?: number;
  q?: number;
  r?: number;
  combatPower?: number;
  health?: number;
  influence?: number;
  actionPoints?: number;
  visionRange?: number;
  capacity?: number;
  stance?: FleetStance;
  domain?: FleetDomain;
  inventory?: ResourceStore;
}

export interface UpdateFactionRequest {
  name?: string;
  description?: string;
}

export type RelationType = "WAR" | "ALLIANCE";

export interface RelationRequest {
  type: RelationType;
  playerAId: number;
  playerBId: number;
}

export interface PlanetInformantRequest {
  category: InfoCategory;
}
