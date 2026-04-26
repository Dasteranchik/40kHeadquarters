import { IncomingMessage, ServerResponse } from "http";

import { collectRelationPairs, linkPlayers, unlinkPlayers } from "../../utils/relations";
import { RelationRequest } from "../contracts";
import { clearAllianceProposalsForPair } from "../immediateDiplomacy";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";

export interface RelationAdminHandlers {
  handleListRelations: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddRelation: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeleteRelation: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

function buildRelationsPayload(state: AdminHandlerDeps["state"]): {
  alliances: Array<{ playerAId: string; playerBId: string }>;
  wars: Array<{ playerAId: string; playerBId: string }>;
} {
  return {
    alliances: collectRelationPairs(state.players, "alliances"),
    wars: collectRelationPairs(state.players, "wars"),
  };
}

export function createRelationAdminHandlers(deps: AdminHandlerDeps): RelationAdminHandlers {
  function handleListRelations(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    writeJson(res, 200, buildRelationsPayload(deps.state));
  }

  async function handleAddRelation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<RelationRequest>(req);
    if (
      !body ||
      typeof body.playerAId !== "string" ||
      typeof body.playerBId !== "string" ||
      (body.type !== "WAR" && body.type !== "ALLIANCE")
    ) {
      writeJson(res, 400, { error: "Invalid relation payload" });
      return;
    }

    if (body.playerAId === body.playerBId) {
      writeJson(res, 400, { error: "Players must be different" });
      return;
    }

    if (!deps.state.players[body.playerAId] || !deps.state.players[body.playerBId]) {
      writeJson(res, 404, { error: "Player not found" });
      return;
    }

    if (body.type === "WAR") {
      linkPlayers(deps.state.players, "wars", body.playerAId, body.playerBId);
      unlinkPlayers(deps.state.players, "alliances", body.playerAId, body.playerBId);
    } else {
      linkPlayers(deps.state.players, "alliances", body.playerAId, body.playerBId);
      unlinkPlayers(deps.state.players, "wars", body.playerAId, body.playerBId);
    }

    clearAllianceProposalsForPair(
      deps.pendingAllianceProposals,
      body.playerAId,
      body.playerBId,
    );

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, buildRelationsPayload(deps.state));
  }

  async function handleDeleteRelation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<RelationRequest>(req);
    if (
      !body ||
      typeof body.playerAId !== "string" ||
      typeof body.playerBId !== "string" ||
      (body.type !== "WAR" && body.type !== "ALLIANCE")
    ) {
      writeJson(res, 400, { error: "Invalid relation payload" });
      return;
    }

    if (!deps.state.players[body.playerAId] || !deps.state.players[body.playerBId]) {
      writeJson(res, 404, { error: "Player not found" });
      return;
    }

    if (body.type === "WAR") {
      unlinkPlayers(deps.state.players, "wars", body.playerAId, body.playerBId);
    } else {
      unlinkPlayers(deps.state.players, "alliances", body.playerAId, body.playerBId);
    }

    clearAllianceProposalsForPair(
      deps.pendingAllianceProposals,
      body.playerAId,
      body.playerBId,
    );

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, buildRelationsPayload(deps.state));
  }

  return {
    handleListRelations,
    handleAddRelation,
    handleDeleteRelation,
  };
}
