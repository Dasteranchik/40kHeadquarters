import assert from "node:assert/strict";
import test from "node:test";

import { SYSTEM_KNOWLEDGE } from "../src/itemDomain";
import { normalizeGameState } from "../src/server/normalization";
import { createInitialGameState } from "../src/server/seed";
import { buildStateForSession } from "../src/server/visibility";
import { appendAudit } from "../src/systems/auditSystem";
import { detectObjectsForFleetAtCurrentHex } from "../src/systems/detectionSystem";
import { getProcessedCommandResult, rememberProcessedCommand } from "../src/systems/idempotencySystem";
import { copyKnowledge, transferArtifact } from "../src/systems/itemSystem";
import { applyImmediatePlanetAction, applyPlanetSystems } from "../src/systems/planetSystem";
import { applyImmediateResourceTransfer } from "../src/systems/resourceTransferSystem";
import {
  addArtifactToShipwreck,
  addKnowledgeToShipwreck,
  addStackableResourceToShipwreck,
} from "../src/systems/shipwreckSystem";
import { tradeWithShop } from "../src/systems/shopSystem";
import { recalcVisibility } from "../src/systems/fogOfWarSystem";
import { createTurnTimerController, type TurnTimerScheduler } from "../src/turn/turnTimer";
import { captureTurnSnapshotEntry, restorePlanningTurnSnapshot } from "../src/turn/turnSnapshot";
import type { GameState, PlanetAction } from "../src/types";
import { getObjectsAtHex, type Station } from "../src/worldObjectDomain";

const makeState = (): GameState => createInitialGameState();

test("legacy snapshot normalization supplies new fields", () => {
  const legacy = makeState() as GameState & Record<string, unknown>;
  for (const key of [
    "stations", "shipwrecks", "anomalies", "artifacts", "audit",
    "detection", "processedCommands", "turnTimer",
  ]) delete legacy[key];
  for (const fleet of Object.values(legacy.fleets)) {
    delete (fleet as Partial<typeof fleet>).itemInventory;
    delete (fleet as Partial<typeof fleet>).tags;
  }
  for (const planet of Object.values(legacy.planets)) {
    delete (planet as Partial<typeof planet>).shop;
    delete (planet as Partial<typeof planet>).itemStorageByPlayerId;
  }
  const normalized = normalizeGameState(legacy);
  assert.deepEqual(normalized.stations, {});
  assert.deepEqual(normalized.audit, []);
  assert.deepEqual(normalized.fleets[1].tags, []);
  assert.deepEqual(normalized.planets[1].shop.resources, {});
  assert.ok(normalized.turnTimer.turnEndsAt > normalized.turnTimer.turnStartedAt);
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
    commandId: "shop-mixed-1", shop: { kind: "PLANET", id: 1 }, fleetId: 1,
    receive: { resourceKey: "PROVISIONS", amount: 1 },
    payment: { ORE: 3, PROMETHIUM: 5, FOOD_RAW: 2 },
  });
  assert.equal(success.ok, true);
  assert.equal(fleet.inventory.PROVISIONS, 1);
  assert.equal(planet.shop.resources.PROVISIONS, 2);
  assert.equal(tradeWithShop(game, { role: "player", playerId: 1 }, {
    commandId: "shop-short-1", shop: { kind: "PLANET", id: 1 }, fleetId: 1,
    receive: { resourceKey: "PROVISIONS", amount: 1 }, payment: { ORE: 9 },
  }).ok, false);
  const unsupported = tradeWithShop(game, { role: "player", playerId: 1 }, {
    commandId: "shop-dec016-1", shop: { kind: "PLANET", id: 1 }, fleetId: 1,
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
    infoFragments: {}, overviewRange: 0, fleetCombatPower: 0, armyCombatPower: 0,
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
      commandId, shop: { kind: "PLANET", id: 1 }, fleetId: 1,
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
