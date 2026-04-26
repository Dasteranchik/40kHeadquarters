import { IncomingMessage, ServerResponse } from "http";

import { Action, GameState } from "../../types";
import { Account, Session } from "../contracts";

export interface AdminHandlerDeps {
  state: GameState;
  accounts: Map<string, Account>;
  pendingActions: Map<string, Action>;
  pendingAllianceProposals: Set<string>;
  readyPlayers: Set<string>;
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Session | null;
  ensurePlanningPhase: (res: ServerResponse) => boolean;
  persistDatabase: () => void;
  broadcastState: () => void;
  removeSessionsForPlayer: (playerId: string) => void;
}

export function requireAdminPlanning(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AdminHandlerDeps,
): boolean {
  return Boolean(deps.requireAdmin(req, res)) && deps.ensurePlanningPhase(res);
}
