import { WebSocket } from "ws";

import { ClientMessage } from "../api/ws";
import { validateActions } from "../systems/actionValidator";
import {
  applyImmediatePlanetAction,
  isImmediatePlanetActionKind,
} from "../systems/planetSystem";
import { applyImmediateResourceTransfer } from "../systems/resourceTransferSystem";
import { disembarkArmy, requestArmyEmbark, respondArmyEmbark } from "../systems/armyTransportSystem";
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
  readyPlayers: Set<number>;
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
    const ownerByFleetIdBeforeResolution = new Map<number, number>();
    const fleetNameByIdBeforeResolution = new Map<number, string>();
    for (const fleet of Object.values(deps.state.fleets)) {
      ownerByFleetIdBeforeResolution.set(fleet.id, fleet.ownerPlayerId);
      fleetNameByIdBeforeResolution.set(fleet.id, `${fleet.domain === "GROUND" ? "Army" : "Fleet"} ${fleet.id}`);
    }

    const resolution = resolveTurn(deps.state, [...deps.pendingActions.values()]);
    for (const movement of resolution.movement.executed) {
      const ownerId = ownerByFleetIdBeforeResolution.get(movement.fleetId);
      if (!ownerId) continue;
      deps.state.events.push({
        id: deps.state.nextIds.event++,
        turnNumber: resolution.turnNumber,
        kind: "MOVEMENT",
        message: `${fleetNameByIdBeforeResolution.get(movement.fleetId) ?? `Unit ${movement.fleetId}`} moved [${movement.from.q},${movement.from.r}] → [${movement.to.q},${movement.to.r}]`,
        playerIds: [ownerId],
      });
    }
    for (const combat of resolution.combat.damageEvents) {
      const targetOwnerId = ownerByFleetIdBeforeResolution.get(combat.fleetId);
      const attackerOwnerIds = combat.attackerFleetIds
        .map((fleetId) => ownerByFleetIdBeforeResolution.get(fleetId))
        .filter((ownerId): ownerId is number => ownerId !== undefined);
      const playerIds = [...new Set([...(targetOwnerId ? [targetOwnerId] : []), ...attackerOwnerIds])];
      if (playerIds.length === 0) continue;
      const destroyed = resolution.combat.destroyedFleetIds.includes(combat.fleetId);
      deps.state.events.push({
        id: deps.state.nextIds.event++,
        turnNumber: resolution.turnNumber,
        kind: "COMBAT",
        message: `${fleetNameByIdBeforeResolution.get(combat.fleetId) ?? `Unit ${combat.fleetId}`} received ${combat.damage} damage${destroyed ? " and was destroyed" : `; HP ${combat.healthAfter}`}`,
        playerIds,
      });
    }
    for (const relation of resolution.diplomacy.declaredWars) {
      deps.state.events.push({
        id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "DIPLOMACY",
        message: `Players ${relation.playerAId} and ${relation.playerBId} are now at war`,
        playerIds: [relation.playerAId, relation.playerBId],
      });
    }
    for (const relation of resolution.diplomacy.formedAlliances) {
      deps.state.events.push({
        id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "DIPLOMACY",
        message: `Players ${relation.playerAId} and ${relation.playerBId} formed an alliance`,
        playerIds: [relation.playerAId, relation.playerBId],
      });
    }
    deps.state.events = deps.state.events.slice(-1000);
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

    if (
      action.type === "PLANET_ACTION"
      && isImmediatePlanetActionKind(action.payload.kind)
    ) {
      const validation = validateActions(deps.state, [action]);
      const validationError = validation.errors[0];
      if (validationError) {
        sendOperationResult(context, false, validationError.reason);
        return;
      }

      const result = applyImmediatePlanetAction(deps.state, action);
      sendOperationResult(context, result.ok, result.message);
      if (!result.ok) {
        return;
      }

      deps.readyPlayers.delete(action.playerId);
      deps.persistDatabase();
      broadcastState();
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

    const result = applyImmediateResourceTransfer(
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

  function applySetFleetAllyVision(
    context: ClientContext,
    message: ClientMessage,
  ): void {
    if (message.type !== "setFleetAllyVision") {
      return;
    }

    if (deps.state.phase !== "PLANNING" || context.session.role !== "player") {
      sendOperationResult(context, false, "Fleet vision can be changed only during PLANNING");
      return;
    }

    const playerId = context.session.playerId;
    const fleet = deps.state.fleets[message.fleetId];
    if (!playerId || !fleet || fleet.ownerPlayerId !== playerId) {
      sendOperationResult(context, false, "Fleet does not belong to player");
      return;
    }

    if (typeof message.enabled !== "boolean") {
      sendOperationResult(context, false, "enabled must be a boolean");
      return;
    }

    fleet.shareVisionWithAllies = message.enabled;
    deps.readyPlayers.delete(playerId);
    deps.persistDatabase();
    sendOperationResult(
      context,
      true,
      message.enabled ? "Fleet vision shared with allies" : "Fleet vision sharing disabled",
    );
    broadcastState();
  }

  function applyEndTurn(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "endTurn") {
      return;
    }

    if (context.session.role !== "admin" || deps.state.phase !== "PLANNING") {
      return;
    }

    resolveAndBroadcastTurn();
  }

  function applyArmyTransport(context: ClientContext, message: ClientMessage): void {
    if (deps.state.phase !== "PLANNING" || !context.session.playerId) return;
    const playerId = context.session.playerId;
    const actions = deps.pendingActions.values();
    let result: { ok: boolean; message: string } | null = null;
    switch (message.type) {
      case "requestArmyEmbark":
        result = requestArmyEmbark(deps.state, actions, playerId, message.armyId, message.fleetId);
        break;
      case "respondArmyEmbark":
        result = respondArmyEmbark(deps.state, actions, playerId, message.requestId, message.accept);
        break;
      case "disembarkArmy":
        result = disembarkArmy(deps.state, actions, playerId, message.armyId);
        break;
      default:
        return;
    }
    sendOperationResult(context, result.ok, result.message);
    if (result.ok) {
      deps.readyPlayers.delete(playerId);
      deps.persistDatabase();
      broadcastState();
    }
  }

  function handleClientMessage(context: ClientContext, message: ClientMessage): void {
    applySubmitAction(context, message);
    applyRemoveAction(context, message);
    applyResourceTransfer(context, message);
    applySetFleetAllyVision(context, message);
    applyReady(context, message);
    applyArmyTransport(context, message);
    applyEndTurn(context, message);
  }

  return {
    broadcastState,
    resolveAndBroadcastTurn,
    handleClientMessage,
  };
}
