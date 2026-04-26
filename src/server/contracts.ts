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
} from "../types";

export type Role = "admin" | "player";

export interface Account {
  username: string;
  password: string;
  role: Role;
  playerId?: string;
}

export interface Session {
  token: string;
  username: string;
  role: Role;
  playerId?: string;
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
  id: string;
  name: string;
  username?: string;
  password?: string;
  alignment?: PlayerAlignment;
  factionId?: string;
}

export interface AddPlanetRequest {
  id: string;
  q: number;
  r: number;
  worldType?: PlanetWorldType;
  worldTags?: PlanetTag[];
  population?: number;
  morale?: number;
  titheLevel?: TitheLevel;
  tithePaid?: number;
  influenceValue?: number;
  visionRange?: number;
  overviewRange?: number;
  rawStock?: ResourceStore;
  productStorage?: ResourceStore;
  infoFragments?: IntelFragmentMap;
}

export interface AddFleetRequest {
  id: string;
  ownerPlayerId: string;
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

export interface AddFactionRequest {
  id: string;
  name: string;
  description?: string;
}

export interface UpdatePlayerRequest {
  name?: string;
  resources?: number;
  username?: string;
  password?: string;
  alignment?: PlayerAlignment;
  factionId?: string;
}

export interface UpdatePlanetRequest {
  q?: number;
  r?: number;
  worldType?: PlanetWorldType;
  worldTags?: PlanetTag[];
  population?: number;
  morale?: number;
  titheLevel?: TitheLevel;
  tithePaid?: number;
  influenceValue?: number;
  visionRange?: number;
  overviewRange?: number;
  rawStock?: ResourceStore;
  productStorage?: ResourceStore;
  infoFragments?: IntelFragmentMap;
}

export interface UpdateFleetRequest {
  ownerPlayerId?: string;
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
  playerAId: string;
  playerBId: string;
}

export interface PlanetInformantRequest {
  category: InfoCategory;
}
