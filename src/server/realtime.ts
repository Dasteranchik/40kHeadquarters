import { WebSocket } from "ws";

import { ClientMessage } from "../api/ws";
import { applyPlanningResourceTransfer } from "../systems/resourceTransferSystem";
import { resolveTurn } from "../turn/resolveTurn";
import { Action, GameState } from "../types";
import { applyImmediateDiplomacy } from "./immediateDiplomacy";
import { ClientContext } from "./contracts";
import { send } from "./transport";
import {
  buildPlanningForSession,
  buildResolutionForSession,
  buildStateForSession,
} from "./visibility";

export interface RealtimeDeps {
  state: GameState;
  pendingActions: Map<string, Action>;
  pendingAllianceProposals: Set<string>;
  readyPlayers: Set<string>;
  clients: Map<WebSocket, ClientContext>;
  persistDatabase: () => void;
}

export interface RealtimeController {
  broadcastState: () => void;
  resolveAndBroadcastTurn: () => void;
  handleClientMessage: (context: ClientContext, message: ClientMessage) => void;
}

export function createRealtimeController(deps: RealtimeDeps): RealtimeController {
  function sendOperationResult(
    context: ClientContext,
    ok: boolean,
    message: string,
  ): void {
    send(context.socket, {
      type: "operationResult",
      ok,
      message,
    });
  }

  function broadcastState(): void {
    for (const context of deps.clients.values()) {
      send(context.socket, {
        type: "stateUpdate",
        state: buildStateForSession(context.session, deps.state),
        planning: buildPlanningForSession(
          context.session,
          deps.state,
          deps.pendingActions.values(),
        ),
      });
    }
  }

  function resolveAndBroadcastTurn(): void {
    const ownerByFleetIdBeforeResolution = new Map<string, string>();
    for (const fleet of Object.values(deps.state.fleets)) {
      ownerByFleetIdBeforeResolution.set(fleet.id, fleet.ownerPlayerId);
    }

    const resolution = resolveTurn(deps.state, [...deps.pendingActions.values()]);
    deps.pendingActions.clear();
    deps.pendingAllianceProposals.clear();
    deps.readyPlayers.clear();
    deps.persistDatabase();

    for (const context of deps.clients.values()) {
      send(context.socket, {
        type: "turnResolved",
        changes: buildResolutionForSession(
          context.session,
          deps.state,
          resolution,
          ownerByFleetIdBeforeResolution,
        ),
      });
    }

    broadcastState();
  }

  function sanitizeActionForContext(action: Action, context: ClientContext): Action | null {
    if (context.session.role === "admin") {
      return action;
    }

    const playerId = context.session.playerId;
    if (!playerId || action.playerId !== playerId) {
      return null;
    }

    return action;
  }

  function applySubmitAction(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "submitAction") {
      return;
    }

    if (deps.state.phase !== "PLANNING") {
      return;
    }

    const action = sanitizeActionForContext(message.action, context);
    if (!action) {
      return;
    }

    if (action.type === "DIPLOMACY") {
      deps.readyPlayers.delete(action.playerId);
      if (applyImmediateDiplomacy(deps.state, deps.pendingAllianceProposals, action)) {
        deps.persistDatabase();
        broadcastState();
      }
      return;
    }

    if (action.type === "MOVE_FLEET") {
      for (const [pendingActionId, pendingAction] of deps.pendingActions.entries()) {
        if (
          pendingAction.type === "MOVE_FLEET" &&
          pendingAction.playerId === action.playerId &&
          pendingAction.payload.fleetId === action.payload.fleetId
        ) {
          deps.pendingActions.delete(pendingActionId);
        }
      }
    }

    if (action.type === "SET_FLEET_STANCE") {
      for (const [pendingActionId, pendingAction] of deps.pendingActions.entries()) {
        if (
          pendingAction.type === "SET_FLEET_STANCE" &&
          pendingAction.playerId === action.playerId &&
          pendingAction.payload.fleetId === action.payload.fleetId
        ) {
          deps.pendingActions.delete(pendingActionId);
        }
      }
    }

    deps.pendingActions.set(action.id, action);
    if (action.playerId) {
      deps.readyPlayers.delete(action.playerId);
    }
    broadcastState();
  }

  function applyRemoveAction(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "removeAction") {
      return;
    }

    if (deps.state.phase !== "PLANNING") {
      return;
    }

    const action = deps.pendingActions.get(message.actionId);
    if (!action) {
      return;
    }

    if (context.session.role !== "admin" && action.playerId !== context.session.playerId) {
      return;
    }

    deps.pendingActions.delete(message.actionId);
    if (action.playerId) {
      deps.readyPlayers.delete(action.playerId);
    }
    broadcastState();
  }

  function applyResourceTransfer(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "resourceTransfer") {
      return;
    }

    if (deps.state.phase !== "PLANNING") {
      sendOperationResult(
        context,
        false,
        "Resource transfers are available only in PLANNING phase",
      );
      return;
    }

    const result = applyPlanningResourceTransfer(
      deps.state,
      {
        role: context.session.role,
        playerId: context.session.playerId,
      },
      message.payload,
    );

    sendOperationResult(context, result.ok, result.message);
    if (!result.ok) {
      return;
    }

    if (context.session.playerId) {
      deps.readyPlayers.delete(context.session.playerId);
    }
    deps.persistDatabase();
    broadcastState();
  }

  function applyReady(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "playerReady") {
      return;
    }

    if (deps.state.phase !== "PLANNING") {
      return;
    }

    if (context.session.playerId) {
      deps.readyPlayers.add(context.session.playerId);
    }
  }

  function applyEndTurn(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "endTurn") {
      return;
    }

    if (context.session.role !== "admin" || deps.state.phase !== "PLANNING") {
      return;
    }

    deps.state.phase = "LOCKED";
    broadcastState();

    deps.state.phase = "RESOLUTION";
    resolveAndBroadcastTurn();
  }

  function handleClientMessage(context: ClientContext, message: ClientMessage): void {
    applySubmitAction(context, message);
    applyRemoveAction(context, message);
    applyResourceTransfer(context, message);
    applyReady(context, message);
    applyEndTurn(context, message);
  }

  return {
    broadcastState,
    resolveAndBroadcastTurn,
    handleClientMessage,
  };
}
