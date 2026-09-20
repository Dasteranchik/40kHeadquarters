import type { GameState } from "../../types";
import {
  getProcessedCommandResult,
  rememberProcessedCommand,
} from "../../systems/idempotencySystem";
import type { ClientContext } from "../contracts";
import { send } from "../transport";

export interface OperationResult {
  ok: boolean;
  message: string;
}

interface OperationResultManagerDeps {
  state: GameState;
  persistDatabase: () => void;
  onCommandError?: (input: {
    commandId?: string;
    playerId?: number;
    username: string;
    message: string;
  }) => void;
}

export interface OperationResultManager {
  sendOperationResult: (
    context: ClientContext,
    ok: boolean,
    message: string,
    commandId?: string,
    duplicate?: boolean,
  ) => void;
  duplicateResult: (context: ClientContext, commandId: string) => OperationResult | null;
  getPreviousResult: (context: ClientContext, commandId: string) => unknown;
  rememberResult: (
    context: ClientContext,
    commandId: string,
    result: OperationResult,
  ) => void;
}

export function createOperationResultManager(
  deps: OperationResultManagerDeps,
): OperationResultManager {
  function actorKey(context: ClientContext): string {
    return context.session.role === "admin"
      ? `admin:${context.session.username}`
      : `player:${context.session.playerId ?? "unknown"}`;
  }

  function sendOperationResult(
    context: ClientContext,
    ok: boolean,
    message: string,
    commandId?: string,
    duplicate = false,
  ): void {
    if (!ok) {
      deps.onCommandError?.({
        ...(commandId ? { commandId } : {}),
        ...(context.session.playerId === undefined
          ? {}
          : { playerId: context.session.playerId }),
        username: context.session.username,
        message,
      });
    }
    send(context.socket, {
      type: "operationResult",
      ok,
      message,
      ...(commandId ? { commandId } : {}),
      ...(duplicate ? { duplicate: true } : {}),
    });
  }

  function duplicateResult(
    context: ClientContext,
    commandId: string,
  ): OperationResult | null {
    const previous = getProcessedCommandResult(deps.state, actorKey(context), commandId);
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) return null;
    const candidate = previous as { ok?: unknown; message?: unknown };
    if (typeof candidate.ok !== "boolean" || typeof candidate.message !== "string") return null;
    sendOperationResult(context, candidate.ok, candidate.message, commandId, true);
    return { ok: candidate.ok, message: candidate.message };
  }

  function getPreviousResult(context: ClientContext, commandId: string): unknown {
    return getProcessedCommandResult(deps.state, actorKey(context), commandId);
  }

  function rememberResult(
    context: ClientContext,
    commandId: string,
    result: OperationResult,
  ): void {
    rememberProcessedCommand(deps.state, actorKey(context), commandId, result);
    deps.persistDatabase();
  }

  return { sendOperationResult, duplicateResult, getPreviousResult, rememberResult };
}
