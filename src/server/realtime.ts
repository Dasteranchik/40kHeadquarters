import type { WebSocket } from "ws";

import type { ClientMessage } from "../api/ws";
import { validateActions } from "../systems/actionValidator";
import {
  applyImmediatePlanetAction,
  isImmediatePlanetActionKind,
} from "../systems/planetSystem";
import { appendAudit } from "../systems/auditSystem";
import {
  isCommandId,
} from "../systems/idempotencySystem";
import { resolveTurn } from "../turn/resolveTurn";
import type { Action, GameState } from "../types";
import type { AuditActor } from "../auditDomain";
import type { TurnFinishReason } from "../turnTimerDomain";
import type { TurnSnapshotPoint } from "../storage/documentDb";
import { applyImmediateDiplomacy } from "./immediateDiplomacy";
import type { ClientContext } from "./contracts";
import { send } from "./transport";
import {
  buildPlanningForSession,
  buildResolutionForSession,
  buildStateForSession,
} from "./visibility";
import { createOperationResultManager } from "./realtime/operationResults";
import { createImmediateCommandHandlers } from "./realtime/immediateCommands";
import {
  appendTurnResolutionEvents,
  captureUnitResolutionContext,
} from "./realtime/turnResolutionEvents";

export interface RealtimeDeps {
  state: GameState;
  pendingActions: Map<string, Action>;
  pendingAllianceProposals: Set<string>;
  readyPlayers: Set<number>;
  clients: Map<WebSocket, ClientContext>;
  persistDatabase: () => void;
  cancelTurnTimer?: () => void;
  startNewPlanningTimer?: () => void;
  captureTurnSnapshot?: (point: TurnSnapshotPoint, turnNumber: number) => void;
  onResolutionComplete?: (durationMs: number, succeeded: boolean) => void;
  onCommandError?: (input: {
    commandId?: string;
    playerId?: number;
    username: string;
    message: string;
  }) => void;
}

export interface RealtimeController {
  broadcastState: () => void;
  resolveAndBroadcastTurn: () => void;
  finishCurrentTurn: (reason: TurnFinishReason, actor?: AuditActor) => boolean;
  handleClientMessage: (context: ClientContext, message: ClientMessage) => void;
}

export function createRealtimeController(deps: RealtimeDeps): RealtimeController {
  let resolutionInProgress = false;
  const operationResults = createOperationResultManager({
    state: deps.state,
    persistDatabase: deps.persistDatabase,
    onCommandError: deps.onCommandError,
  });
  const { sendOperationResult, duplicateResult, rememberResult } = operationResults;

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

  const immediateCommands = createImmediateCommandHandlers({
    state: deps.state,
    pendingActions: deps.pendingActions,
    readyPlayers: deps.readyPlayers,
    persistDatabase: deps.persistDatabase,
    broadcastState,
    operationResults,
  });

  function finishCurrentTurn(
    reason: TurnFinishReason,
    actor: AuditActor = { kind: "SYSTEM", id: "turn-timer" },
  ): boolean {
    if (resolutionInProgress || deps.state.phase !== "PLANNING") return false;
    resolutionInProgress = true;
    const resolutionStartedAt = Date.now();
    let resolutionSucceeded = false;
    try {
      deps.cancelTurnTimer?.();
      const unitResolutionContext = captureUnitResolutionContext(deps.state);

      const beforeTurn = deps.state.turnNumber;
      const resolution = resolveTurn(deps.state, [...deps.pendingActions.values()]);
      appendTurnResolutionEvents(deps.state, resolution, unitResolutionContext);
      appendAudit(deps.state, {
        actor,
        operation: "END_TURN",
        entityType: "TURN",
        entityId: beforeTurn,
        before: { turnNumber: beforeTurn, reason },
        after: { turnNumber: deps.state.turnNumber, reason },
      });
      deps.captureTurnSnapshot?.("END", beforeTurn);
      deps.state.events = deps.state.events.slice(-1000);
      deps.pendingActions.clear();
      deps.pendingAllianceProposals.clear();
      deps.readyPlayers.clear();
      if (deps.startNewPlanningTimer) deps.startNewPlanningTimer();
      else deps.persistDatabase();

      for (const context of deps.clients.values()) {
        send(context.socket, {
          type: "turnResolved",
          changes: buildResolutionForSession(
            context.session,
            deps.state,
            resolution,
            unitResolutionContext.ownerByFleetId,
          ),
        });
      }

      broadcastState();
      resolutionSucceeded = true;
      return true;
    } finally {
      resolutionInProgress = false;
      deps.onResolutionComplete?.(Date.now() - resolutionStartedAt, resolutionSucceeded);
    }
  }

  function resolveAndBroadcastTurn(): void {
    finishCurrentTurn("ADMIN_OVERRIDE", { kind: "SYSTEM", id: "legacy-end-turn" });
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
      const commandId = action.id;
      if (!isCommandId(commandId)) {
        sendOperationResult(context, false, "Immediate action requires a valid action.id", commandId);
        return;
      }
      if (duplicateResult(context, commandId)) return;
      const validation = validateActions(deps.state, [action]);
      const validationError = validation.errors[0];
      if (validationError) {
        const result = { ok: false, message: validationError.reason };
        rememberResult(context, commandId, result);
        sendOperationResult(context, false, validationError.reason, commandId);
        return;
      }

      const result = applyImmediatePlanetAction(deps.state, action);
      rememberResult(context, commandId, result);
      sendOperationResult(context, result.ok, result.message, commandId);
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

    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Valid commandId is required"); return;
    }
    if (duplicateResult(context, message.commandId)) return;
    if (deps.state.phase !== "PLANNING" || context.session.role !== "player") {
      sendOperationResult(context, false, "Fleet vision can be changed only during PLANNING");
      rememberResult(context, message.commandId, { ok: false, message: "Fleet vision can be changed only during PLANNING" }); return;
    }

    const playerId = context.session.playerId;
    const fleet = deps.state.fleets[message.fleetId];
    if (!playerId || !fleet || fleet.ownerPlayerId !== playerId) {
      sendOperationResult(context, false, "Fleet does not belong to player");
      rememberResult(context, message.commandId, { ok: false, message: "Fleet does not belong to player" }); return;
    }

    if (typeof message.enabled !== "boolean") {
      sendOperationResult(context, false, "enabled must be a boolean");
      rememberResult(context, message.commandId, { ok: false, message: "enabled must be a boolean" }); return;
    }

    fleet.shareVisionWithAllies = message.enabled;
    deps.readyPlayers.delete(playerId);
    deps.persistDatabase();
    sendOperationResult(
      context,
      true,
      message.enabled ? "Fleet vision shared with allies" : "Fleet vision sharing disabled",
      message.commandId,
    );
    rememberResult(context, message.commandId, {
      ok: true,
      message: message.enabled ? "Fleet vision shared with allies" : "Fleet vision sharing disabled",
    });
    broadcastState();
  }

  function applyEndTurn(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "endTurn") {
      return;
    }

    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Admin endTurn requires a valid commandId");
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    if (context.session.role !== "admin" || deps.state.phase !== "PLANNING") {
      const result = { ok: false, message: "Admin endTurn requires admin role and PLANNING" };
      rememberResult(context, message.commandId, result);
      sendOperationResult(context, false, result.message, message.commandId);
      return;
    }

    const completed = finishCurrentTurn("ADMIN_OVERRIDE", {
      kind: "ADMIN",
      account: context.session.username,
    });
    const result = completed
      ? { ok: true, message: "Turn resolved" }
      : { ok: false, message: "Turn resolution is already running" };
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
  }

  function handleClientMessage(context: ClientContext, message: ClientMessage): void {
    applySubmitAction(context, message);
    applyRemoveAction(context, message);
    immediateCommands.applyResourceTransfer(context, message);
    applySetFleetAllyVision(context, message);
    applyReady(context, message);
    immediateCommands.applyArmyTransport(context, message);
    immediateCommands.applyShopTrade(context, message);
    immediateCommands.applyItemTransfer(context, message);
    immediateCommands.applyArtifactUse(context, message);
    immediateCommands.applyFuelConversion(context, message);
    immediateCommands.applyOpenSecretStorage(context, message);
    immediateCommands.applyAdministratum(context, message);
    applyEndTurn(context, message);
  }

  return {
    broadcastState,
    resolveAndBroadcastTurn,
    finishCurrentTurn,
    handleClientMessage,
  };
}
