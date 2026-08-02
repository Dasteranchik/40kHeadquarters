import type { ResourceKey } from "../planetDomain";
import { Action, GameState, HexCoord, TurnResolution } from "../types";

export interface SubmitActionMessage {
  type: "submitAction";
  action: Action;
}

export interface RemoveActionMessage {
  type: "removeAction";
  actionId: string;
}

export interface PlayerReadyMessage {
  type: "playerReady";
}

export interface EndTurnMessage {
  type: "endTurn";
}

export interface SetFleetAllyVisionMessage {
  type: "setFleetAllyVision";
  fleetId: number;
  enabled: boolean;
}

export type ResourceEndpointKind = "FLEET" | "PLANET_STORAGE";

export interface ResourceEndpointRef {
  kind: ResourceEndpointKind;
  id: string;
}

export interface ResourceTransferPayload {
  from: ResourceEndpointRef;
  to: ResourceEndpointRef;
  resourceKey: ResourceKey;
  amount: number;
}

export interface ResourceTransferMessage {
  type: "resourceTransfer";
  payload: ResourceTransferPayload;
}

export interface RequestArmyEmbarkMessage {
  type: "requestArmyEmbark";
  armyId: number;
  fleetId: number;
}

export interface RespondArmyEmbarkMessage {
  type: "respondArmyEmbark";
  requestId: string;
  accept: boolean;
}

export interface DisembarkArmyMessage {
  type: "disembarkArmy";
  armyId: number;
}

export type ClientMessage =
  | SubmitActionMessage
  | RemoveActionMessage
  | PlayerReadyMessage
  | EndTurnMessage
  | SetFleetAllyVisionMessage
  | ResourceTransferMessage
  | RequestArmyEmbarkMessage
  | RespondArmyEmbarkMessage
  | DisembarkArmyMessage;

export interface PlannedMovePreview {
  fleetId: number;
  ownerPlayerId: number;
  path: HexCoord[];
  projectedPosition: HexCoord;
}

export interface PlanningSnapshot {
  movePreviews: PlannedMovePreview[];
}

export interface StateUpdateMessage {
  type: "stateUpdate";
  state: GameState;
  planning: PlanningSnapshot;
}

export interface TurnResolvedMessage {
  type: "turnResolved";
  changes: TurnResolution;
}

export interface OperationResultMessage {
  type: "operationResult";
  ok: boolean;
  message: string;
}

export type ServerMessage =
  | StateUpdateMessage
  | TurnResolvedMessage
  | OperationResultMessage;
