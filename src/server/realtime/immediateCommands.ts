import type { ClientMessage } from "../../api/ws";
import type { Action, GameState } from "../../types";
import { proposeTithe, reportWorld } from "../../systems/administratumSystem";
import { disembarkArmy, requestArmyEmbark, respondArmyEmbark } from "../../systems/armyTransportSystem";
import { useArtifact } from "../../systems/artifactEffectRegistry";
import { appendAudit } from "../../systems/auditSystem";
import { isCommandId } from "../../systems/idempotencySystem";
import {
  actorCanAccessItemLocation,
  copyKnowledge,
  resolveItemInventory,
  transferArtifact,
} from "../../systems/itemSystem";
import { convertFuelToMovement } from "../../systems/movementPointSystem";
import { applyImmediateResourceTransfer } from "../../systems/resourceTransferSystem";
import { openSecretStorage } from "../../systems/secretStorageSystem";
import { tradeWithShop } from "../../systems/shopSystem";
import type { ClientContext } from "../contracts";
import { send } from "../transport";
import type { OperationResultManager } from "./operationResults";

export interface ImmediateCommandDeps {
  state: GameState;
  pendingActions: Map<string, Action>;
  readyPlayers: Set<number>;
  persistDatabase: () => void;
  broadcastState: () => void;
  operationResults: OperationResultManager;
}

export interface ImmediateCommandHandlers {
  applyResourceTransfer: (context: ClientContext, message: ClientMessage) => void;
  applyArmyTransport: (context: ClientContext, message: ClientMessage) => void;
  applyShopTrade: (context: ClientContext, message: ClientMessage) => void;
  applyOpenSecretStorage: (context: ClientContext, message: ClientMessage) => void;
  applyAdministratum: (context: ClientContext, message: ClientMessage) => void;
  applyItemTransfer: (context: ClientContext, message: ClientMessage) => void;
  applyArtifactUse: (context: ClientContext, message: ClientMessage) => void;
  applyFuelConversion: (context: ClientContext, message: ClientMessage) => void;
}

export function createImmediateCommandHandlers(
  deps: ImmediateCommandDeps,
): ImmediateCommandHandlers {
  const {
    duplicateResult,
    getPreviousResult,
    rememberResult,
    sendOperationResult,
  } = deps.operationResults;

  function applyResourceTransfer(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "resourceTransfer") return;

    if (deps.state.phase !== "PLANNING") {
      sendOperationResult(
        context,
        false,
        "Resource transfers are available only in PLANNING phase",
      );
      return;
    }

    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Valid commandId is required");
      return;
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
    if (!result.ok) return;

    if (context.session.playerId) {
      deps.readyPlayers.delete(context.session.playerId);
    }
    deps.persistDatabase();
    deps.broadcastState();
  }

  function applyArmyTransport(context: ClientContext, message: ClientMessage): void {
    if (deps.state.phase !== "PLANNING" || !context.session.playerId) return;
    if (
      message.type !== "requestArmyEmbark"
      && message.type !== "respondArmyEmbark"
      && message.type !== "disembarkArmy"
    ) return;
    if (!isCommandId(message.commandId)) {
      sendOperationResult(context, false, "Valid commandId is required");
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const playerId = context.session.playerId;
    const actions = deps.pendingActions.values();
    let result: { ok: boolean; message: string };
    switch (message.type) {
      case "requestArmyEmbark":
        result = requestArmyEmbark(
          deps.state,
          actions,
          playerId,
          message.armyId,
          message.fleetId,
        );
        break;
      case "respondArmyEmbark":
        result = respondArmyEmbark(
          deps.state,
          actions,
          playerId,
          message.requestId,
          message.accept,
        );
        break;
      case "disembarkArmy":
        result = disembarkArmy(deps.state, actions, playerId, message.armyId);
        break;
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) {
      deps.readyPlayers.delete(playerId);
      deps.persistDatabase();
      deps.broadcastState();
    }
  }

  function applyShopTrade(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "shopTrade") return;
    const commandId = message.commandId;
    if (deps.state.phase !== "PLANNING" || !isCommandId(commandId)) {
      sendOperationResult(
        context,
        false,
        "Shop trade requires PLANNING and a valid commandId",
        commandId,
      );
      return;
    }
    if (duplicateResult(context, commandId)) return;
    const before = structuredClone(
      message.payload.shop.kind === "PLANET"
        ? deps.state.planets[message.payload.shop.id]?.shop
        : deps.state.stations[message.payload.shop.id]?.shop,
    );
    const result = tradeWithShop(
      deps.state,
      {
        role: context.session.role,
        playerId: context.session.playerId,
      },
      message.payload,
    );
    if (result.ok) {
      appendAudit(deps.state, {
        actor: context.session.role === "admin"
          ? { kind: "ADMIN", account: context.session.username }
          : { kind: "PLAYER", playerId: context.session.playerId! },
        operation: Object.keys(result.disappeared).length > 0
          ? "SHOP_TRADE_DISAPPEARING"
          : "SHOP_TRADE",
        entityType: message.payload.shop.kind,
        entityId: message.payload.shop.id,
        commandId,
        before,
        after: message.payload,
      });
      if (context.session.playerId) {
        deps.readyPlayers.delete(context.session.playerId);
        deps.state.events.push({
          id: deps.state.nextIds.event++,
          turnNumber: deps.state.turnNumber,
          kind: "SHOP",
          message: result.message,
          playerIds: [context.session.playerId],
        });
      }
    }
    rememberResult(context, commandId, result);
    sendOperationResult(context, result.ok, result.message, commandId);
    if (result.ok) deps.broadcastState();
  }

  function applyOpenSecretStorage(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "openSecretStorage") return;
    if (
      !isCommandId(message.commandId)
      || typeof message.password !== "string"
      || !Number.isInteger(message.target.id)
      || message.target.id <= 0
      || (context.session.role === "player" && !context.session.playerId)
      || (message.target.kind !== "PLANET" && message.target.kind !== "STATION")
    ) {
      sendOperationResult(
        context,
        false,
        "Некорректный запрос секретного хранилища",
        message.commandId,
      );
      return;
    }
    const previous = getPreviousResult(context, message.commandId);
    if (previous && typeof previous === "object" && !Array.isArray(previous)) {
      const candidate = previous as {
        ok?: unknown;
        message?: unknown;
        contents?: import("../../systems/secretStorageSystem").SecretStorageContents;
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
    if (
      deps.state.phase !== "PLANNING"
      || context.session.role !== "player"
      || !context.session.playerId
      || !isCommandId(message.commandId)
      || !Number.isInteger(message.planetId)
      || message.planetId <= 0
    ) {
      sendOperationResult(
        context,
        false,
        "Операция доступна игроку только в фазе планирования",
        message.commandId,
      );
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const result = message.type === "reportWorld"
      ? reportWorld(deps.state, context.session.playerId, message.planetId)
      : proposeTithe(
        deps.state,
        context.session.playerId,
        message.planetId,
        message.titheLevel,
      );
    if (result.ok) {
      appendAudit(deps.state, {
        actor: { kind: "PLAYER", playerId: context.session.playerId },
        operation: message.type === "reportWorld" ? "REPORT_WORLD" : "PROPOSE_TITHE",
        entityType: "PLANET",
        entityId: message.planetId,
        commandId: message.commandId,
        after: message.type === "reportWorld"
          ? { reported: true }
          : { titheLevel: message.titheLevel },
      });
      deps.readyPlayers.delete(context.session.playerId);
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) deps.broadcastState();
  }

  function applyItemTransfer(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "itemTransfer") return;
    if (deps.state.phase !== "PLANNING" || !isCommandId(message.commandId)) {
      sendOperationResult(
        context,
        false,
        "Item transfer requires PLANNING and a valid commandId",
        message.commandId,
      );
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const actor = { role: context.session.role, playerId: context.session.playerId } as const;
    const result = message.item.kind === "ARTIFACT"
      ? transferArtifact(
        deps.state,
        actor,
        message.item.artifactId,
        message.source,
        message.target,
      )
      : copyKnowledge(
        deps.state,
        actor,
        message.item.knowledge,
        message.source,
        message.target,
      );
    if (result.changed) {
      appendAudit(deps.state, {
        actor: context.session.role === "admin"
          ? { kind: "ADMIN", account: context.session.username }
          : { kind: "PLAYER", playerId: context.session.playerId! },
        operation: message.item.kind === "ARTIFACT"
          ? "TRANSFER_ARTIFACT"
          : "COPY_KNOWLEDGE",
        entityType: message.item.kind,
        entityId: message.item.kind === "ARTIFACT"
          ? message.item.artifactId
          : message.item.knowledge,
        commandId: message.commandId,
        before: message.source,
        after: message.target,
      });
    }
    if (result.ok && context.session.playerId) {
      deps.readyPlayers.delete(context.session.playerId);
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) deps.broadcastState();
  }

  function applyArtifactUse(context: ClientContext, message: ClientMessage): void {
    if (message.type !== "artifactUse") return;
    if (deps.state.phase !== "PLANNING" || !isCommandId(message.commandId)) {
      sendOperationResult(
        context,
        false,
        "Artifact use requires PLANNING and a valid commandId",
        message.commandId,
      );
      return;
    }
    if (duplicateResult(context, message.commandId)) return;
    const artifact = deps.state.artifacts[message.artifactId];
    const actor = { role: context.session.role, playerId: context.session.playerId } as const;
    const result = artifact && actorCanAccessItemLocation(deps.state, actor, artifact.owner)
      ? useArtifact(deps.state, actor, message.artifactId)
      : { ok: false, consumed: false, message: "Artifact access denied" };
    if (result.ok && result.consumed && artifact) {
      const inventory = resolveItemInventory(deps.state, artifact.owner);
      if (inventory) {
        inventory.artifactIds = inventory.artifactIds.filter((id) => id !== artifact.id);
      }
      delete deps.state.artifacts[artifact.id];
    }
    if (result.ok) {
      appendAudit(deps.state, {
        actor: context.session.role === "admin"
          ? { kind: "ADMIN", account: context.session.username }
          : { kind: "PLAYER", playerId: context.session.playerId! },
        operation: "USE_ARTIFACT",
        entityType: "ARTIFACT",
        entityId: message.artifactId,
        commandId: message.commandId,
        before: artifact,
        after: result,
      });
    }
    if (result.ok && context.session.playerId) {
      deps.readyPlayers.delete(context.session.playerId);
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) deps.broadcastState();
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
      const result = {
        ok: false,
        message: "Для конвертации топлива требуется принадлежащий игроку флот",
      };
      rememberResult(context, message.commandId, result);
      sendOperationResult(context, result.ok, result.message, message.commandId);
      return;
    }
    const result = convertFuelToMovement(
      deps.state,
      playerId,
      message.fleetId,
      message.amount,
    );
    if (result.ok) {
      appendAudit(deps.state, {
        actor: { kind: "PLAYER", playerId },
        operation: "CONVERT_FUEL_TO_MOVEMENT",
        entityType: "FLEET",
        entityId: message.fleetId,
        commandId: message.commandId,
        after: { amount: message.amount },
      });
      deps.readyPlayers.delete(playerId);
    }
    rememberResult(context, message.commandId, result);
    sendOperationResult(context, result.ok, result.message, message.commandId);
    if (result.ok) deps.broadcastState();
  }

  return {
    applyResourceTransfer,
    applyArmyTransport,
    applyShopTrade,
    applyOpenSecretStorage,
    applyAdministratum,
    applyItemTransfer,
    applyArtifactUse,
    applyFuelConversion,
  };
}
