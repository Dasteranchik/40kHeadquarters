import { IncomingMessage, ServerResponse } from "http";

import { isPlanetTag, isPlanetWorldType, isTitheLevel, titheValue } from "../../planetDomain";
import { Planet } from "../../types";
import { isFiniteNumber, isValidId } from "../../utils/validation";
import { AddPlanetRequest, UpdatePlanetRequest } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";
import {
  getTileAt,
  parseIntelFragments,
  parseResourceStore,
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

export function createPlanetAdminHandlers(deps: AdminHandlerDeps): PlanetAdminHandlers {
  async function handleAddPlanet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<AddPlanetRequest>(req);
    if (
      !body ||
      typeof body.id !== "string" ||
      !isFiniteNumber(body.q) ||
      !isFiniteNumber(body.r)
    ) {
      writeJson(res, 400, { error: "Invalid planet payload" });
      return;
    }

    if (!isValidId(body.id)) {
      writeJson(res, 400, { error: "Planet id must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (deps.state.planets[body.id]) {
      writeJson(res, 409, { error: "Planet id already exists" });
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

    const numericChecks: Array<[unknown, string]> = [
      [body.population, "population"],
      [body.morale, "morale"],
      [body.tithePaid, "tithePaid"],
      [body.influenceValue, "influenceValue"],
      [body.visionRange, "visionRange"],
      [body.overviewRange, "overviewRange"],
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

    const parsedRawStock =
      body.rawStock === undefined ? {} : parseResourceStore(body.rawStock);
    if (parsedRawStock === null) {
      writeJson(res, 400, { error: "rawStock must be an object<ResourceKey, number>" });
      return;
    }

    const parsedProductStorage =
      body.productStorage === undefined ? {} : parseResourceStore(body.productStorage);
    if (parsedProductStorage === null) {
      writeJson(res, 400, { error: "productStorage must be an object<ResourceKey, number>" });
      return;
    }

    const parsedInfoFragments =
      body.infoFragments === undefined ? {} : parseIntelFragments(body.infoFragments);
    if (parsedInfoFragments === null) {
      writeJson(res, 400, { error: "infoFragments must be an object<InfoCategory, number>" });
      return;
    }

    const coord = { q: Math.trunc(body.q), r: Math.trunc(body.r) };
    const tile = getTileAt(deps.state, coord);
    if (!tile) {
      writeJson(res, 400, { error: "Planet position is outside the map" });
      return;
    }

    if (tile.planetId) {
      writeJson(res, 409, { error: "Tile already has a planet" });
      return;
    }

    if (tile.terrainType === "OBSTACLE") {
      writeJson(res, 400, { error: "Cannot place planet on obstacle tile" });
      return;
    }

    const titheLevel = body.titheLevel ?? "DECUMA_PRIMA";
    const visionRange = Math.max(0, Math.trunc(body.visionRange ?? 1));
    const planet: Planet = {
      id: body.id,
      position: coord,
      worldType: body.worldType ?? "AGRI_WORLD",
      worldTags: body.worldTags ? [...new Set(body.worldTags)] : [],
      population: Math.max(0, Math.trunc(body.population ?? 60)),
      morale: Math.max(0, Math.trunc(body.morale ?? 5)),
      titheLevel,
      titheTarget: titheValue(titheLevel),
      tithePaid: Math.max(0, Math.trunc(body.tithePaid ?? 0)),
      resourceProduction: 0,
      influenceValue: Math.max(0, Math.trunc(body.influenceValue ?? 1)),
      visionRange,
      overviewRange: Math.max(0, Math.trunc(body.overviewRange ?? visionRange)),
      rawStock: parsedRawStock,
      productStorage: parsedProductStorage,
      infoFragments: parsedInfoFragments,
    };

    setPlanetResourceProduction(planet);

    deps.state.planets[planet.id] = planet;
    tile.planetId = planet.id;

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

    const tile = getTileAt(deps.state, planet.position);
    if (tile && tile.planetId === planetId) {
      delete tile.planetId;
    }

    delete deps.state.planets[planetId];
    deps.state.pendingInformantActions = deps.state.pendingInformantActions.filter(
      (entry) => entry.planetId !== planetId,
    );
    deps.state.pendingTitheChanges = deps.state.pendingTitheChanges.filter(
      (entry) => entry.planetId !== planetId,
    );

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { removedPlanetId: planetId });
  }

  function handleListPlanets(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    const planets = Object.values(deps.state.planets).sort((a, b) => a.id.localeCompare(b.id));
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

    const body = await readJsonBody<UpdatePlanetRequest>(req);
    if (!body) {
      writeJson(res, 400, { error: "Invalid planet payload" });
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

    const numericChecks: Array<[unknown, string]> = [
      [body.population, "population"],
      [body.morale, "morale"],
      [body.tithePaid, "tithePaid"],
      [body.influenceValue, "influenceValue"],
      [body.visionRange, "visionRange"],
      [body.overviewRange, "overviewRange"],
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

    const parsedRawStock =
      body.rawStock === undefined ? undefined : parseResourceStore(body.rawStock);
    if (parsedRawStock === null) {
      writeJson(res, 400, { error: "rawStock must be an object<ResourceKey, number>" });
      return;
    }

    const parsedProductStorage =
      body.productStorage === undefined ? undefined : parseResourceStore(body.productStorage);
    if (parsedProductStorage === null) {
      writeJson(res, 400, { error: "productStorage must be an object<ResourceKey, number>" });
      return;
    }

    const parsedInfoFragments =
      body.infoFragments === undefined ? undefined : parseIntelFragments(body.infoFragments);
    if (parsedInfoFragments === null) {
      writeJson(res, 400, { error: "infoFragments must be an object<InfoCategory, number>" });
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

      if (nextTile.planetId && nextTile.planetId !== planetId) {
        writeJson(res, 409, { error: "Tile already has a planet" });
        return;
      }

      const prevTile = getTileAt(deps.state, planet.position);
      if (prevTile && prevTile.planetId === planetId) {
        delete prevTile.planetId;
      }

      nextTile.planetId = planetId;
      planet.position = nextPosition;
    }

    if (body.worldType !== undefined) {
      planet.worldType = body.worldType;
    }

    if (body.worldTags !== undefined) {
      planet.worldTags = [...new Set(body.worldTags)];
    }

    if (body.population !== undefined) {
      planet.population = Math.max(0, Math.trunc(body.population));
    }

    if (body.morale !== undefined) {
      planet.morale = Math.max(0, Math.trunc(body.morale));
    }

    if (body.titheLevel !== undefined) {
      planet.titheLevel = body.titheLevel;
      planet.titheTarget = titheValue(body.titheLevel);
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

    if (body.overviewRange !== undefined) {
      planet.overviewRange = Math.max(0, Math.trunc(body.overviewRange));
    }

    if (parsedRawStock !== undefined) {
      planet.rawStock = parsedRawStock;
    }

    if (parsedProductStorage !== undefined) {
      planet.productStorage = parsedProductStorage;
    }

    if (parsedInfoFragments !== undefined) {
      planet.infoFragments = parsedInfoFragments;
    }

    setPlanetResourceProduction(planet);

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
