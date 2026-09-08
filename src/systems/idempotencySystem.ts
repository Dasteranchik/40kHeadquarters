import type { JsonValue } from "../itemDomain";
import type { GameState } from "../types";

const MAX_PROCESSED_COMMANDS = 1000;

export function isCommandId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9:_-]{4,120}$/.test(value);
}

function commandKey(actorKey: string, commandId: string): string {
  return `${actorKey}:${commandId}`;
}

export function getProcessedCommandResult(
  state: GameState,
  actorKey: string,
  commandId: string,
): JsonValue | undefined {
  return state.processedCommands.find(
    (entry) => entry.key === commandKey(actorKey, commandId),
  )?.result;
}

export function rememberProcessedCommand(
  state: GameState,
  actorKey: string,
  commandId: string,
  result: unknown,
  now = Date.now(),
): void {
  const serialized = JSON.parse(JSON.stringify(result)) as JsonValue;
  state.processedCommands.push({
    key: commandKey(actorKey, commandId),
    processedAt: now,
    result: serialized,
  });
  state.processedCommands = state.processedCommands.slice(-MAX_PROCESSED_COMMANDS);
}
