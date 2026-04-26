import { IncomingMessage, ServerResponse } from "http";

import { Faction } from "../../types";
import { isNonEmptyString, isValidId } from "../../utils/validation";
import { AddFactionRequest, UpdateFactionRequest } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";

export interface FactionAdminHandlers {
  handleListFactions: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddFaction: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleUpdateFaction: (
    req: IncomingMessage,
    res: ServerResponse,
    factionId: string,
  ) => Promise<void>;
  handleDeleteFaction: (req: IncomingMessage, res: ServerResponse, factionId: string) => void;
}

export function createFactionAdminHandlers(deps: AdminHandlerDeps): FactionAdminHandlers {
  function handleListFactions(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    const factions = Object.values(deps.state.factions).sort((a, b) => a.id.localeCompare(b.id));
    writeJson(res, 200, { factions });
  }

  async function handleAddFaction(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<AddFactionRequest>(req);
    if (!body || typeof body.id !== "string" || !isNonEmptyString(body.name)) {
      writeJson(res, 400, { error: "Invalid faction payload" });
      return;
    }

    if (!isValidId(body.id)) {
      writeJson(res, 400, { error: "Faction id must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (deps.state.factions[body.id]) {
      writeJson(res, 409, { error: "Faction id already exists" });
      return;
    }

    if (body.description !== undefined && typeof body.description !== "string") {
      writeJson(res, 400, { error: "description must be a string" });
      return;
    }

    const faction: Faction = {
      id: body.id,
      name: body.name.trim(),
      description:
        typeof body.description === "string" && body.description.trim().length > 0
          ? body.description.trim()
          : undefined,
    };

    deps.state.factions[faction.id] = faction;

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 201, { faction });
  }

  async function handleUpdateFaction(
    req: IncomingMessage,
    res: ServerResponse,
    factionId: string,
  ): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const faction = deps.state.factions[factionId];
    if (!faction) {
      writeJson(res, 404, { error: "Faction not found" });
      return;
    }

    const body = await readJsonBody<UpdateFactionRequest>(req);
    if (!body) {
      writeJson(res, 400, { error: "Invalid faction payload" });
      return;
    }

    if (body.name !== undefined && !isNonEmptyString(body.name)) {
      writeJson(res, 400, { error: "name must be a non-empty string" });
      return;
    }

    if (body.description !== undefined && typeof body.description !== "string") {
      writeJson(res, 400, { error: "description must be a string" });
      return;
    }

    if (body.name !== undefined) {
      faction.name = body.name.trim();
    }

    if (body.description !== undefined) {
      faction.description = body.description.trim().length > 0 ? body.description.trim() : undefined;
    }

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { faction });
  }

  function handleDeleteFaction(
    req: IncomingMessage,
    res: ServerResponse,
    factionId: string,
  ): void {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    if (!deps.state.factions[factionId]) {
      writeJson(res, 404, { error: "Faction not found" });
      return;
    }

    const assignedPlayer = Object.values(deps.state.players).find((player) => player.factionId === factionId);
    if (assignedPlayer) {
      writeJson(res, 409, {
        error: `Faction is assigned to player ${assignedPlayer.id}. Reassign players before deletion.`,
      });
      return;
    }

    delete deps.state.factions[factionId];

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { removedFactionId: factionId });
  }

  return {
    handleListFactions,
    handleAddFaction,
    handleUpdateFaction,
    handleDeleteFaction,
  };
}
