import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";

import { SYSTEM_KNOWLEDGE } from "../src/itemDomain";
import { createPasswordVerifier, validateAllowedTypeKeys } from "../src/secretStorageDomain";
import { parseSecretStorageUpdate } from "../src/server/admin/helpers";
import { createUnitVariantAdminHandlers } from "../src/server/admin/unitVariants";
import { createWorldObjectAdminHandlers } from "../src/server/admin/worldObjects";
import { normalizeGameState } from "../src/server/normalization";
import { createRealtimeController } from "../src/server/realtime";
import { createInitialGameState } from "../src/server/seed";
import { buildStateForSession } from "../src/server/visibility";
import {
  proposeTithe,
  reportWorld,
  resolveAdministratumTitheProposals,
} from "../src/systems/administratumSystem";
import {
  armyCapacityUsed,
  carrierCapacityUsed,
  requestArmyEmbark,
  respondArmyEmbark,
} from "../src/systems/armyTransportSystem";
import { registerArtifactEffect } from "../src/systems/artifactEffectRegistry";
import { appendAudit } from "../src/systems/auditSystem";
import { detectObjectsForFleetAtCurrentHex } from "../src/systems/detectionSystem";
import { getProcessedCommandResult, rememberProcessedCommand } from "../src/systems/idempotencySystem";
import { copyKnowledge, transferArtifact } from "../src/systems/itemSystem";
import { executeMovement } from "../src/systems/movementSystem";
import { convertFuelToMovement } from "../src/systems/movementPointSystem";
import {
  collectNavigatorVisionSources,
  collectVisibleWarpTileKeysForPlayer,
  isEffectiveNavigator,
} from "../src/systems/navigatorSystem";
import { applyImmediatePlanetAction, applyPlanetSystems } from "../src/systems/planetSystem";
import { applyImmediateResourceTransfer } from "../src/systems/resourceTransferSystem";
import { openSecretStorage } from "../src/systems/secretStorageSystem";
import {
  addArtifactToShipwreck,
  addKnowledgeToShipwreck,
  addStackableResourceToShipwreck,
  salvageDestroyedUnits,
} from "../src/systems/shipwreckSystem";
import { tradeWithShop } from "../src/systems/shopSystem";
import { recalcVisibility } from "../src/systems/fogOfWarSystem";
import { createTurnTimerController, type TurnTimerScheduler } from "../src/turn/turnTimer";
import { captureTurnSnapshotEntry, restorePlanningTurnSnapshot } from "../src/turn/turnSnapshot";
import type { GameState, MoveFleetAction, PlanetAction } from "../src/types";
import { getObjectsAtHex, type Station } from "../src/worldObjectDomain";

const makeState = (): GameState => createInitialGameState();

function jsonRequest(body: unknown = {}): IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
}

function jsonResponse(): {
  response: ServerResponse;
  read: () => { status: number; body: unknown };
} {
  let body: unknown;
  const response = {
    statusCode: 200,
    setHeader() {},
    end(chunk?: string) {
      body = chunk ? JSON.parse(chunk) : undefined;
    },
  } as unknown as ServerResponse;
  return {
    response,
    read: () => ({ status: response.statusCode, body }),
  };
}

test("movement spends destination warp cost and stops before an unaffordable hex", () => {
  const game = makeState();
  const fleet = game.fleets[1];
  const first = game.map.tiles.find((tile) =>
    tile.terrainType !== "OBSTACLE"
    && Math.max(Math.abs(tile.q - fleet.position.q), Math.abs(tile.r - fleet.position.r), Math.abs((tile.q + tile.r) - (fleet.position.q + fleet.position.r))) === 1
  );
  assert.ok(first);
  const second = game.map.tiles.find((tile) =>
    tile.terrainType !== "OBSTACLE"
    && Math.max(Math.abs(tile.q - first.q), Math.abs(tile.r - first.r), Math.abs((tile.q + tile.r) - (first.q + first.r))) === 1
    && (tile.q !== fleet.position.q || tile.r !== fleet.position.r)
  );
  assert.ok(second);
  first.warpDisturbanceLevel = 2;
  second.warpDisturbanceLevel = 4;
  fleet.movementPoints = 3;
  const action: MoveFleetAction = {
    id: "warp-move", playerId: fleet.ownerPlayerId, type: "MOVE_FLEET",
    payload: { fleetId: fleet.id, path: [first, second] },
  };
  executeMovement(game, [action]);
  assert.deepEqual(fleet.position, { q: first.q, r: first.r });
  assert.equal(fleet.movementPoints, 1);
});

test("FUEL conversion respects owner, phase, inventory and maximum movement points", () => {
  const game = makeState();
  const fleet = game.fleets[1];
  fleet.movementPoints = 1;
  fleet.maxMovementPoints = 4;
  fleet.inventory.FUEL = 5;
  assert.equal(convertFuelToMovement(game, 2, fleet.id, 1).ok, false);
  assert.equal(convertFuelToMovement(game, 1, fleet.id, 4).ok, false);
  assert.equal(convertFuelToMovement(game, 1, fleet.id, 3).ok, true);
  assert.equal(fleet.movementPoints, 4);
  assert.equal(fleet.inventory.FUEL, 2);
});

test("navigator trait is derived independently from warp visibility", () => {
  const game = makeState();
  const fleet = game.fleets[1];
  game.players[1].manualNavigator = false;
  fleet.isNavigator = false;
  fleet.warpVisibility = null;
  assert.equal(isEffectiveNavigator(game, 1), false);

  game.players[1].manualNavigator = true;
  assert.equal(isEffectiveNavigator(game, 1), true);
  assert.equal(collectVisibleWarpTileKeysForPlayer(game, 1).size, 0);
  fleet.isNavigator = true;
  fleet.isNavigator = false;
  assert.equal(isEffectiveNavigator(game, 1), true);
  game.players[1].manualNavigator = false;

  fleet.warpVisibility = 3;
  assert.equal(isEffectiveNavigator(game, 1), false);
  fleet.warpVisibility = null;

  fleet.isNavigator = true;
  game.players[1].manualNavigator = true;
  game.players[1].manualNavigator = false;
  assert.equal(isEffectiveNavigator(game, 1), true);
  fleet.isNavigator = false;
  game.artifacts.navigator = {
    id: "navigator",
    definitionCode: "NAVIGATOR",
    name: "Navigator",
    owner: { kind: "FLEET", fleetId: fleet.id },
    configuration: {},
    consumable: false,
    isNavigator: true,
    warpVisibility: null,
  };
  fleet.itemInventory.artifactIds.push("navigator");
  assert.equal(isEffectiveNavigator(game, 1), true);
  delete game.artifacts.navigator;
  fleet.itemInventory.artifactIds = [];
  assert.equal(isEffectiveNavigator(game, 1), false);
});

test("warp visibility uses source union, supports zero, stations and no ally sharing", () => {
  const game = makeState();
  const noWarpPayload = buildStateForSession(
    { token: "no-warp", username: "p1", role: "player", playerId: 1, expiresAt: Date.now() + 1000 },
    game,
  );
  assert.ok(noWarpPayload.map.tiles.every((tile) => !Object.hasOwn(tile, "warpDisturbanceLevel")));
  const adminPayload = buildStateForSession(
    { token: "admin", username: "gm", role: "admin", expiresAt: Date.now() + 1000 },
    game,
  );
  assert.ok(adminPayload.map.tiles.every((tile) => Number.isInteger(tile.warpDisturbanceLevel)));
  const fleet = game.fleets[1];
  fleet.isNavigator = true;
  fleet.warpVisibility = 1;
  const allowed = collectVisibleWarpTileKeysForPlayer(game, 1);
  assert.ok(allowed.size > 0);
  assert.ok(allowed.size < game.map.tiles.length);

  fleet.warpVisibility = null;
  assert.equal(collectVisibleWarpTileKeysForPlayer(game, 1).size, 0);
  const rangeSizes = ([0, 1, 2, 3] as const).map((range) => {
    fleet.warpVisibility = range;
    return collectVisibleWarpTileKeysForPlayer(game, 1).size;
  });
  assert.ok(rangeSizes.every((size, index) => index === 0 || size > rangeSizes[index - 1]!));

  fleet.warpVisibility = 0;
  assert.deepEqual(collectVisibleWarpTileKeysForPlayer(game, 1), new Set([
    `${fleet.position.q},${fleet.position.r}`,
  ]));
  fleet.warpVisibility = 1;

  game.players[1].alliances = [2];
  game.players[2].alliances = [1];
  assert.equal(collectVisibleWarpTileKeysForPlayer(game, 2).size, 0);

  const itemHolder = game.fleets[2];
  game.artifacts.warpBeacon = {
    id: "warpBeacon", definitionCode: "WARP_BEACON", name: "Warp beacon",
    owner: { kind: "FLEET", fleetId: itemHolder.id },
    configuration: {}, consumable: false, isNavigator: false, warpVisibility: 3,
  };
  itemHolder.itemInventory.artifactIds.push("warpBeacon");
  assert.ok(collectNavigatorVisionSources(game).some((source) =>
    source.position.q === itemHolder.position.q && source.position.r === itemHolder.position.r
      && source.range === 3
  ));

  const chaosFleet = game.fleets[3];
  game.factions[game.players[2].factionId].isChaos = true;
  chaosFleet.isNavigator = false;
  chaosFleet.warpVisibility = 0;
  assert.deepEqual(collectVisibleWarpTileKeysForPlayer(game, 2), new Set([
    `${chaosFleet.position.q},${chaosFleet.position.r}`,
  ]));
  assert.equal(isEffectiveNavigator(game, 2), false);
  const chaosPayload = buildStateForSession(
    { token: "chaos", username: "p2", role: "player", playerId: 2, expiresAt: Date.now() + 1000 },
    game,
  );
  assert.equal(chaosPayload.players[2].effectiveNavigator, false);
  for (const tile of chaosPayload.map.tiles) {
    assert.equal(
      Object.hasOwn(tile, "warpDisturbanceLevel"),
      tile.q === chaosFleet.position.q && tile.r === chaosFleet.position.r,
    );
  }

  const stationPosition = game.map.tiles.find((tile) =>
    Math.max(
      Math.abs(tile.q - fleet.position.q),
      Math.abs(tile.r - fleet.position.r),
      Math.abs((tile.q + tile.r) - (fleet.position.q + fleet.position.r)),
    ) > 2
  );
  assert.ok(stationPosition);
  game.stations[1] = {
    id: 1, name: "Navis station", position: stationPosition,
    capabilities: [], tags: [], resourceGeneration: {}, rawStock: {},
    productStorageByPlayerId: {}, itemStorageByPlayerId: {},
    shop: { resources: {}, items: { artifactIds: [], knowledge: [] }, disappearingItems: [] },
    infoFragments: {}, ownerFactionId: game.players[1].factionId, warpVisibility: 2,
    fleetCombatPower: 0, armyCombatPower: 0,
  };
  const union = collectVisibleWarpTileKeysForPlayer(game, 1);
  assert.ok(union.size > allowed.size);
  assert.ok(collectNavigatorVisionSources(game).some((source) =>
    source.position.q === stationPosition.q && source.position.r === stationPosition.r
  ));

  const payload = buildStateForSession(
    { token: "nav", username: "p1", role: "player", playerId: 1, expiresAt: Date.now() + 1000 },
    game,
  );
  for (const tile of payload.map.tiles) {
    assert.equal(
      Object.hasOwn(tile, "warpDisturbanceLevel"),
      union.has(`${tile.q},${tile.r}`),
    );
  }
});

test("Artifact Warp Visibility belongs to origin and current holder only", () => {
  const game = makeState();
  const originFleet = game.fleets[1];
  const intermediateFleet = game.fleets[3];
  const finalFleet = game.fleets[5];
  game.artifacts.beacon = {
    id: "beacon",
    definitionCode: "WARP_BEACON",
    name: "Warp beacon",
    owner: { kind: "FLEET", fleetId: originFleet.id },
    configuration: {},
    isNavigator: false,
    warpVisibility: 0,
    navigatorOriginPlayerId: originFleet.ownerPlayerId,
    consumable: false,
  };
  originFleet.itemInventory.artifactIds.push("beacon");

  const beaconRecipients = (): number[] => {
    const artifact = game.artifacts.beacon;
    const holderPosition = artifact.owner.kind === "FLEET"
      ? game.fleets[artifact.owner.fleetId].position
      : null;
    return collectNavigatorVisionSources(game)
      .find((source) => holderPosition
        && source.position.q === holderPosition.q
        && source.position.r === holderPosition.r
        && source.range === 0)?.recipients ?? [];
  };

  assert.deepEqual(beaconRecipients(), [1]);
  assert.equal(transferArtifact(game, { role: "admin" }, "beacon",
    { kind: "FLEET", fleetId: originFleet.id },
    { kind: "FLEET", fleetId: intermediateFleet.id }).ok, true);
  assert.deepEqual([...beaconRecipients()].sort((a, b) => a - b), [1, 2]);
  assert.equal(transferArtifact(game, { role: "admin" }, "beacon",
    { kind: "FLEET", fleetId: intermediateFleet.id },
    { kind: "FLEET", fleetId: finalFleet.id }).ok, true);
  assert.deepEqual([...beaconRecipients()].sort((a, b) => a - b), [1, 3]);
  assert.equal(beaconRecipients().includes(2), false);
});

test("legacy snapshot normalization supplies new fields", () => {
  const legacy = makeState() as GameState & Record<string, unknown>;
  for (const key of [
    "stations", "shipwrecks", "anomalies", "artifacts", "audit",
    "detection", "processedCommands", "turnTimer", "systemSettings", "unitVariants",
    "administratumWorldReports", "administratumTitheProposals",
  ]) delete legacy[key];
  for (const fleet of Object.values(legacy.fleets)) {
    (fleet as typeof fleet & { actionPoints?: number }).actionPoints = fleet.movementPoints;
    delete (fleet as Partial<typeof fleet>).movementPoints;
    delete (fleet as Partial<typeof fleet>).maxMovementPoints;
    delete (fleet as Partial<typeof fleet>).navigatorRange;
    delete (fleet as Partial<typeof fleet>).warpVisibility;
    delete (fleet as Partial<typeof fleet>).itemInventory;
    delete (fleet as Partial<typeof fleet>).tags;
  }
  for (const tile of legacy.map.tiles) delete (tile as Partial<typeof tile>).warpDisturbanceLevel;
  const legacyFaction = legacy.factions[legacy.players[1].factionId] as typeof legacy.factions[number] & {
    isNavigator?: boolean;
  };
  legacyFaction.isNavigator = true;
  const legacyNavigatorFleet = legacy.fleets[1] as typeof legacy.fleets[number] & {
    navigatorRange?: number;
  };
  legacyNavigatorFleet.navigatorRange = 2;
  delete (legacyNavigatorFleet as Partial<typeof legacyNavigatorFleet>).isNavigator;
  for (const player of Object.values(legacy.players)) {
    delete (player as Partial<typeof player>).manualNavigator;
  }
  for (const planet of Object.values(legacy.planets)) {
    delete (planet as Partial<typeof planet>).shop;
    delete (planet as Partial<typeof planet>).itemStorageByPlayerId;
  }
  const normalized = normalizeGameState(legacy);
  assert.deepEqual(normalized.stations, {});
  assert.deepEqual(normalized.audit, []);
  assert.deepEqual(normalized.fleets[1].tags, []);
  assert.equal(normalized.systemSettings.baseFleetMovementPoints, 1);
  assert.equal(normalized.fleets[1].movementPoints, 3);
  assert.equal(normalized.fleets[1].maxMovementPoints, 3);
  assert.equal(normalized.players[1].manualNavigator, true);
  assert.equal(normalized.fleets[1].isNavigator, true);
  assert.equal(normalized.fleets[1].warpVisibility, 2);
  assert.deepEqual(normalized.unitVariants, {});
  assert.deepEqual(normalized.administratumWorldReports, []);
  assert.ok(normalized.map.tiles.every((tile) => tile.warpDisturbanceLevel >= 1));
  assert.deepEqual(normalized.planets[1].shop.resources, {});
  assert.ok(normalized.turnTimer.turnEndsAt > normalized.turnTimer.turnStartedAt);
});

test("new gameplay fields survive a JSON snapshot roundtrip", () => {
  const game = makeState();
  const player = game.players[1];
  const faction = game.factions[player.factionId];
  const fleet = game.fleets[1];
  const planet = game.planets[1];

  player.manualNavigator = true;
  faction.isChaos = true;
  faction.isAdministratum = true;
  game.unitVariants[7] = {
    id: 7,
    name: "Void cruiser",
    domain: "SPACE",
    description: "Persistence fixture",
  };
  fleet.isNavigator = true;
  fleet.warpVisibility = 2;
  fleet.unitVariantId = 7;
  planet.secretStorage = {
    enabled: true,
    passwordVerifier: createPasswordVerifier("Тайный пароль"),
    allowedTypeKeys: ["ORE"],
    stackableInventory: { ORE: 6 },
    itemInventory: { artifactIds: [], knowledge: [], productIds: [] },
  };
  assert.equal(reportWorld(game, player.id, planet.id).ok, true);
  assert.equal(proposeTithe(game, player.id, planet.id, "DECUMA_PRIMA").ok, true);

  const restored = normalizeGameState(JSON.parse(JSON.stringify(game)) as GameState);
  assert.equal(restored.players[player.id].manualNavigator, true);
  assert.equal(restored.factions[faction.id].isChaos, true);
  assert.equal(restored.factions[faction.id].isAdministratum, true);
  assert.deepEqual(restored.unitVariants[7], game.unitVariants[7]);
  assert.equal(restored.fleets[fleet.id].isNavigator, true);
  assert.equal(restored.fleets[fleet.id].warpVisibility, 2);
  assert.equal(restored.fleets[fleet.id].unitVariantId, 7);
  assert.deepEqual(restored.planets[planet.id].secretStorage, planet.secretStorage);
  assert.deepEqual(restored.administratumWorldReports, game.administratumWorldReports);
  assert.deepEqual(restored.administratumTitheProposals, game.administratumTitheProposals);
});

test("Artifact origin normalization prefers valid top-level data and migrates legacy origin", () => {
  const game = makeState();
  const artifactBase = {
    definitionCode: "WARP_BEACON",
    name: "Warp beacon",
    owner: { kind: "FLEET" as const, fleetId: 1 },
    isNavigator: false,
    consumable: false,
  };
  game.artifacts.legacy = {
    ...artifactBase,
    id: "legacy",
    configuration: { navigatorOriginPlayerId: 2, navigatorRange: 1 },
  } as unknown as GameState["artifacts"][string];
  game.artifacts.current = {
    ...artifactBase,
    id: "current",
    configuration: { navigatorOriginPlayerId: 2 },
    navigatorOriginPlayerId: 3,
    warpVisibility: 0,
  };
  game.artifacts.invalid = {
    ...artifactBase,
    id: "invalid",
    configuration: { navigatorOriginPlayerId: 2 },
    navigatorOriginPlayerId: 999,
    warpVisibility: 1,
  };

  normalizeGameState(game);
  assert.equal(game.artifacts.legacy.navigatorOriginPlayerId, 2);
  assert.equal(game.artifacts.legacy.warpVisibility, 1);
  assert.equal(game.artifacts.current.navigatorOriginPlayerId, 3);
  assert.equal(game.artifacts.invalid.navigatorOriginPlayerId, undefined);
});

test("Warp Visibility Artifact admin API requires and updates a valid origin Player", async () => {
  const game = makeState();
  let persisted = 0;
  let broadcasts = 0;
  const handlers = createWorldObjectAdminHandlers({
    state: game,
    accounts: new Map(),
    pendingActions: new Map(),
    pendingAllianceProposals: new Set(),
    readyPlayers: new Set(),
    requireAdmin: () => ({
      token: "admin", username: "gm", role: "admin", expiresAt: Date.now() + 1000,
    }),
    ensurePlanningPhase: () => true,
    persistDatabase: () => { persisted += 1; },
    broadcastState: () => { broadcasts += 1; },
    removeSessionsForPlayer: () => {},
    listTurnSnapshots: () => [],
    rollbackTurnSnapshot: () => false,
    auditAdminMutation: (_req, input) => appendAudit(game, {
      actor: { kind: "ADMIN", account: "gm" },
      ...input,
    }),
  });
  const payload = {
    kind: "ARTIFACT",
    definitionCode: "WARP_BEACON",
    name: "Warp beacon",
    target: { kind: "FLEET", fleetId: 1 },
    isNavigator: false,
    warpVisibility: 1,
  };

  const missingOrigin = jsonResponse();
  await handlers.handleAddItem(jsonRequest(payload), missingOrigin.response);
  assert.equal(missingOrigin.read().status, 400);

  const createdResponse = jsonResponse();
  await handlers.handleAddItem(
    jsonRequest({ ...payload, navigatorOriginPlayerId: 1 }),
    createdResponse.response,
  );
  assert.equal(createdResponse.read().status, 201);
  const artifact = (createdResponse.read().body as { artifact: GameState["artifacts"][string] }).artifact;
  assert.equal(artifact.navigatorOriginPlayerId, 1);

  const invalidUpdate = jsonResponse();
  await handlers.handleUpdateArtifact(
    jsonRequest({ navigatorOriginPlayerId: 999 }),
    invalidUpdate.response,
    artifact.id,
  );
  assert.equal(invalidUpdate.read().status, 400);

  const validUpdate = jsonResponse();
  await handlers.handleUpdateArtifact(
    jsonRequest({ navigatorOriginPlayerId: 2 }),
    validUpdate.response,
    artifact.id,
  );
  assert.equal(validUpdate.read().status, 200);
  assert.equal(game.artifacts[artifact.id].navigatorOriginPlayerId, 2);
  assert.equal(persisted, 2);
  assert.equal(broadcasts, 2);
});

test("generation uses raw stock before tithe and Shop after tithe", () => {
  const game = makeState();
  const planet = game.planets[1];
  planet.population = 1_000_000_000;
  planet.rawStock = {};
  planet.shop.resources = {};
  applyPlanetSystems(game, []);
  const first = planet.rawStock.FOOD_RAW ?? 0;
  assert.ok(first > 0);
  assert.equal(planet.shop.resources.FOOD_RAW ?? 0, 0);
  planet.tithePaid = planet.titheTarget;
  applyPlanetSystems(game, []);
  assert.equal(planet.rawStock.FOOD_RAW, first);
  assert.ok((planet.shop.resources.FOOD_RAW ?? 0) > 0);
});

test("RAID takes from Shop without changing stock or tithe", () => {
  const game = makeState();
  const planet = game.planets[1];
  const raider = game.fleets[3];
  game.players[2].canTakePlanetResources = true;
  raider.position = { ...planet.position };
  planet.shop.resources.FOOD_RAW = 5;
  planet.rawStock.FOOD_RAW = 9;
  const paid = planet.tithePaid;
  const contributions = structuredClone(planet.titheContributions);
  const action: PlanetAction = {
    id: "raid-test-1", playerId: 2, type: "PLANET_ACTION",
    payload: {
      planetId: planet.id, fleetId: raider.id, kind: "RAID_STOCK",
      resourceKey: "FOOD_RAW", amount: 3,
    },
  };
  assert.equal(applyImmediatePlanetAction(game, action).ok, true);
  assert.equal(planet.shop.resources.FOOD_RAW, 2);
  assert.equal(planet.rawStock.FOOD_RAW, 9);
  assert.equal(planet.tithePaid, paid);
  assert.deepEqual(planet.titheContributions, contributions);
});

test("Shop accepts mixed category payment and rejects DEC-016 path", () => {
  const game = makeState();
  const planet = game.planets[1];
  const fleet = game.fleets[1];
  fleet.position = { ...planet.position };
  fleet.inventory = { ORE: 3, PROMETHIUM: 5, FOOD_RAW: 2, PARTS: 10 };
  planet.shop.resources = { PROVISIONS: 3, ORE: 2 };
  const success = tradeWithShop(game, { role: "player", playerId: 1 }, {
    shop: { kind: "PLANET", id: 1 }, fleetId: 1,
    receive: { resourceKey: "PROVISIONS", amount: 1 },
    payment: { ORE: 3, PROMETHIUM: 5, FOOD_RAW: 2 },
  });
  assert.equal(success.ok, true);
  assert.equal(fleet.inventory.PROVISIONS, 1);
  assert.equal(planet.shop.resources.PROVISIONS, 2);
  assert.equal(tradeWithShop(game, { role: "player", playerId: 1 }, {
    shop: { kind: "PLANET", id: 1 }, fleetId: 1,
    receive: { resourceKey: "PROVISIONS", amount: 1 }, payment: { ORE: 9 },
  }).ok, false);
  const unsupported = tradeWithShop(game, { role: "player", playerId: 1 }, {
    shop: { kind: "PLANET", id: 1 }, fleetId: 1,
    receive: { resourceKey: "ORE", amount: 1 }, payment: { PARTS: 2 },
  });
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.message, /DEC-016/);
});

test("Knowledge copies and Artifact transfer stays atomic and unique", () => {
  const game = makeState();
  const source = game.fleets[1];
  const target = game.fleets[2];
  source.itemInventory.knowledge = [SYSTEM_KNOWLEDGE.EXACT_AUSPEX];
  assert.equal(copyKnowledge(game, { role: "admin" }, SYSTEM_KNOWLEDGE.EXACT_AUSPEX,
    { kind: "FLEET", fleetId: source.id }, { kind: "FLEET", fleetId: target.id }).ok, true);
  copyKnowledge(game, { role: "admin" }, SYSTEM_KNOWLEDGE.EXACT_AUSPEX,
    { kind: "FLEET", fleetId: source.id }, { kind: "FLEET", fleetId: target.id });
  assert.deepEqual(source.itemInventory.knowledge, [SYSTEM_KNOWLEDGE.EXACT_AUSPEX]);
  assert.deepEqual(target.itemInventory.knowledge, [SYSTEM_KNOWLEDGE.EXACT_AUSPEX]);
  game.artifacts.relic = {
    id: "relic", definitionCode: "RELIC", name: "Relic",
    owner: { kind: "FLEET", fleetId: source.id }, configuration: {}, consumable: false,
  };
  source.itemInventory.artifactIds = ["relic"];
  assert.equal(transferArtifact(game, { role: "admin" }, "relic",
    { kind: "FLEET", fleetId: source.id },
    { kind: "STATION_SHOP", stationId: 999 }).ok, false);
  assert.deepEqual(source.itemInventory.artifactIds, ["relic"]);
  assert.equal(transferArtifact(game, { role: "admin" }, "relic",
    { kind: "FLEET", fleetId: source.id },
    { kind: "FLEET", fleetId: target.id }).ok, true);
  assert.deepEqual(source.itemInventory.artifactIds, []);
  assert.deepEqual(target.itemInventory.artifactIds, ["relic"]);
});

test("Secret Storage is case-sensitive, validates concrete type keys and stays hidden", () => {
  const game = makeState();
  const planet = game.planets[1];
  planet.secretStorage = {
    enabled: true,
    passwordVerifier: createPasswordVerifier("Terra-Alpha"),
    allowedTypeKeys: ["ORE", "ARTIFACT:RELIC", `KNOWLEDGE:${SYSTEM_KNOWLEDGE.EXACT_AUSPEX}`],
    stackableInventory: { ORE: 4 },
    itemInventory: { artifactIds: [], knowledge: [SYSTEM_KNOWLEDGE.EXACT_AUSPEX] },
  };
  planet.secretStorage.enabled = false;
  assert.equal(openSecretStorage(game, { kind: "PLANET", id: planet.id }, "Terra-Alpha").ok, false);
  planet.secretStorage.enabled = true;
  assert.equal(openSecretStorage(game, { kind: "PLANET", id: planet.id }, "terra-alpha").ok, false);
  const opened = openSecretStorage(game, { kind: "PLANET", id: planet.id }, "Terra-Alpha");
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.contents?.stackableInventory, { ORE: 4 });

  assert.equal(validateAllowedTypeKeys([]), null);
  assert.equal(validateAllowedTypeKeys(["ORE", "ORE"]), null);
  assert.equal(validateAllowedTypeKeys(["ORE", "FOOD_RAW", "FUEL", "PARTS"]), null);
  assert.deepEqual(validateAllowedTypeKeys(["ORE", "ARTIFACT:RELIC"]), ["ORE", "ARTIFACT:RELIC"]);
  assert.equal(parseSecretStorageUpdate(game, {
    enabled: true,
    password: "x",
    allowedTypeKeys: ["ORE"],
    stackableInventory: { FOOD_RAW: 1 },
  }).ok, false);

  const observer = game.fleets[1];
  observer.position = { ...planet.position };
  detectObjectsForFleetAtCurrentHex(game, observer.id, () => 0);
  const payload = buildStateForSession(
    { token: "secret", username: "p1", role: "player", playerId: 1, expiresAt: Date.now() + 1000 },
    game,
  );
  assert.equal(payload.planets[planet.id]?.secretStorageAvailable, true);
  assert.equal(payload.planets[planet.id]?.secretStorage, undefined);
  assert.equal(JSON.stringify(payload).includes(planet.secretStorage.passwordVerifier.digest), false);

  game.artifacts.relic = {
    id: "relic", definitionCode: "RELIC", name: "Relic",
    owner: { kind: "PLANET_SECRET", planetId: planet.id },
    configuration: {}, consumable: false, isNavigator: false, warpVisibility: null,
  };
  planet.secretStorage.itemInventory.artifactIds.push("relic");
  game.fleets[1].itemInventory.artifactIds.push("relic");
  normalizeGameState(game);
  assert.deepEqual(game.planets[planet.id].secretStorage?.itemInventory.artifactIds, ["relic"]);
  assert.equal(game.fleets[1].itemInventory.artifactIds.includes("relic"), false);
});

test("failed Secret Storage password is audited once and replay is idempotent", () => {
  const game = makeState();
  game.planets[1].secretStorage = {
    enabled: true,
    passwordVerifier: createPasswordVerifier("Верный пароль"),
    allowedTypeKeys: ["ORE"],
    stackableInventory: {},
    itemInventory: { artifactIds: [], knowledge: [] },
  };
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    send(payload: string) { sent.push(payload); },
  } as unknown as import("ws").WebSocket;
  const context = {
    socket,
    session: {
      token: "secret-session",
      username: "p1",
      role: "player" as const,
      playerId: 1,
      expiresAt: Date.now() + 1000,
    },
  };
  let persisted = 0;
  const controller = createRealtimeController({
    state: game,
    pendingActions: new Map(),
    pendingAllianceProposals: new Set(),
    readyPlayers: new Set(),
    clients: new Map(),
    persistDatabase: () => { persisted += 1; },
  });
  const command = {
    type: "openSecretStorage" as const,
    commandId: "wrong-secret-password-1",
    target: { kind: "PLANET" as const, id: 1 },
    password: "Неверный пароль",
  };
  controller.handleClientMessage(context, command);
  controller.handleClientMessage(context, command);
  assert.equal(game.audit.filter((entry) => entry.operation === "SECRET_STORAGE_AUTH_FAILED").length, 1);
  assert.ok(persisted >= 1);
  assert.equal(JSON.parse(sent.at(-1)!).duplicate, true);

  game.planets[1].secretStorage.passwordVerifier = createPasswordVerifier("Correct secret");
  const successfulCommand = {
    ...command,
    commandId: "successful-secret-password-1",
    password: "Correct secret",
  };
  controller.handleClientMessage(context, successfulCommand);
  assert.ok(JSON.parse(sent.at(-1)!).storage);
  controller.handleClientMessage(context, { ...successfulCommand, password: "Wrong replay" });
  const rejectedReplay = JSON.parse(sent.at(-1)!);
  assert.equal(rejectedReplay.ok, false);
  assert.equal(rejectedReplay.storage, undefined);
  assert.equal(rejectedReplay.duplicate, true);
});

test("Administratum registry is ordered/idempotent and proposals replace, conflict or apply", () => {
  const game = makeState();
  const administratumFactionId = game.players[1].factionId;
  game.factions[administratumFactionId].isAdministratum = true;
  game.players[2].factionId = administratumFactionId;
  const outsider = game.players[3];
  assert.ok(outsider);
  assert.equal(reportWorld(game, outsider.id, 3).ok, true);
  assert.equal(proposeTithe(game, outsider.id, 3, "DECUMA_PRIMA").ok, false);

  assert.equal(reportWorld(game, 1, 2).ok, true);
  assert.equal(reportWorld(game, 1, 1).ok, true);
  assert.equal(reportWorld(game, 2, 2).ok, true);
  assert.deepEqual(game.administratumWorldReports.map((entry) => entry.planetId), [3, 2, 1]);
  const outsiderProjection = buildStateForSession(
    { token: "outsider", username: "p3", role: "player", playerId: 3, expiresAt: Date.now() + 1000 },
    game,
  );
  const administratumProjection = buildStateForSession(
    { token: "adept", username: "p1", role: "player", playerId: 1, expiresAt: Date.now() + 1000 },
    game,
  );
  assert.deepEqual(outsiderProjection.administratumWorldReports, []);
  assert.equal(administratumProjection.administratumWorldReports.length, 3);
  assert.equal(proposeTithe(game, 1, 999, "DECUMA_PRIMA").ok, false);
  assert.equal(proposeTithe(game, 1, 1, "INVALID").ok, false);

  assert.equal(proposeTithe(game, 1, 1, "DECUMA_PRIMA").ok, true);
  assert.equal(proposeTithe(game, 1, 1, "DECUMA_SECUNDUS").ok, true);
  assert.equal(game.administratumTitheProposals.length, 1);
  assert.equal(proposeTithe(game, 2, 1, "DECUMA_TERTIUS").ok, true);
  assert.deepEqual(resolveAdministratumTitheProposals(game), []);

  assert.equal(proposeTithe(game, 1, 1, "SOLUTIO_PRIMA").ok, true);
  assert.equal(proposeTithe(game, 2, 1, "SOLUTIO_PRIMA").ok, true);
  const planet = game.planets[1];
  assert.notEqual(planet.maxTitheLevel, "SOLUTIO_PRIMA");
  game.fleets[1].position = { ...planet.position };
  const applied = resolveAdministratumTitheProposals(game);
  assert.equal(applied[0]?.titheLevel, "SOLUTIO_PRIMA");
  assert.ok(applied[0]?.notifiedPlayerIds.includes(1));
  assert.equal(planet.maxTitheLevel, "SOLUTIO_PRIMA");
  assert.deepEqual(game.administratumWorldReports.map((entry) => entry.planetId), [3, 2, 1]);
});

test("UnitVariant normalization preserves matching assignments and clears mismatches", () => {
  const game = makeState();
  game.unitVariants[1] = { id: 1, name: "Cruiser", domain: "SPACE" };
  game.fleets[1].unitVariantId = 1;
  const army = structuredClone(game.fleets[1]);
  army.id = 99;
  army.domain = "GROUND";
  army.unitVariantId = 1;
  game.fleets[army.id] = army;
  const normalized = normalizeGameState(game);
  assert.equal(normalized.fleets[1].unitVariantId, 1);
  assert.equal(normalized.fleets[army.id].unitVariantId, undefined);
});

test("UnitVariant admin CRUD rejects a cross-domain update and safely clears references", async () => {
  const game = makeState();
  let persisted = 0;
  let broadcasts = 0;
  const handlers = createUnitVariantAdminHandlers({
    state: game,
    accounts: new Map(),
    pendingActions: new Map(),
    pendingAllianceProposals: new Set(),
    readyPlayers: new Set(),
    requireAdmin: () => ({
      token: "admin", username: "gm", role: "admin", expiresAt: Date.now() + 1000,
    }),
    ensurePlanningPhase: () => true,
    persistDatabase: () => { persisted += 1; },
    broadcastState: () => { broadcasts += 1; },
    removeSessionsForPlayer: () => {},
    listTurnSnapshots: () => [],
    rollbackTurnSnapshot: () => false,
    auditAdminMutation: (_req, input) => appendAudit(game, {
      actor: { kind: "ADMIN", account: "gm" },
      ...input,
    }),
  });

  const createdResponse = jsonResponse();
  await handlers.handleAddUnitVariant(
    jsonRequest({ name: "Cruiser", domain: "SPACE", description: "line ship" }),
    createdResponse.response,
  );
  assert.equal(createdResponse.read().status, 201);
  const variantId = (createdResponse.read().body as { unitVariant: { id: number } }).unitVariant.id;
  game.fleets[1].unitVariantId = variantId;

  const rejectedResponse = jsonResponse();
  await handlers.handleUpdateUnitVariant(
    jsonRequest({ domain: "GROUND" }),
    rejectedResponse.response,
    String(variantId),
  );
  assert.equal(rejectedResponse.read().status, 409);
  assert.equal(game.unitVariants[variantId].domain, "SPACE");

  const updatedResponse = jsonResponse();
  await handlers.handleUpdateUnitVariant(
    jsonRequest({ name: "Heavy Cruiser" }),
    updatedResponse.response,
    String(variantId),
  );
  assert.equal(updatedResponse.read().status, 200);
  assert.equal(game.unitVariants[variantId].name, "Heavy Cruiser");

  const deletedResponse = jsonResponse();
  handlers.handleDeleteUnitVariant(jsonRequest(), deletedResponse.response, String(variantId));
  assert.equal(deletedResponse.read().status, 200);
  assert.equal(game.unitVariants[variantId], undefined);
  assert.equal(game.fleets[1].unitVariantId, undefined);
  assert.equal(persisted, 3);
  assert.equal(broadcasts, 3);
});

test("Shipwreck accepts Artifact/Knowledge and rejects stackables", () => {
  const wreck = {
    id: 1, position: { q: 1, r: 1 }, inventory: { artifactIds: [], knowledge: [] },
    createdOnTurn: 1, sourceUnitIds: [1],
  };
  assert.equal(addArtifactToShipwreck(wreck, "a-1").ok, true);
  assert.equal(addKnowledgeToShipwreck(wreck, "LORE").ok, true);
  assert.equal(addStackableResourceToShipwreck().ok, false);
  assert.deepEqual(wreck.inventory, { artifactIds: ["a-1"], knowledge: ["LORE"] });
});

test("destroyed units aggregate into one shipwreck per batch and hex only", () => {
  const game = makeState();
  const first = structuredClone(game.fleets[1]);
  const second = structuredClone(game.fleets[2]);
  const third = structuredClone(game.fleets[3]);
  first.position = { q: 2, r: 2 };
  second.position = { q: 2, r: 2 };
  third.position = { q: 3, r: 2 };
  first.itemInventory = { artifactIds: ["a"], knowledge: ["LORE"] };
  second.itemInventory = { artifactIds: ["b"], knowledge: ["LORE", "MAP"] };
  third.itemInventory = { artifactIds: ["c"], knowledge: [] };
  const firstBatch = salvageDestroyedUnits(game, [first, second, third]);
  assert.equal(firstBatch.length, 2);
  const combined = firstBatch.find((wreck) => wreck.position.q === 2 && wreck.position.r === 2);
  assert.deepEqual(combined?.sourceUnitIds, [first.id, second.id].sort((a, b) => a - b));
  assert.deepEqual(combined?.inventory.artifactIds, ["a", "b"]);
  assert.deepEqual(combined?.inventory.knowledge, ["LORE", "MAP"]);

  const later = structuredClone(game.fleets[1]);
  later.id = 777;
  later.position = { q: 2, r: 2 };
  later.itemInventory = { artifactIds: ["later"], knowledge: [] };
  const secondBatch = salvageDestroyedUnits(game, [later]);
  assert.equal(secondBatch.length, 1);
  assert.notEqual(secondBatch[0]?.id, combined?.id);
});

test("visibility is own-only until server Detection", () => {
  const game = makeState();
  game.players[1].alliances = [2];
  game.players[2].alliances = [1];
  const own = game.fleets[1];
  const ally = game.fleets[3];
  ally.position = { q: 17, r: 11 };
  const visibility = recalcVisibility(game)[1];
  assert.ok(visibility.fleets.some((fleet) => fleet.id === own.id));
  assert.ok(!visibility.fleets.some((fleet) => fleet.id === ally.id));
  assert.equal(visibility.visiblePlanets.length, 0);
  const payload = buildStateForSession(
    { token: "t", username: "p1", role: "player", playerId: 1, expiresAt: Date.now() + 1000 }, game,
  );
  assert.ok(payload.fleets[own.id]);
  assert.equal(payload.fleets[ally.id], undefined);
  assert.deepEqual(payload.planets, {});
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "audit"), false);
});

test("Detection auto-reveals non-stealth objects and Exact Auspex is exact", () => {
  const game = makeState();
  const observer = game.fleets[1];
  const enemy = game.fleets[3];
  observer.position = { ...game.planets[1].position };
  enemy.position = { ...observer.position };
  const estimated = detectObjectsForFleetAtCurrentHex(game, observer.id, () => 0);
  assert.ok(estimated?.detected.some((entry) => entry.objectKind === "PLANET"));
  assert.equal(estimated?.detected.find((entry) => entry.objectKind === "FLEET")?.confidence, "ESTIMATED");
  observer.itemInventory.knowledge.push(SYSTEM_KNOWLEDGE.EXACT_AUSPEX);
  assert.equal(detectObjectsForFleetAtCurrentHex(game, observer.id, () => 0.5)
    ?.detected.find((entry) => entry.objectKind === "FLEET")?.confidence, "EXACT");
  enemy.tags = ["STEALTH"];
  game.detection.recordsByPlayerId = {};
  assert.ok(!detectObjectsForFleetAtCurrentHex(game, observer.id, () => 0.5)
    ?.detected.some((entry) => entry.objectKind === "FLEET"));
});

test("only SPACE fleets detect, with a die sized to current health", () => {
  const game = makeState();
  const space = game.fleets[1];
  const ground = game.fleets[2];
  assert.equal(space.domain, "SPACE");
  assert.equal(ground.domain, "GROUND");
  space.health = 1;
  ground.health = 100_000;
  const spaceResult = detectObjectsForFleetAtCurrentHex(game, space.id, () => 0.9999);
  const groundResult = detectObjectsForFleetAtCurrentHex(game, ground.id, () => 0);
  assert.deepEqual({ die: spaceResult?.dieSize, roll: spaceResult?.roll }, { die: 1, roll: 1 });
  assert.equal(groundResult, null);
});

test("army capacity rounds each army up and is rechecked on acceptance", () => {
  const game = makeState();
  const carrier = game.fleets[1];
  carrier.capacity = 2;
  const army = structuredClone(game.fleets[2]);
  army.id = 90;
  army.ownerPlayerId = carrier.ownerPlayerId;
  army.domain = "GROUND";
  army.health = 1001;
  army.position = { ...carrier.position };
  delete army.carrierFleetId;
  game.fleets[army.id] = army;
  assert.equal(armyCapacityUsed({ ...army, health: 1000 }), 1);
  assert.equal(armyCapacityUsed(army), 2);
  assert.equal(requestArmyEmbark(game, [], carrier.ownerPlayerId, army.id, carrier.id).ok, true);

  const occupyingArmy = structuredClone(army);
  occupyingArmy.id = 91;
  occupyingArmy.health = 1000;
  occupyingArmy.carrierFleetId = carrier.id;
  game.fleets[occupyingArmy.id] = occupyingArmy;
  assert.equal(carrierCapacityUsed(game, carrier.id), 1);
  const response = respondArmyEmbark(
    game,
    [],
    carrier.ownerPlayerId,
    game.pendingArmyTransportRequests[0]!.id,
    true,
  );
  assert.equal(response.ok, true);
  assert.match(response.message, /capacity/i);
  assert.equal(army.carrierFleetId, undefined);
});

test("getObjectsAtHex supports multiple objects of every category", () => {
  const game = makeState();
  const coord = { q: 4, r: 4 };
  const first = structuredClone(game.planets[1]);
  const second = structuredClone(game.planets[2]);
  first.id = 20; first.position = coord;
  second.id = 21; second.position = coord;
  game.planets = { 20: first, 21: second };
  game.fleets[1].position = coord;
  const station: Station = {
    id: 1, name: "S", position: coord, capabilities: ["SHOP", "TAGS"], tags: [],
    resourceGeneration: {}, rawStock: {}, productStorageByPlayerId: {}, itemStorageByPlayerId: {},
    shop: { resources: {}, items: { artifactIds: [], knowledge: [] }, disappearingItems: [] },
    infoFragments: {}, ownerFactionId: null, warpVisibility: null,
    fleetCombatPower: 0, armyCombatPower: 0,
  };
  game.stations[1] = station;
  game.shipwrecks[1] = { id: 1, position: coord, inventory: { artifactIds: [], knowledge: [] }, createdOnTurn: 1, sourceUnitIds: [] };
  game.anomalies[1] = { id: 1, position: coord, tags: [], informationRef: "secret" };
  const objects = getObjectsAtHex(game, coord);
  assert.equal(objects.filter((entry) => entry.kind === "PLANET").length, 2);
  assert.deepEqual(new Set(objects.map((entry) => entry.kind)), new Set([
    "PLANET", "FLEET", "STATION", "SHIPWRECK", "ANOMALY",
  ]));
});

test("command id prevents a second Shop mutation and audit record", () => {
  const game = makeState();
  const planet = game.planets[1];
  const fleet = game.fleets[1];
  fleet.position = { ...planet.position };
  fleet.inventory.ORE = 2;
  planet.shop.resources.FOOD_RAW = 1;
  const commandId = "shop-idempotent-1";
  const execute = () => {
    const previous = getProcessedCommandResult(game, "player:1", commandId);
    if (previous) return previous;
    const result = tradeWithShop(game, { role: "player", playerId: 1 }, {
      shop: { kind: "PLANET", id: 1 }, fleetId: 1,
      receive: { resourceKey: "FOOD_RAW", amount: 1 }, payment: { ORE: 2 },
    });
    rememberProcessedCommand(game, "player:1", commandId, result);
    appendAudit(game, { actor: { kind: "PLAYER", playerId: 1 }, operation: "SHOP_TRADE",
      entityType: "PLANET", entityId: 1, commandId });
    return result;
  };
  execute(); execute();
  assert.equal(fleet.inventory.FOOD_RAW, 1);
  assert.equal(game.audit.length, 1);
});

test("Shop realtime command reads top-level commandId and replays without a second trade", () => {
  const game = makeState();
  const planet = game.planets[1];
  const fleet = game.fleets[1];
  fleet.position = { ...planet.position };
  fleet.inventory.ORE = 2;
  planet.shop.resources.FOOD_RAW = 1;
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    send(payload: string) { sent.push(payload); },
  } as unknown as import("ws").WebSocket;
  const context = {
    socket,
    session: {
      token: "shop-session", username: "p1", role: "player" as const,
      playerId: 1, expiresAt: Date.now() + 1000,
    },
  };
  const controller = createRealtimeController({
    state: game,
    pendingActions: new Map(),
    pendingAllianceProposals: new Set(),
    readyPlayers: new Set(),
    clients: new Map(),
    persistDatabase: () => {},
  });
  const command = {
    type: "shopTrade" as const,
    commandId: "shop-top-level-1",
    payload: {
      shop: { kind: "PLANET" as const, id: planet.id },
      fleetId: fleet.id,
      receive: { resourceKey: "FOOD_RAW" as const, amount: 1 },
      payment: { ORE: 2 },
    },
  };
  controller.handleClientMessage(context, command);
  controller.handleClientMessage(context, command);
  assert.equal(fleet.inventory.ORE ?? 0, 0);
  assert.equal(fleet.inventory.FOOD_RAW, 1);
  assert.equal(game.audit.filter((entry) => entry.operation === "SHOP_TRADE").length, 1);
  assert.equal(JSON.parse(sent.at(-1)!).duplicate, true);
});

test("consumable Artifact action executes once for a duplicate commandId", () => {
  const game = makeState();
  const fleet = game.fleets[1];
  let uses = 0;
  registerArtifactEffect("TEST_ONCE", () => {
    uses += 1;
    return { ok: true, message: "used" };
  });
  game.artifacts.once = {
    id: "once",
    definitionCode: "ONCE",
    name: "One-shot",
    owner: { kind: "FLEET", fleetId: fleet.id },
    configuration: {},
    useEffect: { effectCode: "TEST_ONCE", params: {} },
    consumable: true,
    isNavigator: false,
    warpVisibility: null,
  };
  fleet.itemInventory.artifactIds.push("once");
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    send(payload: string) { sent.push(payload); },
  } as unknown as import("ws").WebSocket;
  const context = {
    socket,
    session: {
      token: "artifact-session", username: "p1", role: "player" as const,
      playerId: 1, expiresAt: Date.now() + 1000,
    },
  };
  const controller = createRealtimeController({
    state: game,
    pendingActions: new Map(),
    pendingAllianceProposals: new Set(),
    readyPlayers: new Set(),
    clients: new Map(),
    persistDatabase: () => {},
  });
  const command = { type: "artifactUse" as const, commandId: "artifact-once-1", artifactId: "once" };
  controller.handleClientMessage(context, command);
  controller.handleClientMessage(context, command);
  assert.equal(uses, 1);
  assert.equal(game.artifacts.once, undefined);
  assert.equal(fleet.itemInventory.artifactIds.includes("once"), false);
  assert.equal(game.audit.filter((entry) => entry.operation === "USE_ARTIFACT").length, 1);
  assert.equal(JSON.parse(sent.at(-1)!).duplicate, true);
});

test("command id prevents a second resource transfer", () => {
  const game = makeState();
  const source = game.fleets[1];
  const target = game.fleets[2];
  target.position = { ...source.position };
  source.inventory.ORE = 4;
  const commandId = "transfer-idempotent-1";
  const execute = () => {
    const previous = getProcessedCommandResult(game, "player:1", commandId);
    if (previous) return previous;
    const result = applyImmediateResourceTransfer(game, { role: "player", playerId: 1 }, {
      from: { kind: "FLEET", id: source.id },
      to: { kind: "FLEET", id: target.id },
      resourceKey: "ORE",
      amount: 2,
    });
    rememberProcessedCommand(game, "player:1", commandId, result);
    return result;
  };
  execute(); execute();
  assert.equal(source.inventory.ORE, 2);
  assert.equal(target.inventory.ORE, 2);
});

test("admin mutation creates exactly one audit entry", () => {
  const game = makeState();
  appendAudit(game, {
    actor: { kind: "ADMIN", account: "gm" }, operation: "UPDATE_STATION",
    entityType: "STATION", entityId: 1, before: { name: "A" }, after: { name: "B" },
  });
  assert.equal(game.audit.length, 1);
  assert.equal(game.audit[0]?.actor.kind, "ADMIN");
});

test("turn timer sets/restores/cancels and expires once", async () => {
  const game = makeState();
  let now = 1000;
  const callbacks = new Map<object, () => void>();
  const scheduler: TurnTimerScheduler = {
    setTimer(callback) {
      const handle = {} as ReturnType<typeof setTimeout>;
      callbacks.set(handle as unknown as object, callback);
      return handle;
    },
    clearTimer(handle) { callbacks.delete(handle as unknown as object); },
  };
  let resolutions = 0;
  const controller = createTurnTimerController({
    state: game, now: () => now, scheduler, persist: () => {},
    onElapsed: () => { resolutions += 1; },
  });
  game.turnTimer.durationMs = 60;
  controller.startNewPlanning();
  assert.deepEqual(game.turnTimer, { durationMs: 60, turnStartedAt: 1000, turnEndsAt: 1060 });
  assert.equal(callbacks.size, 1);
  const staleTimeout = [...callbacks.values()][0];
  controller.cancel();
  assert.equal(callbacks.size, 0);
  controller.startNewPlanning();
  staleTimeout?.();
  assert.equal(resolutions, 0);
  controller.cancel();
  game.turnTimer.turnEndsAt = 900;
  controller.restore(); controller.restore();
  await Promise.resolve();
  assert.equal(resolutions, 1);
  now = 2000;
  game.turnTimer.turnStartedAt = 1990;
  game.turnTimer.turnEndsAt = 2050;
  controller.restore();
  assert.equal(callbacks.size, 1);
});

test("turn START/END snapshots are persisted records and rollback restores PLANNING", () => {
  const game = makeState();
  const history: import("../src/storage/documentDb").TurnSnapshot[] = [];
  const start = captureTurnSnapshotEntry(history, game, "START", 1, 100);
  game.turnNumber = 2;
  game.players[1].resources = 999;
  appendAudit(game, {
    actor: { kind: "ADMIN", account: "gm" }, operation: "PRE_ROLLBACK_MUTATION",
    entityType: "TURN", entityId: 2,
  });
  rememberProcessedCommand(game, "player:1", "before-rollback-1", { ok: true });
  captureTurnSnapshotEntry(history, game, "END", 1, 200);
  assert.deepEqual(history.map((entry) => entry.point), ["START", "END"]);
  assert.equal(restorePlanningTurnSnapshot(game, start), true);
  assert.equal(game.turnNumber, 1);
  assert.equal(game.players[1].resources, 100);
  assert.equal(game.audit.length, 1);
  assert.deepEqual(getProcessedCommandResult(game, "player:1", "before-rollback-1"), { ok: true });
});
