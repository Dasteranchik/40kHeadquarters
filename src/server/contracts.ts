import { WebSocket } from "ws";

import {
  InfoCategory,
  PlanetTag,
  PlanetWorldType,
  TitheLevel,
} from "../planetDomain";
import type { ProductConversionRates } from "../planetDomain";
import {
  FleetDomain,
  FleetStance,
  IntelFragmentMap,
  PlayerAlignment,
  ResourceStore,
  PlayerProductStorages,
} from "../types";
import type { UnitTag } from "../unitDomain";
import type { WarpVisibility } from "../navigationDomain";

export type Role = "admin" | "player";

export interface Account {
  username: string;
  passwordHash: string;
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

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AddPlayerRequest {
  name: string;
  color?: string;
  canTakePlanetResources?: boolean;
  username?: string;
  password?: string;
  alignment?: PlayerAlignment;
  factionId?: number;
  manualNavigator?: boolean;
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
  rawStock?: ResourceStore;
  productStorageByPlayerId?: PlayerProductStorages;
  infoFragments?: IntelFragmentMap;
  secretStorage?: unknown;
}

export interface AddFleetRequest {
  ownerPlayerId: number;
  q: number;
  r: number;
  combatPower?: number;
  health?: number;
  influence?: number;
  movementPoints?: number;
  maxMovementPoints?: number;
  isNavigator?: boolean;
  warpVisibility?: WarpVisibility;
  visionRange?: number;
  capacity?: number;
  stance?: FleetStance;
  domain?: FleetDomain;
  inventory?: ResourceStore;
  tags?: UnitTag[];
  unitVariantId?: number | null;
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
  unitVariantId?: number | null;
  stance?: FleetStance;
}

export interface AddFactionRequest {
  code: string;
  name: string;
  description?: string;
  isChaos?: boolean;
  isAdministratum?: boolean;
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
  manualNavigator?: boolean;
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
  rawStock?: ResourceStore;
  productStorageByPlayerId?: PlayerProductStorages;
  infoFragments?: IntelFragmentMap;
  secretStorage?: unknown;
}


export interface UpdateFleetRequest {
  ownerPlayerId?: number;
  q?: number;
  r?: number;
  combatPower?: number;
  health?: number;
  influence?: number;
  movementPoints?: number;
  maxMovementPoints?: number;
  isNavigator?: boolean;
  warpVisibility?: WarpVisibility;
  visionRange?: number;
  capacity?: number;
  stance?: FleetStance;
  domain?: FleetDomain;
  inventory?: ResourceStore;
  tags?: UnitTag[];
  unitVariantId?: number | null;
}

export interface UpdateFactionRequest {
  name?: string;
  description?: string;
  isChaos?: boolean;
  isAdministratum?: boolean;
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

export interface UpdateProductConversionRatesRequest {
  rates: ProductConversionRates;
}
