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

export type ClientMessage =
  | SubmitActionMessage
  | RemoveActionMessage
  | PlayerReadyMessage
  | EndTurnMessage
  | ResourceTransferMessage;

export interface PlannedMovePreview {
  fleetId: string;
  ownerPlayerId: string;
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
