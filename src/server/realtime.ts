import { WebSocket } from "ws";

import { ClientMessage } from "../api/ws";
import { validateActions } from "../systems/actionValidator";
import {
  applyImmediatePlanetAction,
  isImmediatePlanetActionKind,
} from "../systems/planetSystem";
import { applyImmediateResourceTransfer } from "../systems/resourceTransferSystem";
import { disembarkArmy, requestArmyEmbark, respondArmyEmbark } from "../systems/armyTransportSystem";
import { tradeWithShop } from "../systems/shopSystem";
import {
  actorCanAccessItemLocation,
  copyKnowledge,
  resolveItemInventory,
  transferArtifact,
} from "../systems/itemSystem";
import { useArtifact } from "../systems/artifactEffectRegistry";
import { appendAudit } from "../systems/auditSystem";
import {
  getProcessedCommandResult,
  isCommandId,
  rememberProcessedCommand,
} from "../systems/idempotencySystem";
import { resolveTurn } from "../turn/resolveTurn";
import { Action, GameState } from "../types";
import type { AuditActor } from "../auditDomain";
import type { TurnFinishReason } from "../turnTimerDomain";
import type { TurnSnapshotPoint } from "../storage/documentDb";
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
  cancelTurnTimer?: () => void;
  startNewPlanningTimer?: () => void;
  captureTurnSnapshot?: (point: TurnSnapshotPoint, turnNumber: number) => void;
}

export interface RealtimeController {
  broadcastState: () => void;
  resolveAndBroadcastTurn: () => void;
  finishCurrentTurn: (reason: TurnFinishReason, actor?: AuditActor) => boolean;
  handleClientMessage: (context: ClientContext, message: ClientMessage) => void;
}

export function createRealtimeController(deps: RealtimeDeps): RealtimeController {
  let resolutionInProgress = false;

  function sendOperationResult(
    context: ClientContext,
    ok: boolean,
    message: string,
    commandId?: string,
    duplicate = false,
  ): void {
    send(context.socket, {
      type: "operationResult",
      ok,
      message,
      ...(commandId ? { commandId } : {}),
      ...(duplicate ? { duplicate: true } : {}),
    });
  }

  function actorKey(context: ClientContext): string {
    return context.session.role === "admin"
      ? `admin:${context.session.username}`
      : `player:${context.session.playerId ?? "unknown"}`;
  }

  function duplicateResult(
    context: ClientContext,
    commandId: string,
  ): { ok: boolean; message: string } | null {
    const previous = getProcessedCommandResult(deps.state, actorKey(context), commandId);
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) return null;
    const candidate = previous as { ok?: unknown; message?: unknown };
    if (typeof candidate.ok !== "boolean" || typeof candidate.message !== "string") return null;
    sendOperationResult(context, candidate.ok, candidate.message, commandId, true);
    return { ok: candidate.ok, message: candidate.message };
  }

  function rememberResult(
    context: ClientContext,
    commandId: string,
    result: { ok: boolean; message: string },
  ): void {
    rememberProcessedCommand(deps.state, actorKey(context), commandId, result);
    // Persist rejected as well as successful results so reconnect/retry cannot
    // turn the same logical command into a new operation after a restart.
    deps.persistDatabase();
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

  function finishCurrentTurn(
    reason: TurnFinishReason,
    actor: AuditActor = { kind: "SYSTEM", id: "turn-timer" },
  ): boolean {
    if (resolutionInProgress || deps.state.phase !== "PLANNING") return false;
    resolutionInProgress = true;
    try {
      deps.cancelTurnTimer?.();
    const ownerByFleetIdBeforeResolution = new Map<number, number>();
    const fleetNameByIdBeforeResolution = new Map<number, string>();
    for (const fleet of Object.values(deps.state.fleets)) {
      ownerByFleetIdBeforeResolution.set(fleet.id, fleet.ownerPlayerId);
      fleetNameByIdBeforeResolution.set(fleet.id, `${fleet.domain === "GROUND" ? "Army" : "Fleet"} ${fleet.id}`);
    }

    const beforeTurn = deps.state.turnNumber;
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
    for (const detection of resolution.detection) {
      for (const record of detection.detected) {
        deps.state.events.push({
          id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "DETECTION",
          message: `Detected ${record.objectKind} ${record.objectId} (${record.confidence})`,
          playerIds: [record.playerId],
        });
      }
    }
    for (const shipwreckId of resolution.combat.createdShipwreckIds) {
      const wreck = deps.state.shipwrecks[shipwreckId];
      if (!wreck) continue;
      const playerIds = wreck.sourceUnitIds
        .map((unitId) => ownerByFleetIdBeforeResolution.get(unitId))
        .filter((id): id is number => id !== undefined);
      deps.state.events.push({
        id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "SHIPWRECK",
        message: `Shipwreck ${shipwreckId} formed at [${wreck.position.q},${wreck.position.r}]`,
        playerIds: [...new Set(playerIds)],
      });
      appendAudit(deps.state, {
        actor: { kind: "SYSTEM", id: "combat-resolution" },
        operation: "CREATE_SHIPWRECK",
        entityType: "SHIPWRECK",
        entityId: shipwreckId,
        after: wreck,
      });
    }
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
    deps.persistDatabase();
    deps.startNewPlanningTimer?.();

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
    return true;
    } finally {
      resolutionInProgress = false;
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

    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Valid commandId is required"); return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const result = applyImmediateResourceTransfer(
      deps.state,
      {
        role: context.session.role,
        playerId: context.session.playerId,
      },
      message.payload,
    );

    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
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

  function applyArmyTransport(context: ClientContext, message: ClientMessage): void {
    if (deps.state.phase !== "PLANNING" || !context.session.playerId) return;
    if (
      message.type !== "requestArmyEmbark"
      && message.type !== "respondArmyEmbark"
      && message.type !== "disembarkArmy"
    ) return;
    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Valid commandId is required"); return;
    }
    if (duplicateResult(context, message.commandId)) return;
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
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) {
      deps.readyPlayers.delete(playerId);
      deps.persistDatabase();
      broadcastState();
    }
  }

  function applyShopTrade(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "shopTrade") return;
    const commandId = message.payload.commandId;
    if (deps.state.phase !== "PLANNING" || !isCommandId(commandId)) {
      sendOperationResult(context, false, "Shop trade requires PLANNING and a valid commandId", commandId); return;
    }
    if (duplicateResult(context, commandId)) return;
    const before = structuredClone(message.payload.shop.kind === "PLANET"
      ? deps.state.planets[message.payload.shop.id]?.shop
      : deps.state.stations[message.payload.shop.id]?.shop);
    const result = tradeWithShop(deps.state, {
      role: context.session.role,
      playerId: context.session.playerId,
    }, message.payload);
    rememberResult(context, commandId, result);
    sendOperationResult(context, result.ok, result.message, commandId);
    if (!result.ok) { deps.persistDatabase(); return; }
    appendAudit(deps.state, {
      actor: context.session.role === "admin"
        ? { kind: "ADMIN", account: context.session.username }
        : { kind: "PLAYER", playerId: context.session.playerId! },
      operation: Object.keys(result.disappeared).length > 0 ? "SHOP_TRADE_DISAPPEARING" : "SHOP_TRADE",
      entityType: message.payload.shop.kind,
      entityId: message.payload.shop.id,
      commandId,
      before,
      after: message.payload,
    });
    if (context.session.playerId) {
      deps.readyPlayers.delete(context.session.playerId);
      deps.state.events.push({
        id: deps.state.nextIds.event++, turnNumber: deps.state.turnNumber, kind: "SHOP",
        message: result.message, playerIds: [context.session.playerId],
      });
    }
    deps.persistDatabase(); broadcastState();
  }

  function applyItemTransfer(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "itemTransfer") return;
    if (deps.state.phase !== "PLANNING" || !isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Item transfer requires PLANNING and a valid commandId", message.commandId); return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const actor = { role: context.session.role, playerId: context.session.playerId } as const;
    const result = message.item.kind === "ARTIFACT"
      ? transferArtifact(deps.state, actor, message.item.artifactId, message.source, message.target)
      : copyKnowledge(deps.state, actor, message.item.knowledge, message.source, message.target);
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (!result.ok) { deps.persistDatabase(); return; }
    if (result.changed) appendAudit(deps.state, {
      actor: context.session.role === "admin"
        ? { kind: "ADMIN", account: context.session.username }
        : { kind: "PLAYER", playerId: context.session.playerId! },
      operation: message.item.kind === "ARTIFACT" ? "TRANSFER_ARTIFACT" : "COPY_KNOWLEDGE",
      entityType: message.item.kind,
      entityId: message.item.kind === "ARTIFACT" ? message.item.artifactId : message.item.knowledge,
      commandId: message.commandId,
      before: message.source,
      after: message.target,
    });
    if (context.session.playerId) deps.readyPlayers.delete(context.session.playerId);
    deps.persistDatabase(); broadcastState();
  }

  function applyArtifactUse(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "artifactUse") return;
    if (deps.state.phase !== "PLANNING" || !isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Artifact use requires PLANNING and a valid commandId", message.commandId); return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const artifact = deps.state.artifacts[message.artifactId];
    const actor = { role: context.session.role, playerId: context.session.playerId } as const;
    const result = artifact && actorCanAccessItemLocation(deps.state, actor, artifact.owner)
      ? useArtifact(deps.state, actor, message.artifactId)
      : { ok: false, consumed: false, message: "Artifact access denied" };
    if (result.ok && result.consumed && artifact) {
      const inventory = resolveItemInventory(deps.state, artifact.owner);
      if (inventory) inventory.artifactIds = inventory.artifactIds.filter((id) => id !== artifact.id);
      delete deps.state.artifacts[artifact.id];
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) appendAudit(deps.state, {
      actor: context.session.role === "admin"
        ? { kind: "ADMIN", account: context.session.username }
        : { kind: "PLAYER", playerId: context.session.playerId! },
      operation: "USE_ARTIFACT", entityType: "ARTIFACT", entityId: message.artifactId,
      commandId: message.commandId, before: artifact, after: result,
    });
    deps.persistDatabase(); if (result.ok) broadcastState();
  }

  function handleClientMessage(context: ClientContext, message: ClientMessage): void {
    applySubmitAction(context, message);
    applyRemoveAction(context, message);
    applyResourceTransfer(context, message);
    applySetFleetAllyVision(context, message);
    applyReady(context, message);
    applyArmyTransport(context, message);
    applyShopTrade(context, message);
    applyItemTransfer(context, message);
    applyArtifactUse(context, message);
    applyEndTurn(context, message);
  }

  return {
    broadcastState,
    resolveAndBroadcastTurn,
    finishCurrentTurn,
    handleClientMessage,
  };
}
