import { IncomingMessage, ServerResponse } from "http";

import { Action, GameState } from "../../types";
import { Account, Session } from "../contracts";
import type { TurnSnapshot } from "../../storage/documentDb";
import type { AppendAuditInput } from "../../systems/auditSystem";

export interface AdminHandlerDeps {
  state: GameState;
  accounts: Map<string, Account>;
  pendingActions: Map<string, Action>;
  pendingAllianceProposals: Set<string>;
  readyPlayers: Set<number>;
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Session | null;
  ensurePlanningPhase: (res: ServerResponse) => boolean;
  persistDatabase: () => void;
  broadcastState: () => void;
  removeSessionsForPlayer: (playerId: number) => void;
  listTurnSnapshots: () => TurnSnapshot[];
  rollbackTurnSnapshot: (snapshotId: string, account: string) => boolean;
  auditAdminMutation: (
    req: IncomingMessage,
    input: Omit<AppendAuditInput, "actor">,
  ) => void;
}

export function requireAdminPlanning(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AdminHandlerDeps,
): boolean {
  return Boolean(deps.requireAdmin(req, res)) && deps.ensurePlanningPhase(res);
}
