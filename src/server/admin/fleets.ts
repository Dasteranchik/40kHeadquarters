import { IncomingMessage, ServerResponse } from "http";

import { Fleet } from "../../types";
import { createEmptyItemInventory } from "../../itemDomain";
import { isUnitTag } from "../../unitDomain";
import { detectObjectsForFleetAtCurrentHex } from "../../systems/detectionSystem";
import {
  isFiniteNumber,
  isFleetDomain,
  isFleetStance,
  isValidId,
} from "../../utils/validation";
import { AddArmyRequest, AddFleetRequest, UpdateFleetRequest } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";
import { getTileAt, parseResourceStore } from "./helpers";
import { carrierCapacityUsed } from "../../systems/armyTransportSystem";
import { isWarpVisibility } from "../../navigationDomain";

export interface FleetAdminHandlers {
  handleAddArmy: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
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
  async function handleAddArmy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) return;

    const body = await readJsonBody<AddArmyRequest>(req);
    if (!body || !Number.isInteger(body.ownerPlayerId) || !body.destination) {
      writeJson(res, 400, { error: "Invalid army payload" });
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
    if (body.unitVariantId !== undefined && body.unitVariantId !== null) {
      if (!Number.isInteger(body.unitVariantId) || body.unitVariantId <= 0) {
        writeJson(res, 400, { error: "unitVariantId must be a positive integer" });
        return;
      }
      const variant = deps.state.unitVariants[body.unitVariantId];
      if (!variant || variant.domain !== "GROUND") {
        writeJson(res, 400, { error: "unitVariantId must reference a GROUND variant" });
        return;
      }
    }

    let position: Fleet["position"];
    let carrierFleetId: number | undefined;
    switch (body.destination.kind) {
      case "PLANET": {
        const planet = deps.state.planets[body.destination.planetId];
        if (!planet) {
          writeJson(res, 404, { error: "Destination planet not found" });
          return;
        }
        position = { ...planet.position };
        break;
      }
      case "FLEET": {
        const carrier = deps.state.fleets[body.destination.fleetId];
        if (!carrier || carrier.domain !== "SPACE") {
          writeJson(res, 404, { error: "Destination carrier fleet not found" });
          return;
        }
        const health = Math.max(1, Math.trunc(body.health ?? 100));
        if (carrierCapacityUsed(deps.state, carrier.id) + Math.ceil(health / 1000) > carrier.capacity) {
          writeJson(res, 400, { error: "Destination fleet has no free capacity" });
          return;
        }
        position = { ...carrier.position };
        carrierFleetId = carrier.id;
        break;
      }
      default: {
        const exhaustive: never = body.destination;
        writeJson(res, 400, { error: `Unknown army destination: ${String(exhaustive)}` });
        return;
      }
    }

    const army: Fleet = {
      id: deps.state.nextIds.unit++,
      ownerPlayerId: body.ownerPlayerId,
      position,
      combatPower: Math.max(0, Math.trunc(body.combatPower ?? 10)),
      health: Math.max(1, Math.trunc(body.health ?? 100)),
      influence: Math.max(0, Math.trunc(body.influence ?? 5)),
      movementPoints: 0,
      maxMovementPoints: 0,
      isNavigator: false,
      warpVisibility: null,
      visionRange: Math.max(0, Math.trunc(body.visionRange ?? 1)),
      shareVisionWithAllies: false,
      capacity: 0,
      stance: body.stance ?? "ATTACK",
      domain: "GROUND",
      inventory: {},
      itemInventory: createEmptyItemInventory(),
      tags: [],
      ...(body.unitVariantId === undefined || body.unitVariantId === null
        ? {}
        : { unitVariantId: body.unitVariantId }),
      ...(carrierFleetId === undefined ? {} : { carrierFleetId }),
    };
    deps.state.fleets[army.id] = army;
    deps.auditAdminMutation(req, {
      operation: "CREATE_ARMY", entityType: "FLEET", entityId: army.id, after: army,
    });
    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 201, { army });
  }

  async function handleAddFleet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<AddFleetRequest>(req);
    if (
      !body ||
      !Number.isInteger(body.ownerPlayerId) ||
      !isFiniteNumber(body.q) ||
      !isFiniteNumber(body.r)
    ) {
      writeJson(res, 400, { error: "Invalid fleet payload" });
      return;
    }


    if (!deps.state.players[body.ownerPlayerId]) {
      writeJson(res, 404, { error: "Owner player not found" });
      return;
    }

    const baseMovementPoints = deps.state.systemSettings.baseFleetMovementPoints;
    const requestedMaxMovementPoints = body.maxMovementPoints ?? baseMovementPoints;
    const requestedMovementPoints = body.movementPoints ?? baseMovementPoints;
    const requestedWarpVisibility = body.warpVisibility ?? null;
    if (
      !Number.isInteger(requestedMaxMovementPoints)
      || requestedMaxMovementPoints < baseMovementPoints
      || !Number.isInteger(requestedMovementPoints)
      || requestedMovementPoints < 0
      || requestedMovementPoints > requestedMaxMovementPoints
      || !isWarpVisibility(requestedWarpVisibility)
    ) {
      writeJson(res, 400, {
        error: "movementPoints/maxMovementPoints/warpVisibility violate Fleet invariants",
      });
      return;
    }

    if (body.stance !== undefined && !isFleetStance(body.stance)) {
      writeJson(res, 400, { error: "Stance must be ATTACK or DEFENSE" });
      return;
    }

    if (body.domain !== undefined && body.domain !== "SPACE") {
      writeJson(res, 400, { error: "Ground units must be created through the army endpoint" });
      return;
    }
    if (body.isNavigator !== undefined && typeof body.isNavigator !== "boolean") {
      writeJson(res, 400, { error: "isNavigator must be boolean" });
      return;
    }
    if (body.unitVariantId !== undefined && body.unitVariantId !== null) {
      if (!Number.isInteger(body.unitVariantId) || body.unitVariantId <= 0) {
        writeJson(res, 400, { error: "unitVariantId must be a positive integer" });
        return;
      }
      const variant = deps.state.unitVariants[body.unitVariantId];
      if (!variant || variant.domain !== "SPACE") {
        writeJson(res, 400, { error: "unitVariantId must reference a SPACE variant" });
        return;
      }
    }

    const parsedInventory =
      body.inventory === undefined ? {} : parseResourceStore(body.inventory);
    if (parsedInventory === null) {
      writeJson(res, 400, { error: "inventory must be an object<ResourceKey, number>" });
      return;
    }
    if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => !isUnitTag(tag)))) {
      writeJson(res, 400, { error: "tags must contain supported Unit tags" });
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

    const maxMovementPoints = requestedMaxMovementPoints;
    const movementPoints = requestedMovementPoints;
    const fleet: Fleet = {
      id: deps.state.nextIds.unit++,
      ownerPlayerId: body.ownerPlayerId,
      position,
      combatPower: Math.max(0, Math.trunc(body.combatPower ?? 10)),
      health: Math.max(1, Math.trunc(body.health ?? 100)),
      influence: Math.max(0, Math.trunc(body.influence ?? 5)),
      movementPoints,
      maxMovementPoints,
      isNavigator: body.isNavigator === true,
      warpVisibility: requestedWarpVisibility,
      visionRange: Math.max(0, Math.trunc(body.visionRange ?? 2)),
      shareVisionWithAllies: false,
      capacity: Math.max(0, Math.trunc(body.capacity ?? 10)),
      stance: body.stance ?? "ATTACK",
      domain: "SPACE",
      inventory: parsedInventory,
      itemInventory: createEmptyItemInventory(),
      tags: body.tags ? [...new Set(body.tags)] : [],
      ...(body.unitVariantId === undefined || body.unitVariantId === null
        ? {}
        : { unitVariantId: body.unitVariantId }),
    };

    deps.state.fleets[fleet.id] = fleet;
    detectObjectsForFleetAtCurrentHex(deps.state, fleet.id);

    deps.auditAdminMutation(req, {
      operation: "CREATE_FLEET", entityType: "FLEET", entityId: fleet.id, after: fleet,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 201, { fleet });
  }

  function handleDeleteFleet(req: IncomingMessage, res: ServerResponse, fleetId: string): void {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const removedFleet = deps.state.fleets[fleetId];
    if (!removedFleet) {
      writeJson(res, 404, { error: "Fleet not found" });
      return;
    }

    for (const artifactId of removedFleet.itemInventory.artifactIds) delete deps.state.artifacts[artifactId];
    delete deps.state.fleets[fleetId];
    for (const unit of Object.values(deps.state.fleets)) {
      if (unit.carrierFleetId === removedFleet.id) delete unit.carrierFleetId;
    }

    for (const [actionId, action] of deps.pendingActions.entries()) {
      if (
        ((action.type === "MOVE_FLEET" || action.type === "SET_FLEET_STANCE") &&
          action.payload.fleetId === removedFleet.id) ||
        (action.type === "PLANET_ACTION" && action.payload.fleetId === removedFleet.id)
      ) {
        deps.pendingActions.delete(actionId);
      }
    }

    deps.auditAdminMutation(req, {
      operation: "DELETE_FLEET", entityType: "FLEET", entityId: fleetId, before: removedFleet,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { removedFleetId: fleetId });
  }

  function handleListFleets(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    const fleets = Object.values(deps.state.fleets).sort((a, b) => a.id - b.id);
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
    const fleetBeforeUpdate = structuredClone(fleet);

    const body = await readJsonBody<UpdateFleetRequest>(req);
    if (!body) {
      writeJson(res, 400, { error: "Invalid fleet payload" });
      return;
    }

    if (body.ownerPlayerId !== undefined && !Number.isInteger(body.ownerPlayerId)) {
      writeJson(res, 400, { error: "ownerPlayerId must be an integer" });
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
      [body.movementPoints, "movementPoints"],
      [body.maxMovementPoints, "maxMovementPoints"],
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
    if (body.isNavigator !== undefined && typeof body.isNavigator !== "boolean") {
      writeJson(res, 400, { error: "isNavigator must be boolean" });
      return;
    }
    if (body.warpVisibility !== undefined && !isWarpVisibility(body.warpVisibility)) {
      writeJson(res, 400, { error: "warpVisibility must be -, 0, 1, 2 or 3" });
      return;
    }
    if (body.unitVariantId !== undefined && body.unitVariantId !== null
      && (!Number.isInteger(body.unitVariantId) || body.unitVariantId <= 0)) {
      writeJson(res, 400, { error: "unitVariantId must be a positive integer or null" });
      return;
    }

    const parsedInventory =
      body.inventory === undefined ? undefined : parseResourceStore(body.inventory);
    if (parsedInventory === null) {
      writeJson(res, 400, { error: "inventory must be an object<ResourceKey, number>" });
      return;
    }
    if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => !isUnitTag(tag)))) {
      writeJson(res, 400, { error: "tags must contain supported Unit tags" });
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

    const nextMaxMovementPoints = body.maxMovementPoints === undefined
      ? fleet.maxMovementPoints
      : Math.max(0, Math.trunc(body.maxMovementPoints));
    const nextMovementPoints = body.movementPoints === undefined
      ? fleet.movementPoints
      : Math.max(0, Math.trunc(body.movementPoints));
    const nextDomain = body.domain ?? fleet.domain;
    const nextVariantId = body.unitVariantId === undefined ? fleet.unitVariantId : body.unitVariantId ?? undefined;
    if (nextVariantId !== undefined) {
      const variant = deps.state.unitVariants[nextVariantId];
      if (!variant || variant.domain !== nextDomain) {
        writeJson(res, 400, { error: `unitVariantId must reference a ${nextDomain} variant` });
        return;
      }
    }
    if (
      nextDomain === "SPACE"
      && (nextMaxMovementPoints < deps.state.systemSettings.baseFleetMovementPoints
        || nextMovementPoints > nextMaxMovementPoints)
    ) {
      writeJson(res, 400, { error: "Invalid movement point limits" });
      return;
    }
    fleet.maxMovementPoints = nextDomain === "GROUND" ? 0 : nextMaxMovementPoints;
    fleet.movementPoints = nextDomain === "GROUND" ? 0 : nextMovementPoints;
    if (body.isNavigator !== undefined) fleet.isNavigator = body.isNavigator;
    if (body.warpVisibility !== undefined) fleet.warpVisibility = body.warpVisibility;

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
    if (body.unitVariantId !== undefined) {
      if (body.unitVariantId === null) delete fleet.unitVariantId;
      else fleet.unitVariantId = body.unitVariantId;
    }

    if (parsedInventory !== undefined) {
      fleet.inventory = parsedInventory;
    }
    if (body.tags !== undefined) {
      fleet.tags = [...new Set(body.tags)];
    }
    detectObjectsForFleetAtCurrentHex(deps.state, fleet.id);

    deps.auditAdminMutation(req, {
      operation: "UPDATE_FLEET", entityType: "FLEET", entityId: fleetId,
      before: fleetBeforeUpdate, after: fleet,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { fleet });
  }

  return {
    handleAddArmy,
    handleAddFleet,
    handleDeleteFleet,
    handleListFleets,
    handleUpdateFleet,
  };
}
