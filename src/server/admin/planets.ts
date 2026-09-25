import { IncomingMessage, ServerResponse } from "http";

import { calculateTitheProgress, isPlanetTag, isPlanetWorldType, isTitheLevel, titheValue } from "../../planetDomain";
import { Planet } from "../../types";
import { createEmptyShop } from "../../shopDomain";
import { isFiniteNumber, isValidId } from "../../utils/validation";
import { AddPlanetRequest, UpdatePlanetRequest } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";
import { isUnitTag } from "../../unitDomain";
import { clampMorale } from "../../moraleDomain";
import {
  getTileAt,
  parseIntelFragments,
  parsePlayerProductStorages,
  parseResourceStore,
  parseSecretStorageUpdate,
  setPlanetResourceProduction,
} from "./helpers";

export interface PlanetAdminHandlers {
  handleAddPlanet: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeletePlanet: (req: IncomingMessage, res: ServerResponse, planetId: string) => void;
  handleListPlanets: (req: IncomingMessage, res: ServerResponse) => void;
  handleUpdatePlanet: (
    req: IncomingMessage,
    res: ServerResponse,
    planetId: string,
  ) => Promise<void>;
}

function syncLegacyPlanetIdAt(
  deps: AdminHandlerDeps,
  position: Planet["position"],
): void {
  const tile = getTileAt(deps.state, position);
  if (!tile) return;
  const first = Object.values(deps.state.planets)
    .filter((planet) => planet.position.q === position.q && planet.position.r === position.r)
    .sort((a, b) => a.id - b.id)[0];
  if (first) tile.planetId = first.id;
  else delete tile.planetId;
}

export function createPlanetAdminHandlers(deps: AdminHandlerDeps): PlanetAdminHandlers {
  async function handleAddPlanet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<AddPlanetRequest>(req);
    if (
      !body ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      !isFiniteNumber(body.q) ||
      !isFiniteNumber(body.r)
    ) {
      writeJson(res, 400, { error: "Invalid planet payload" });
      return;
    }


    if (body.worldType !== undefined && !isPlanetWorldType(body.worldType)) {
      writeJson(res, 400, { error: "worldType is invalid" });
      return;
    }

    if (
      body.worldTags !== undefined &&
      (!Array.isArray(body.worldTags) || body.worldTags.some((tag) => !isPlanetTag(tag)))
    ) {
      writeJson(res, 400, { error: "worldTags must be an array of valid tags" });
      return;
    }
    if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => !isUnitTag(tag)))) {
      writeJson(res, 400, { error: "tags must be valid Tag codes" }); return;
    }

    const numericChecks: Array<[unknown, string]> = [
      [body.population, "population"],
      [body.morale, "morale"],
      [body.tithePaid, "tithePaid"],
      [body.influenceValue, "influenceValue"],
      [body.visionRange, "visionRange"],
    ];

    for (const [value, field] of numericChecks) {
      if (value !== undefined && !isFiniteNumber(value)) {
        writeJson(res, 400, { error: `${field} must be a number` });
        return;
      }
    }
    if (body.morale !== undefined && (body.morale < -100 || body.morale > 100)) {
      writeJson(res, 400, { error: "morale must be between -100 and 100" }); return;
    }

    if (body.titheLevel !== undefined && !isTitheLevel(body.titheLevel)) {
      writeJson(res, 400, { error: "titheLevel is invalid" });
      return;
    }
    if (body.maxTitheLevel !== undefined && !isTitheLevel(body.maxTitheLevel)) {
      writeJson(res, 400, { error: "maxTitheLevel is invalid" });
      return;
    }

    const parsedRawStock =
      body.rawStock === undefined ? {} : parseResourceStore(body.rawStock, true);
    if (parsedRawStock === null) {
      writeJson(res, 400, { error: "rawStock must be an object<ResourceKey, number>" });
      return;
    }

    const parsedProductStorages = body.productStorageByPlayerId === undefined
      ? {}
      : parsePlayerProductStorages(body.productStorageByPlayerId, deps.state);
    if (parsedProductStorages === null) {
      writeJson(res, 400, { error: "productStorageByPlayerId must contain valid player resource stores" });
      return;
    }
    const parsedGeneration = body.resourceGeneration === undefined
      ? {} : parseResourceStore(body.resourceGeneration);
    const parsedContributions = body.titheContributions === undefined
      ? {} : parseResourceStore(body.titheContributions);
    if (parsedGeneration === null || parsedContributions === null) {
      writeJson(res, 400, { error: "generation and tithe contributions must be resource stores" });
      return;
    }

    const parsedInfoFragments =
      body.infoFragments === undefined ? {} : parseIntelFragments(body.infoFragments);
    if (parsedInfoFragments === null) {
      writeJson(res, 400, { error: "infoFragments must be an object<InfoCategory, number>" });
      return;
    }
    const parsedSecretStorage = body.secretStorage === undefined
      ? { ok: true as const, storage: undefined }
      : parseSecretStorageUpdate(deps.state, body.secretStorage);
    if (!parsedSecretStorage.ok) {
      writeJson(res, 400, { error: parsedSecretStorage.error });
      return;
    }

    const coord = { q: Math.trunc(body.q), r: Math.trunc(body.r) };
    const tile = getTileAt(deps.state, coord);
    if (!tile) {
      writeJson(res, 400, { error: "Planet position is outside the map" });
      return;
    }

    if (tile.terrainType === "OBSTACLE") {
      writeJson(res, 400, { error: "Cannot place planet on obstacle tile" });
      return;
    }

    const titheLevel = body.titheLevel ?? "DECUMA_PRIMA";
    const visionRange = Math.max(0, Math.trunc(body.visionRange ?? 1));
    const planet: Planet = {
      id: deps.state.nextIds.planet++,
      name: body.name.trim(),
      position: coord,
      worldType: body.worldType ?? "AGRI_WORLD",
      worldTags: body.worldTags ? [...new Set(body.worldTags)] : [],
      tags: body.tags ? [...new Set(body.tags)] : [],
      population: Math.max(0, Math.trunc(body.population ?? 60)),
      morale: Math.max(-100, Math.min(100, body.morale ?? 5)),
      titheLevel,
      maxTitheLevel: body.maxTitheLevel ?? titheLevel,
      titheTarget: titheValue(titheLevel),
      tithePaid: Math.max(0, Math.trunc(body.tithePaid ?? 0)),
      titheContributions: parsedContributions,
      resourceGeneration: parsedGeneration,
      resourceProduction: 0,
      influenceValue: Math.max(0, Math.trunc(body.influenceValue ?? 1)),
      visionRange,
      rawStock: parsedRawStock,
      productStorageByPlayerId: parsedProductStorages,
      itemStorageByPlayerId: {},
      shop: createEmptyShop(),
      infoFragments: parsedInfoFragments,
      ...(parsedSecretStorage.storage ? { secretStorage: parsedSecretStorage.storage } : {}),
    };

    const initialTitheProgress = calculateTitheProgress(
      planet.maxTitheLevel,
      planet.titheContributions,
    );
    planet.titheLevel = initialTitheProgress.currentLevel;
    planet.tithePaid = initialTitheProgress.paid;
    planet.titheTarget = initialTitheProgress.target;

    setPlanetResourceProduction(planet);

    deps.state.planets[planet.id] = planet;
    syncLegacyPlanetIdAt(deps, planet.position);

    deps.auditAdminMutation(req, {
      operation: "CREATE_PLANET", entityType: "PLANET", entityId: planet.id, after: planet,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 201, { planet });
  }

  function handleDeletePlanet(req: IncomingMessage, res: ServerResponse, planetId: string): void {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const planet = deps.state.planets[planetId];
    if (!planet) {
      writeJson(res, 404, { error: "Planet not found" });
      return;
    }
    const removedPlanet = structuredClone(planet);

    const artifactIds = new Set<string>([
      ...planet.shop.items.artifactIds,
      ...Object.values(planet.itemStorageByPlayerId).flatMap((inventory) => inventory.artifactIds),
      ...(planet.secretStorage?.itemInventory.artifactIds ?? []),
    ]);
    for (const artifactId of artifactIds) delete deps.state.artifacts[artifactId];
    const formationIds = new Set<string>([
      ...(planet.shop.items.productIds ?? []),
      ...Object.values(planet.itemStorageByPlayerId).flatMap((items) => items.productIds ?? []),
      ...(planet.secretStorage?.itemInventory.productIds ?? []),
    ]);
    for (const formationId of formationIds) delete deps.state.formations?.[formationId];

    const previousPosition = { ...planet.position };
    delete deps.state.planets[planetId];
    syncLegacyPlanetIdAt(deps, previousPosition);
    deps.state.pendingInformantActions = deps.state.pendingInformantActions.filter(
      (entry) => Number(entry.planetId) !== Number(planetId),
    );
    deps.state.pendingTitheChanges = deps.state.pendingTitheChanges.filter(
      (entry) => Number(entry.planetId) !== Number(planetId),
    );
    deps.state.administratumWorldReports = deps.state.administratumWorldReports.filter(
      (entry) => Number(entry.planetId) !== Number(planetId),
    );
    deps.state.administratumTitheProposals = deps.state.administratumTitheProposals.filter(
      (entry) => Number(entry.planetId) !== Number(planetId),
    );

    deps.auditAdminMutation(req, {
      operation: "DELETE_PLANET", entityType: "PLANET", entityId: planetId, before: removedPlanet,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { removedPlanetId: planetId });
  }

  function handleListPlanets(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    const planets = Object.values(deps.state.planets).sort((a, b) => a.id - b.id);
    writeJson(res, 200, { planets });
  }

  async function handleUpdatePlanet(
    req: IncomingMessage,
    res: ServerResponse,
    planetId: string,
  ): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const planet = deps.state.planets[planetId];
    if (!planet) {
      writeJson(res, 404, { error: "Planet not found" });
      return;
    }
    const planetBeforeUpdate = structuredClone(planet);

    const body = await readJsonBody<UpdatePlanetRequest>(req);
    if (!body) {
      writeJson(res, 400, { error: "Invalid planet payload" });
      return;
    }

    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      writeJson(res, 400, { error: "name must be a non-empty string" });
      return;
    }

    if (body.q !== undefined && !isFiniteNumber(body.q)) {
      writeJson(res, 400, { error: "q must be a number" });
      return;
    }

    if (body.r !== undefined && !isFiniteNumber(body.r)) {
      writeJson(res, 400, { error: "r must be a number" });
      return;
    }

    if (body.worldType !== undefined && !isPlanetWorldType(body.worldType)) {
      writeJson(res, 400, { error: "worldType is invalid" });
      return;
    }

    if (
      body.worldTags !== undefined &&
      (!Array.isArray(body.worldTags) || body.worldTags.some((tag) => !isPlanetTag(tag)))
    ) {
      writeJson(res, 400, { error: "worldTags must be an array of valid tags" });
      return;
    }
    if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => !isUnitTag(tag)))) {
      writeJson(res, 400, { error: "tags must be valid Tag codes" }); return;
    }

    const numericChecks: Array<[unknown, string]> = [
      [body.population, "population"],
      [body.morale, "morale"],
      [body.tithePaid, "tithePaid"],
      [body.influenceValue, "influenceValue"],
      [body.visionRange, "visionRange"],
    ];

    for (const [value, field] of numericChecks) {
      if (value !== undefined && !isFiniteNumber(value)) {
        writeJson(res, 400, { error: `${field} must be a number` });
        return;
      }
    }

    if (body.titheLevel !== undefined && !isTitheLevel(body.titheLevel)) {
      writeJson(res, 400, { error: "titheLevel is invalid" });
      return;
    }
    if (body.maxTitheLevel !== undefined && !isTitheLevel(body.maxTitheLevel)) {
      writeJson(res, 400, { error: "maxTitheLevel is invalid" });
      return;
    }

    if (body.morale !== undefined && (body.morale < -100 || body.morale > 100)) {
      writeJson(res, 400, { error: "morale must be between -100 and 100" }); return;
    }
    const parsedRawStock =
      body.rawStock === undefined ? undefined : parseResourceStore(body.rawStock, true);
    if (parsedRawStock === null) {
      writeJson(res, 400, { error: "rawStock must be an object<ResourceKey, number>" });
      return;
    }

    const parsedProductStorages = body.productStorageByPlayerId === undefined
      ? undefined
      : parsePlayerProductStorages(body.productStorageByPlayerId, deps.state);
    if (parsedProductStorages === null) {
      writeJson(res, 400, { error: "productStorageByPlayerId must contain valid player resource stores" });
      return;
    }
    const parsedGeneration = body.resourceGeneration === undefined
      ? undefined : parseResourceStore(body.resourceGeneration);
    const parsedContributions = body.titheContributions === undefined
      ? undefined : parseResourceStore(body.titheContributions);
    if (parsedGeneration === null || parsedContributions === null) {
      writeJson(res, 400, { error: "generation and tithe contributions must be resource stores" });
      return;
    }

    const parsedInfoFragments =
      body.infoFragments === undefined ? undefined : parseIntelFragments(body.infoFragments);
    if (parsedInfoFragments === null) {
      writeJson(res, 400, { error: "infoFragments must be an object<InfoCategory, number>" });
      return;
    }
    const parsedSecretStorage = body.secretStorage === undefined
      ? undefined
      : parseSecretStorageUpdate(deps.state, body.secretStorage, planet.secretStorage);
    if (parsedSecretStorage && !parsedSecretStorage.ok) {
      writeJson(res, 400, { error: parsedSecretStorage.error });
      return;
    }

    const nextPosition = {
      q: body.q !== undefined ? Math.trunc(body.q) : planet.position.q,
      r: body.r !== undefined ? Math.trunc(body.r) : planet.position.r,
    };

    const moved =
      nextPosition.q !== planet.position.q ||
      nextPosition.r !== planet.position.r;

    if (moved) {
      const nextTile = getTileAt(deps.state, nextPosition);
      if (!nextTile) {
        writeJson(res, 400, { error: "Planet position is outside the map" });
        return;
      }

      if (nextTile.terrainType === "OBSTACLE") {
        writeJson(res, 400, { error: "Cannot place planet on obstacle tile" });
        return;
      }

      const previousPosition = { ...planet.position };
      planet.position = nextPosition;
      syncLegacyPlanetIdAt(deps, previousPosition);
      syncLegacyPlanetIdAt(deps, nextPosition);
    }

    if (body.worldType !== undefined) {
      planet.worldType = body.worldType;
    }

    if (body.name !== undefined) {
      planet.name = body.name.trim();
    }

    if (body.worldTags !== undefined) {
      planet.worldTags = [...new Set(body.worldTags)];
    }
    if (body.tags !== undefined) planet.tags = [...new Set(body.tags)];

    if (body.population !== undefined) {
      planet.population = Math.max(0, Math.trunc(body.population));
    }

    if (body.morale !== undefined) {
      planet.morale = body.morale;
    }

    if (body.titheLevel !== undefined) {
      // TODO(DEC-002): this preserves generic GM CRUD only. Do not infer the
      // Administratum gameplay rule or its costs/effects from this field edit.
      planet.titheLevel = body.titheLevel;
      planet.titheTarget = titheValue(body.titheLevel);
    }
    if (body.maxTitheLevel !== undefined) {
      const increase = Math.max(0, titheValue(body.maxTitheLevel) - titheValue(planet.maxTitheLevel));
      planet.maxTitheLevel = body.maxTitheLevel;
      if (increase > 0) planet.morale = clampMorale(planet.morale - increase);
    }

    if (body.tithePaid !== undefined) {
      planet.tithePaid = Math.max(0, Math.trunc(body.tithePaid));
    }

    if (body.influenceValue !== undefined) {
      planet.influenceValue = Math.max(0, Math.trunc(body.influenceValue));
    }

    if (body.visionRange !== undefined) {
      planet.visionRange = Math.max(0, Math.trunc(body.visionRange));
    }

    if (parsedRawStock !== undefined) {
      planet.rawStock = parsedRawStock;
    }

    if (parsedProductStorages !== undefined) {
      planet.productStorageByPlayerId = parsedProductStorages;
    }
    if (parsedGeneration !== undefined) planet.resourceGeneration = parsedGeneration;
    if (parsedContributions !== undefined) planet.titheContributions = parsedContributions;

    if (parsedInfoFragments !== undefined) {
      planet.infoFragments = parsedInfoFragments;
    }
    if (parsedSecretStorage?.ok) {
      if (parsedSecretStorage.storage) planet.secretStorage = parsedSecretStorage.storage;
      else delete planet.secretStorage;
    }

    const titheProgress = calculateTitheProgress(
      planet.maxTitheLevel,
      planet.titheContributions,
    );
    planet.titheLevel = titheProgress.currentLevel;
    planet.tithePaid = titheProgress.paid;
    planet.titheTarget = titheProgress.target;

    setPlanetResourceProduction(planet);

    deps.auditAdminMutation(req, {
      operation: "UPDATE_PLANET", entityType: "PLANET", entityId: planetId,
      before: planetBeforeUpdate, after: planet,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { planet });
  }

  return {
    handleAddPlanet,
    handleDeletePlanet,
    handleListPlanets,
    handleUpdatePlanet,
  };
}
