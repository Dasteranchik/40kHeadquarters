import type { IncomingMessage, ServerResponse } from "http";
import { createEmptyItemInventory, type InventoryLocation } from "../../itemDomain";
import type { Fleet, GameState } from "../../types";
import { normalizeNewModelCollections } from "../normalization/newModel";
import { readJsonBody, writeJson } from "../transport";
import { resolveItemInventory } from "../../systems/itemSystem";
import {
  attachArtifact, attachFormation, detachArtifact, extractFormation, replaceCommander,
} from "../../systems/unitCompositionSystem";
import { calculateUnitDerived, synchronizeUnitProjection } from "../../systems/unitEffectSystem";
import type { AdminHandlerDeps } from "./deps";
import { StateValidationError } from "../stateValidation";
import { getTileAt } from "./helpers";

type Collection = "tags" | "tagRelations" | "itemKinds" | "doctrines";
type RecordCollection = Exclude<Collection, "tagRelations">;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function location(value: unknown): InventoryLocation | null {
  const raw = record(value);
  if (!raw) return null;
  const positive = (v: unknown): v is number => Number.isInteger(v) && Number(v) > 0;
  switch (raw.kind) {
    case "FLEET": return positive(raw.fleetId) ? { kind: "FLEET", fleetId: raw.fleetId } : null;
    case "PLANET_STORAGE": return positive(raw.planetId) && positive(raw.playerId)
      ? { kind: "PLANET_STORAGE", planetId: raw.planetId, playerId: raw.playerId } : null;
    case "PLANET_SHOP": return positive(raw.planetId) ? { kind: "PLANET_SHOP", planetId: raw.planetId } : null;
    case "STATION_STORAGE": return positive(raw.stationId) && positive(raw.playerId)
      ? { kind: "STATION_STORAGE", stationId: raw.stationId, playerId: raw.playerId } : null;
    case "STATION_SHOP": return positive(raw.stationId) ? { kind: "STATION_SHOP", stationId: raw.stationId } : null;
    case "PLANET_SECRET": return positive(raw.planetId) ? { kind: "PLANET_SECRET", planetId: raw.planetId } : null;
    case "STATION_SECRET": return positive(raw.stationId) ? { kind: "STATION_SECRET", stationId: raw.stationId } : null;
    case "SHIPWRECK": return positive(raw.shipwreckId) ? { kind: "SHIPWRECK", shipwreckId: raw.shipwreckId } : null;
    default: return null;
  }
}

function normalizedEntry(
  state: GameState, collection: RecordCollection, id: string, body: Record<string, unknown>,
): GameState {
  const candidate = structuredClone(state);
  const target = candidate[collection] ??= {};
  (target as Record<string, unknown>)[id] = { ...body, id };
  normalizeNewModelCollections(candidate);
  return candidate;
}

export function createNewModelAdminHandlers(deps: AdminHandlerDeps) {
  function commit(req: IncomingMessage, res: ServerResponse, operation: string, entityType: string,
    entityId: string, before: unknown, after: unknown): void {
    deps.auditAdminMutation(req, { operation, entityType, entityId, before, after });
    try {
      deps.persistDatabase();
    } catch (error) {
      if (!(error instanceof StateValidationError)) throw error;
      writeJson(res, 400, { error: error.message });
      return;
    }
    deps.broadcastState();
    writeJson(res, 200, { ok: true, value: after });
  }

  function list(req: IncomingMessage, res: ServerResponse, collection: Collection): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, { items: deps.state[collection] ?? (collection === "tagRelations" ? [] : {}) });
  }

  async function put(req: IncomingMessage, res: ServerResponse, collection: RecordCollection, id: string): Promise<void> {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const body = record(await readJsonBody<unknown>(req));
    if (!body || !/^[A-Z0-9_:-]{2,80}$/.test(id)) {
      writeJson(res, 400, { error: "Invalid definition id or payload" }); return;
    }
    let candidate: GameState;
    try {
      candidate = normalizedEntry(deps.state, collection, id, body);
    } catch (error) {
      writeJson(res, 400, { error: error instanceof Error ? error.message : "Invalid definition" });
      return;
    }
    const before = structuredClone(deps.state[collection]?.[id] ?? null);
    const value = candidate[collection]?.[id];
    if (!value) { writeJson(res, 400, { error: "Invalid definition" }); return; }
    (deps.state[collection] ??= {})[id] = value as never;
    commit(req, res, before ? "UPDATE" : "CREATE", collection.toUpperCase(), id, before, value);
  }

  function remove(req: IncomingMessage, res: ServerResponse, collection: RecordCollection, id: string): void {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const target = deps.state[collection];
    const before = target?.[id];
    if (!before) { writeJson(res, 404, { error: "Definition not found" }); return; }
    delete target[id];
    commit(req, res, "DELETE", collection.toUpperCase(), id, before, null);
  }

  async function putTagRelation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const body = record(await readJsonBody<unknown>(req));
    if (!body || typeof body.tagAId !== "string" || typeof body.tagBId !== "string"
      || !deps.state.tags?.[body.tagAId] || !deps.state.tags?.[body.tagBId]
      || !["ALLY", "NEUTRAL", "HOSTILE"].includes(String(body.relation))) {
      writeJson(res, 400, { error: "Invalid Tag relation" }); return;
    }
    const key = [body.tagAId, body.tagBId].sort().join(":");
    const relations = deps.state.tagRelations ??= [];
    const index = relations.findIndex((entry) => [entry.tagAId, entry.tagBId].sort().join(":") === key);
    const before = index < 0 ? null : structuredClone(relations[index]);
    const relation = { tagAId: body.tagAId, tagBId: body.tagBId,
      relation: body.relation as "ALLY" | "NEUTRAL" | "HOSTILE" };
    if (index < 0) relations.push(relation); else relations[index] = relation;
    commit(req, res, before ? "UPDATE" : "CREATE", "TAG_RELATION", key, before, relation);
  }

  async function deleteTagRelation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const body = record(await readJsonBody<unknown>(req));
    if (!body || typeof body.tagAId !== "string" || typeof body.tagBId !== "string") {
      writeJson(res, 400, { error: "Invalid Tag relation" }); return;
    }
    const key = [body.tagAId, body.tagBId].sort().join(":");
    const relations = deps.state.tagRelations ??= [];
    const before = relations.find((entry) => [entry.tagAId, entry.tagBId].sort().join(":") === key);
    if (!before) { writeJson(res, 404, { error: "Tag relation not found" }); return; }
    deps.state.tagRelations = relations.filter((entry) => [entry.tagAId, entry.tagBId].sort().join(":") !== key);
    commit(req, res, "DELETE", "TAG_RELATION", key, before, null);
  }

  async function createFormation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const body = record(await readJsonBody<unknown>(req));
    const owner = location(body?.owner);
    const kind = typeof body?.kind === "string" ? deps.state.itemKinds?.[body.kind] : undefined;
    if (!body || !owner || !kind || kind.type !== "PRODUCT"
      || !Number.isFinite(kind.baseCombatPower) || !Number.isInteger(kind.maxHealth)
      || (kind.maxHealth ?? 0) <= 0) {
      writeJson(res, 400, { error: "Invalid PRODUCT kind or inventory" }); return;
    }
    const maxHealth = kind.maxHealth as number;
    const currentHealth = body.currentHealth === undefined ? maxHealth : body.currentHealth;
    if (typeof currentHealth !== "number" || !Number.isInteger(currentHealth)
      || currentHealth <= 0 || currentHealth > maxHealth) {
      writeJson(res, 400, { error: "Invalid Formation health" }); return;
    }
    const inventory = resolveItemInventory(deps.state, owner, true);
    if (!inventory) { writeJson(res, 400, { error: "Invalid inventory" }); return; }
    const id = `formation-${deps.state.nextIds.formation ?? 1}`;
    deps.state.nextIds.formation = (deps.state.nextIds.formation ?? 1) + 1;
    const formation = { id, type: "PRODUCT" as const, kind: kind.id,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : kind.name,
      baseCombatPower: kind.baseCombatPower!, maxHealth,
      currentHealth, tags: [...kind.tags], owner };
    (deps.state.formations ??= {})[id] = formation;
    (inventory.productIds ??= []).push(id);
    commit(req, res, "CREATE", "FORMATION", id, null, formation);
  }

  async function createUnit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const body = record(await readJsonBody<unknown>(req));
    const ownerId = body?.ownerPlayerId;
    const q = body?.q;
    const r = body?.r;
    const domain = body?.domain;
    const commanderKindId = body?.commanderKindId;
    const formationKindIds = body?.formationKindIds;
    if (!Number.isInteger(ownerId) || !deps.state.players[Number(ownerId)]
      || !Number.isInteger(q) || !Number.isInteger(r)
      || (domain !== "SPACE" && domain !== "GROUND")
      || typeof commanderKindId !== "string" || !Array.isArray(formationKindIds)
      || formationKindIds.length === 0 || formationKindIds.some((id) => typeof id !== "string")
      || (body?.name !== undefined && (typeof body.name !== "string" || !body.name.trim()))
      || (body?.morale !== undefined && (typeof body.morale !== "number"
        || !Number.isFinite(body.morale) || body.morale < -100 || body.morale > 100))) {
      writeJson(res, 400, { error: "Invalid Unit composition" }); return;
    }
    const position = { q: Number(q), r: Number(r) };
    const tile = getTileAt(deps.state, position);
    if (!tile || tile.terrainType === "OBSTACLE"
      || (domain === "GROUND" && !Object.values(deps.state.planets).some((planet) =>
        planet.position.q === position.q && planet.position.r === position.r))) {
      writeJson(res, 400, { error: "Invalid Unit placement" }); return;
    }
    const commanderKind = deps.state.itemKinds?.[commanderKindId];
    const formationKinds = formationKindIds.map((id) => deps.state.itemKinds?.[id as string]);
    if (!commanderKind || commanderKind.type !== "ARTIFACT" || commanderKind.commanderCapable !== true
      || formationKinds.some((kind) => !kind || kind.type !== "PRODUCT"
        || !Number.isFinite(kind.baseCombatPower) || !Number.isInteger(kind.maxHealth)
        || (kind.maxHealth ?? 0) <= 0)) {
      writeJson(res, 400, { error: "Commander and combat PRODUCT kinds are required" }); return;
    }
    const unitId = deps.state.nextIds.unit++;
    const artifactId = `artifact-${deps.state.nextIds.artifact++}`;
    const unit: Fleet = {
      id: unitId, ownerPlayerId: Number(ownerId),
      name: typeof body?.name === "string" ? body.name.trim() : `${domain === "SPACE" ? "Fleet" : "Army"} ${unitId}`,
      position, domain, morale: typeof body?.morale === "number" ? body.morale : 0,
      commanderArtifactId: artifactId, formationIds: [], attachedArtifactIds: [artifactId], assignedDoctrineIds: [],
      combatPower: 0, health: 0, influence: 0,
      movementPoints: domain === "SPACE" ? deps.state.systemSettings.baseFleetMovementPoints : 0,
      maxMovementPoints: domain === "SPACE" ? deps.state.systemSettings.baseFleetMovementPoints : 0,
      isNavigator: false, warpVisibility: null, visionRange: domain === "SPACE" ? 2 : 1,
      shareVisionWithAllies: false, capacity: 0, stance: "ATTACK", inventory: {},
      itemInventory: createEmptyItemInventory(), tags: [],
    };
    unit.itemInventory.artifactIds.push(artifactId);
    deps.state.fleets[unitId] = unit;
    deps.state.artifacts[artifactId] = {
      id: artifactId, type: "ARTIFACT", kind: commanderKind.id, definitionCode: commanderKind.id,
      name: commanderKind.name, owner: { kind: "FLEET", fleetId: unitId }, configuration: {},
      isNavigator: commanderKind.isNavigator === true, warpVisibility: commanderKind.warpVisibility ?? null,
      ...(commanderKind.warpVisibility !== null && commanderKind.warpVisibility !== undefined
        ? { navigatorOriginPlayerId: Number(ownerId) } : {}),
      consumable: false, tags: [...commanderKind.tags], effects: [...(commanderKind.effects ?? [])],
      attachedUnitId: unitId,
    };
    for (const kind of formationKinds) {
      if (!kind) continue;
      const id = `formation-${deps.state.nextIds.formation ?? 1}`;
      deps.state.nextIds.formation = (deps.state.nextIds.formation ?? 1) + 1;
      (deps.state.formations ??= {})[id] = {
        id, type: "PRODUCT", kind: kind.id, name: kind.name,
        baseCombatPower: kind.baseCombatPower!, maxHealth: kind.maxHealth!,
        currentHealth: kind.maxHealth!, tags: [...kind.tags], owner: { kind: "UNIT", unitId },
      };
      unit.formationIds!.push(id);
    }
    synchronizeUnitProjection(deps.state, unitId);
    commit(req, res, "CREATE", "UNIT", String(unitId), null, structuredClone(unit));
  }

  async function composeUnit(req: IncomingMessage, res: ServerResponse, unitId: number,
    action: "attach-formation" | "extract-formation" | "attach-artifact" | "detach-artifact" | "replace-commander" | "doctrines"): Promise<void> {
    if (!deps.requireAdmin(req, res) || !deps.ensurePlanningPhase(res)) return;
    const unit = deps.state.fleets[unitId];
    if (!unit) { writeJson(res, 404, { error: "Unit not found" }); return; }
    const body = record(await readJsonBody<unknown>(req));
    if (!body) { writeJson(res, 400, { error: "Invalid Unit payload" }); return; }
    const before = structuredClone(unit);
    try {
      switch (action) {
        case "attach-formation":
          if (typeof body.formationId !== "string") throw new Error("formationId required");
          attachFormation(deps.state, unitId, body.formationId); break;
        case "extract-formation": {
          const destination = location(body.destination);
          if (typeof body.formationId !== "string" || !destination) throw new Error("Invalid extraction");
          extractFormation(deps.state, unitId, body.formationId, destination); break;
        }
        case "attach-artifact":
          if (typeof body.artifactId !== "string") throw new Error("artifactId required");
          attachArtifact(deps.state, unitId, body.artifactId); break;
        case "detach-artifact":
          if (typeof body.artifactId !== "string") throw new Error("artifactId required");
          detachArtifact(deps.state, unitId, body.artifactId); break;
        case "replace-commander":
          if (typeof body.artifactId !== "string") throw new Error("artifactId required");
          replaceCommander(deps.state, unitId, body.artifactId); break;
        case "doctrines":
          if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string"
            || !deps.state.doctrines?.[id]) || new Set(body.ids).size !== body.ids.length) {
            throw new Error("Invalid Doctrine selection");
          }
          unit.assignedDoctrineIds = body.ids;
          const derived = calculateUnitDerived(deps.state, unitId);
          if (derived?.doctrineSelectionInvalid) throw new Error("Doctrine slots or Tag requirements not met");
          synchronizeUnitProjection(deps.state, unitId);
          break;
        default: {
          const exhaustive: never = action;
          throw new Error(`Unsupported action ${exhaustive}`);
        }
      }
    } catch (error) {
      // Composition helpers validate before mutating; the doctrine assignment is restored here.
      if (action === "doctrines") unit.assignedDoctrineIds = before.assignedDoctrineIds;
      writeJson(res, 400, { error: error instanceof Error ? error.message : "Invalid Unit action" }); return;
    }
    commit(req, res, action.toUpperCase(), "UNIT", String(unitId), before, structuredClone(unit));
  }

  function unitDetails(req: IncomingMessage, res: ServerResponse, unitId: number): void {
    if (!deps.requireAdmin(req, res)) return;
    const unit = deps.state.fleets[unitId];
    if (!unit) { writeJson(res, 404, { error: "Unit not found" }); return; }
    writeJson(res, 200, { unit, derived: calculateUnitDerived(deps.state, unitId),
      formations: (unit.formationIds ?? []).map((id) => deps.state.formations?.[id]).filter(Boolean) });
  }

  return { list, put, remove, putTagRelation, deleteTagRelation, createFormation, createUnit,
    composeUnit, unitDetails };
}
