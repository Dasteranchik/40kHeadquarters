import type { IncomingMessage, ServerResponse } from "http";

import { readJsonBody, writeJson } from "../transport";
import type { AdminHandlerDeps } from "./deps";
import { requireAdminPlanning } from "./deps";

export interface SystemSettingsAdminHandlers {
  handleUpdateSystemSettings: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleRandomizeWarpDisturbance: (req: IncomingMessage, res: ServerResponse) => void;
}

export function createSystemSettingsAdminHandlers(
  deps: AdminHandlerDeps,
): SystemSettingsAdminHandlers {
  async function handleUpdateSystemSettings(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) return;
    const body = await readJsonBody<{ baseFleetMovementPoints?: unknown }>(req);
    const baseFleetMovementPoints = body?.baseFleetMovementPoints;
    if (
      typeof baseFleetMovementPoints !== "number"
      || !Number.isInteger(baseFleetMovementPoints)
      || baseFleetMovementPoints <= 0
    ) {
      writeJson(res, 400, { error: "baseFleetMovementPoints must be a positive integer" });
      return;
    }
    const incompatibleFleet = Object.values(deps.state.fleets).find(
      (fleet) => fleet.domain === "SPACE" && fleet.maxMovementPoints < baseFleetMovementPoints,
    );
    if (incompatibleFleet) {
      writeJson(res, 409, {
        error: `Fleet ${incompatibleFleet.id} maximum movement points are too low`,
      });
      return;
    }
    const before = structuredClone(deps.state.systemSettings);
    deps.state.systemSettings.baseFleetMovementPoints = baseFleetMovementPoints;
    deps.auditAdminMutation(req, {
      operation: "UPDATE_SYSTEM_SETTINGS", entityType: "SYSTEM_SETTINGS", entityId: "live",
      before, after: deps.state.systemSettings,
    });
    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { systemSettings: deps.state.systemSettings });
  }

  function handleRandomizeWarpDisturbance(req: IncomingMessage, res: ServerResponse): void {
    if (!requireAdminPlanning(req, res, deps)) return;
    for (const tile of deps.state.map.tiles) {
      tile.warpDisturbanceLevel = Math.floor(Math.random() * 6) + 1;
    }
    deps.auditAdminMutation(req, {
      operation: "RANDOMIZE_WARP_DISTURBANCE", entityType: "MAP", entityId: deps.state.gameId,
      after: { tilesUpdated: deps.state.map.tiles.length },
    });
    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { updatedTiles: deps.state.map.tiles.length });
  }

  return { handleUpdateSystemSettings, handleRandomizeWarpDisturbance };
}
