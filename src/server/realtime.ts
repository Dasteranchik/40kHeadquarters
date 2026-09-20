import { WebSocket } from "ws";

import { ClientMessage } from "../api/ws";
import { validateActions } from "../systems/actionValidator";
import {
  applyImmediatePlanetAction,
  isImmediatePlanetActionKind,
} from "../systems/planetSystem";
import { applyImmediateResourceTransfer } from "../systems/resourceTransferSystem";
import { convertFuelToMovement } from "../systems/movementPointSystem";
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
  isCommandId,
} from "../systems/idempotencySystem";
import { resolveTurn } from "../turn/resolveTurn";
import { Action, GameState } from "../types";
import type { AuditActor } from "../auditDomain";
import type { TurnFinishReason } from "../turnTimerDomain";
import type { TurnSnapshotPoint } from "../storage/documentDb";
import { applyImmediateDiplomacy } from "./immediateDiplomacy";
import { ClientContext } from "./contracts";
import { send } from "./transport";
import { openSecretStorage } from "../systems/secretStorageSystem";
import { proposeTithe, reportWorld } from "../systems/administratumSystem";
import {
  buildPlanningForSession,
  buildResolutionForSession,
  buildStateForSession,
} from "./visibility";
import { createOperationResultManager } from "./realtime/operationResults";

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
  const { sendOperationResult, duplicateResult, getPreviousResult, rememberResult } =
    createOperationResultManager({
      state: deps.state,
      persistDatabase: deps.persistDatabase,
      onCommandError: deps.onCommandError,
    });

  function detectionKindLabel(kind: import("../detectionDomain").DetectionObjectKind): string {
    switch (kind) {
      case "PLANET": return "планета";
      case "FLEET": return "флот";
      case "STATION": return "станция";
      case "SHIPWRECK": return "кораблекрушение";
      case "ANOMALY": return "аномалия";
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
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
    const resolutionStartedAt = Date.now();
    let resolutionSucceeded = false;
    try {
      deps.cancelTurnTimer?.();
    const ownerByFleetIdBeforeResolution = new Map<number, number>();
    const fleetNameByIdBeforeResolution = new Map<number, string>();
    for (const fleet of Object.values(deps.state.fleets)) {
      ownerByFleetIdBeforeResolution.set(fleet.id, fleet.ownerPlayerId);
      fleetNameByIdBeforeResolution.set(fleet.id, `${fleet.domain === "GROUND" ? "Армия" : "Флот"} ${fleet.id}`);
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
        message: `${fleetNameByIdBeforeResolution.get(movement.fleetId) ?? `Юнит ${movement.fleetId}`} перемещён [${movement.from.q},${movement.from.r}] → [${movement.to.q},${movement.to.r}]`,
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
        message: `${fleetNameByIdBeforeResolution.get(combat.fleetId) ?? `Юнит ${combat.fleetId}`} получил ${combat.damage} урона${destroyed ? " и был уничтожен" : `; ОЗ ${combat.healthAfter}`}`,
        playerIds,
      });
    }
    for (const relation of resolution.diplomacy.declaredWars) {
      deps.state.events.push({
        id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "DIPLOMACY",
        message: `Игроки ${relation.playerAId} и ${relation.playerBId} теперь находятся в состоянии войны`,
        playerIds: [relation.playerAId, relation.playerBId],
      });
    }
    for (const relation of resolution.diplomacy.formedAlliances) {
      deps.state.events.push({
        id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "DIPLOMACY",
        message: `Игроки ${relation.playerAId} и ${relation.playerBId} заключили союз`,
        playerIds: [relation.playerAId, relation.playerBId],
      });
    }
    for (const detection of resolution.detection) {
      for (const record of detection.detected) {
        deps.state.events.push({
          id: deps.state.nextIds.event++, turnNumber: resolution.turnNumber, kind: "DETECTION",
          message: `Обнаружен объект: ${detectionKindLabel(record.objectKind)} ${record.objectId} (${record.confidence === "EXACT" ? "точно" : "оценочно"})`,
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
        message: `Кораблекрушение ${shipwreckId} образовалось в [${wreck.position.q},${wreck.position.r}]`,
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
    for (const change of resolution.administratum) {
      deps.state.events.push({
        id: deps.state.nextIds.event++,
        turnNumber: resolution.turnNumber,
        kind: "ADMINISTRATUM",
        message: `Администратум изменил десятину мира ${change.planetId}: ${change.titheLevel}`,
        playerIds: change.notifiedPlayerIds,
      });
      appendAudit(deps.state, {
        actor: { kind: "SYSTEM", id: "administratum-resolution" },
        operation: "APPLY_TITHE_PROPOSAL",
        entityType: "PLANET",
        entityId: change.planetId,
        after: { titheLevel: change.titheLevel },
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
    if (deps.startNewPlanningTimer) deps.startNewPlanningTimer();
    else deps.persistDatabase();

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
    const commandId = message.commandId;
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
    if (result.ok) {
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
    }
    rememberResult(context, commandId, result);
    sendOperationResult(context, result.ok, result.message, commandId);
    if (result.ok) broadcastState();
  }

  function applyOpenSecretStorage(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "openSecretStorage") return;
    if (!isCommandId(message.commandId) || typeof message.password !== "string"
      || !Number.isInteger(message.target.id) || message.target.id <= 0
      || (context.session.role === "player" && !context.session.playerId)
      || (message.target.kind !== "PLANET" && message.target.kind !== "STATION")) {
      sendOperationResult(context, false, "Некорректный запрос секретного хранилища", message.commandId);
      return;
    }
    const previous = getPreviousResult(context, message.commandId);
    if (previous && typeof previous === "object" && !Array.isArray(previous)) {
      const candidate = previous as {
        ok?: unknown;
        message?: unknown;
        contents?: import("../systems/secretStorageSystem").SecretStorageContents;
      };
      if (typeof candidate.ok === "boolean" && typeof candidate.message === "string") {
        const replay = candidate.ok
          ? openSecretStorage(deps.state, message.target, message.password)
          : null;
        if (candidate.ok && !replay?.ok) {
          const actor = context.session.role === "admin"
            ? { kind: "ADMIN" as const, account: context.session.username }
            : { kind: "PLAYER" as const, playerId: context.session.playerId! };
          appendAudit(deps.state, {
            actor,
            operation: "SECRET_STORAGE_AUTH_FAILED",
            entityType: message.target.kind,
            entityId: message.target.id,
            commandId: message.commandId,
            after: { ok: false, duplicateCommandId: true },
          });
          deps.persistDatabase();
          send(context.socket, {
            type: "secretStorageResult",
            commandId: message.commandId,
            ok: false,
            message: replay?.message ?? "Неверный пароль секретного хранилища",
            target: message.target,
            duplicate: true,
          });
          return;
        }
        send(context.socket, {
          type: "secretStorageResult",
          commandId: message.commandId,
          ok: candidate.ok,
          message: candidate.message,
          target: message.target,
          duplicate: true,
          ...(replay?.contents
            ? { storage: replay.contents }
            : candidate.contents
              ? { storage: candidate.contents }
              : {}),
        });
        return;
      }
    }
    const result = openSecretStorage(deps.state, message.target, message.password);
    const actor = context.session.role === "admin"
      ? { kind: "ADMIN" as const, account: context.session.username }
      : { kind: "PLAYER" as const, playerId: context.session.playerId! };
    appendAudit(deps.state, {
      actor,
      operation: result.ok ? "OPEN_SECRET_STORAGE" : "SECRET_STORAGE_AUTH_FAILED",
      entityType: message.target.kind,
      entityId: message.target.id,
      commandId: message.commandId,
      after: { ok: result.ok },
    });
    rememberResult(context, message.commandId, result);
    send(context.socket, {
      type: "secretStorageResult",
      commandId: message.commandId,
      ok: result.ok,
      message: result.message,
      target: message.target,
      ...(result.contents ? { storage: result.contents } : {}),
    });
  }

  function applyAdministratum(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "reportWorld" && message.type !== "proposeTithe") return;
    if (deps.state.phase !== "PLANNING" || context.session.role !== "player"
      || !context.session.playerId || !isCommandId(message.commandId)
      || !Number.isInteger(message.planetId) || message.planetId <= 0) {
      sendOperationResult(context, false, "Операция доступна игроку только в фазе планирования", message.commandId);
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const result = message.type === "reportWorld"
      ? reportWorld(deps.state, context.session.playerId, message.planetId)
      : proposeTithe(deps.state, context.session.playerId, message.planetId, message.titheLevel);
    if (result.ok) {
      appendAudit(deps.state, {
        actor: { kind: "PLAYER", playerId: context.session.playerId },
        operation: message.type === "reportWorld" ? "REPORT_WORLD" : "PROPOSE_TITHE",
        entityType: "PLANET",
        entityId: message.planetId,
        commandId: message.commandId,
        after: message.type === "reportWorld" ? { reported: true } : { titheLevel: message.titheLevel },
      });
      deps.readyPlayers.delete(context.session.playerId);
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) broadcastState();
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
    if (result.ok && context.session.playerId) deps.readyPlayers.delete(context.session.playerId);
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) broadcastState();
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
    if (result.ok) appendAudit(deps.state, {
      actor: context.session.role === "admin"
        ? { kind: "ADMIN", account: context.session.username }
        : { kind: "PLAYER", playerId: context.session.playerId! },
      operation: "USE_ARTIFACT", entityType: "ARTIFACT", entityId: message.artifactId,
      commandId: message.commandId, before: artifact, after: result,
    });
    if (result.ok && context.session.playerId) deps.readyPlayers.delete(context.session.playerId);
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) broadcastState();
  }

  function applyFuelConversion(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "convertFuelToMovement") return;
    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Valid commandId is required");
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const playerId = context.session.playerId;
    if (context.session.role !== "player" || !playerId) {
      const result = { ok: false, message: "Для конвертации топлива требуется принадлежащий игроку флот" };
      rememberResult(context, message.commandId, result);
      sendOperationResult(context, result.ok, result.message, message.commandId);
      return;
    }
    const result = convertFuelToMovement(deps.state, playerId, message.fleetId, message.amount);
    if (result.ok) {
      appendAudit(deps.state, {
        actor: { kind: "PLAYER", playerId }, operation: "CONVERT_FUEL_TO_MOVEMENT",
        entityType: "FLEET", entityId: message.fleetId, commandId: message.commandId,
        after: { amount: message.amount },
      });
      deps.readyPlayers.delete(playerId);
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) broadcastState();
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
    applyFuelConversion(context, message);
    applyOpenSecretStorage(context, message);
    applyAdministratum(context, message);
    applyEndTurn(context, message);
  }

  return {
    broadcastState,
    resolveAndBroadcastTurn,
    finishCurrentTurn,
    handleClientMessage,
  };
}
