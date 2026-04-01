import { Action, GameState, TurnResolution } from "../types";

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

export type ClientMessage =
  | SubmitActionMessage
  | RemoveActionMessage
  | PlayerReadyMessage
  | EndTurnMessage;

export interface StateUpdateMessage {
  type: "stateUpdate";
  state: GameState;
}

export interface TurnResolvedMessage {
  type: "turnResolved";
  changes: TurnResolution;
}

export type ServerMessage = StateUpdateMessage | TurnResolvedMessage;