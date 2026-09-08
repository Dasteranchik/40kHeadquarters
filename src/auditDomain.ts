import type { JsonValue } from "./itemDomain";

export type AuditActor =
  | { kind: "ADMIN"; account: string }
  | { kind: "PLAYER"; playerId: number }
  | { kind: "SYSTEM"; id: string };

export type AuditResult = "SUCCESS" | "REJECTED" | "DUPLICATE";

export interface AuditEntry {
  id: number;
  timestamp: number;
  turnNumber: number;
  actor: AuditActor;
  operation: string;
  entityType: string;
  entityId: string;
  commandId?: string;
  before?: JsonValue;
  after?: JsonValue;
  result: AuditResult;
}
