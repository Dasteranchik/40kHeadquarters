import { WebSocket } from "ws";

import { FleetStance } from "../types";

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
}

export interface AddPlanetRequest {
  id: string;
  q: number;
  r: number;
  resourceProduction: number;
  influenceValue: number;
  visionRange?: number;
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
}

export interface UpdatePlayerRequest {
  name?: string;
  resources?: number;
  username?: string;
  password?: string;
}

export interface UpdatePlanetRequest {
  q?: number;
  r?: number;
  resourceProduction?: number;
  influenceValue?: number;
  visionRange?: number;
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
}

export type RelationType = "WAR" | "ALLIANCE";

export interface RelationRequest {
  type: RelationType;
  playerAId: string;
  playerBId: string;
}