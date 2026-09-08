import type { AuditActor, AuditEntry, AuditResult } from "../auditDomain";
import type { JsonValue } from "../itemDomain";
import type { GameState } from "../types";

const MAX_AUDIT_ENTRIES = 5000;

export interface AppendAuditInput {
  actor: AuditActor;
  operation: string;
  entityType: string;
  entityId: string | number;
  commandId?: string;
  before?: unknown;
  after?: unknown;
  result?: AuditResult;
  timestamp?: number;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return undefined;
  }
}

export function appendAudit(state: GameState, input: AppendAuditInput): AuditEntry {
  const before = toJsonValue(input.before);
  const after = toJsonValue(input.after);
  const entry: AuditEntry = {
    id: state.nextIds.audit++,
    timestamp: input.timestamp ?? Date.now(),
    turnNumber: state.turnNumber,
    actor: input.actor,
    operation: input.operation,
    entityType: input.entityType,
    entityId: String(input.entityId),
    ...(input.commandId ? { commandId: input.commandId } : {}),
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    result: input.result ?? "SUCCESS",
  };
  state.audit.push(entry);
  state.audit = state.audit.slice(-MAX_AUDIT_ENTRIES);
  return entry;
}
