import { IncomingMessage, ServerResponse } from "http";

import { Fleet } from "../../types";
import {
  isFiniteNumber,
  isFleetDomain,
  isFleetStance,
  isValidId,
} from "../../utils/validation";
import { AddFleetRequest, UpdateFleetRequest } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";
import { getTileAt, parseResourceStore } from "./helpers";

export interface FleetAdminHandlers {
  handleAddFleet: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeleteFleet: (req: IncomingMessage, res: ServerResponse, fleetId: string) => void;
  handleListFleets: (req: IncomingMessage, res: ServerResponse) => void;
  handleUpdateFleet: (
    req: IncomingMessage,
    res: ServerResponse,
    fleetId: string,
  ) => Promise<void>;
}

export function createFleetAdminHandlers(deps: AdminHandlerDeps): FleetAdminHandlers {
  async function handleAddFleet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<AddFleetRequest>(req);
    if (
      !body ||
      typeof body.id !== "string" ||
      typeof body.ownerPlayerId !== "string" ||
      !isFiniteNumber(body.q) ||
      !isFiniteNumber(body.r)
    ) {
      writeJson(res, 400, { error: "Invalid fleet payload" });
      return;
    }

    if (!isValidId(body.id)) {
      writeJson(res, 400, { error: "Fleet id must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (deps.state.fleets[body.id]) {
      writeJson(res, 409, { error: "Fleet id already exists" });
      return;
    }

    if (!deps.state.players[body.ownerPlayerId]) {
      writeJson(res, 404, { error: "Owner player not found" });
      return;
    }

    if (body.stance !== undefined && !isFleetStance(body.stance)) {
      writeJson(res, 400, { error: "Stance must be ATTACK or DEFENSE" });
      return;
    }

    if (body.domain !== undefined && !isFleetDomain(body.domain)) {
      writeJson(res, 400, { error: "domain must be SPACE or GROUND" });
      return;
    }

    const parsedInventory =
      body.inventory === undefined ? {} : parseResourceStore(body.inventory);
    if (parsedInventory === null) {
      writeJson(res, 400, { error: "inventory must be an object<ResourceKey, number>" });
      return;
    }

    const position = { q: Math.trunc(body.q), r: Math.trunc(body.r) };
    const tile = getTileAt(deps.state, position);
    if (!tile) {
      writeJson(res, 400, { error: "Fleet position is outside the map" });
      return;
    }

    if (tile.terrainType === "OBSTACLE") {
      writeJson(res, 400, { error: "Cannot place fleet on obstacle tile" });
      return;
    }

    const fleet: Fleet = {
      id: body.id,
      ownerPlayerId: body.ownerPlayerId,
      position,
      combatPower: Math.max(0, Math.trunc(body.combatPower ?? 10)),
      health: Math.max(1, Math.trunc(body.health ?? 100)),
      influence: Math.max(0, Math.trunc(body.influence ?? 5)),
      actionPoints: Math.max(0, Math.trunc(body.actionPoints ?? 3)),
      visionRange: Math.max(0, Math.trunc(body.visionRange ?? 2)),
      capacity: Math.max(0, Math.trunc(body.capacity ?? 10)),
      stance: body.stance ?? "ATTACK",
      domain: body.domain ?? "SPACE",
      inventory: parsedInventory,
    };

    deps.state.fleets[fleet.id] = fleet;

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 201, { fleet });
  }

  function handleDeleteFleet(req: IncomingMessage, res: ServerResponse, fleetId: string): void {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    if (!deps.state.fleets[fleetId]) {
      writeJson(res, 404, { error: "Fleet not found" });
      return;
    }

    delete deps.state.fleets[fleetId];

    for (const [actionId, action] of deps.pendingActions.entries()) {
      if (
        ((action.type === "MOVE_FLEET" || action.type === "SET_FLEET_STANCE") &&
          action.payload.fleetId === fleetId) ||
        (action.type === "PLANET_ACTION" && action.payload.fleetId === fleetId)
      ) {
        deps.pendingActions.delete(actionId);
      }
    }

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { removedFleetId: fleetId });
  }

  function handleListFleets(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    const fleets = Object.values(deps.state.fleets).sort((a, b) => a.id.localeCompare(b.id));
    writeJson(res, 200, { fleets });
  }

  async function handleUpdateFleet(
    req: IncomingMessage,
    res: ServerResponse,
    fleetId: string,
  ): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const fleet = deps.state.fleets[fleetId];
    if (!fleet) {
      writeJson(res, 404, { error: "Fleet not found" });
      return;
    }

    const body = await readJsonBody<UpdateFleetRequest>(req);
    if (!body) {
      writeJson(res, 400, { error: "Invalid fleet payload" });
      return;
    }

    if (body.ownerPlayerId !== undefined && typeof body.ownerPlayerId !== "string") {
      writeJson(res, 400, { error: "ownerPlayerId must be a string" });
      return;
    }

    if (body.ownerPlayerId && !deps.state.players[body.ownerPlayerId]) {
      writeJson(res, 404, { error: "Owner player not found" });
      return;
    }

    const numericChecks: Array<[unknown, string]> = [
      [body.q, "q"],
      [body.r, "r"],
      [body.combatPower, "combatPower"],
      [body.health, "health"],
      [body.influence, "influence"],
      [body.actionPoints, "actionPoints"],
      [body.visionRange, "visionRange"],
      [body.capacity, "capacity"],
    ];

    for (const [value, field] of numericChecks) {
      if (value !== undefined && !isFiniteNumber(value)) {
        writeJson(res, 400, { error: `${field} must be a number` });
        return;
      }
    }

    if (body.stance !== undefined && !isFleetStance(body.stance)) {
      writeJson(res, 400, { error: "Stance must be ATTACK or DEFENSE" });
      return;
    }

    if (body.domain !== undefined && !isFleetDomain(body.domain)) {
      writeJson(res, 400, { error: "domain must be SPACE or GROUND" });
      return;
    }

    const parsedInventory =
      body.inventory === undefined ? undefined : parseResourceStore(body.inventory);
    if (parsedInventory === null) {
      writeJson(res, 400, { error: "inventory must be an object<ResourceKey, number>" });
      return;
    }

    const nextPosition = {
      q: body.q !== undefined ? Math.trunc(body.q) : fleet.position.q,
      r: body.r !== undefined ? Math.trunc(body.r) : fleet.position.r,
    };

    const tile = getTileAt(deps.state, nextPosition);
    if (!tile) {
      writeJson(res, 400, { error: "Fleet position is outside the map" });
      return;
    }

    if (tile.terrainType === "OBSTACLE") {
      writeJson(res, 400, { error: "Cannot place fleet on obstacle tile" });
      return;
    }

    if (body.ownerPlayerId !== undefined) {
      fleet.ownerPlayerId = body.ownerPlayerId;
    }

    fleet.position = nextPosition;

    if (body.combatPower !== undefined) {
      fleet.combatPower = Math.max(0, Math.trunc(body.combatPower));
    }

    if (body.health !== undefined) {
      fleet.health = Math.max(1, Math.trunc(body.health));
    }

    if (body.influence !== undefined) {
      fleet.influence = Math.max(0, Math.trunc(body.influence));
    }

    if (body.actionPoints !== undefined) {
      fleet.actionPoints = Math.max(0, Math.trunc(body.actionPoints));
    }

    if (body.visionRange !== undefined) {
      fleet.visionRange = Math.max(0, Math.trunc(body.visionRange));
    }

    if (body.capacity !== undefined) {
      fleet.capacity = Math.max(0, Math.trunc(body.capacity));
    }

    if (body.stance !== undefined) {
      fleet.stance = body.stance;
    }

    if (body.domain !== undefined) {
      fleet.domain = body.domain;
    }

    if (parsedInventory !== undefined) {
      fleet.inventory = parsedInventory;
    }

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { fleet });
  }

  return {
    handleAddFleet,
    handleDeleteFleet,
    handleListFleets,
    handleUpdateFleet,
  };
}
