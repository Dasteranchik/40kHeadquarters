import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createInitialGameState } from "../src/server/seed";
import { normalizeGameState } from "../src/server/normalization";
import { validateDocumentSnapshot, StateValidationError } from "../src/server/stateValidation";
import { CURRENT_SCHEMA_VERSION } from "../src/storage/snapshot";
import { moraleCoefficient } from "../src/moraleDomain";
import { classifyDetectionTier, detectObjectsForFleetAtCurrentHex, hasDetectedObject } from "../src/systems/detectionSystem";
import { applyAnomalyMoraleLoss } from "../src/systems/moraleSystem";
import { resolveAdministratumTitheProposals } from "../src/systems/administratumSystem";
import { calculateUnitDerived } from "../src/systems/unitEffectSystem";
import { applyFormationDamage, attachFormation, extractFormation, replaceCommander } from "../src/systems/unitCompositionSystem";
import { effectiveUnitTags } from "../src/systems/tagSystem";
import type { GameState } from "../src/types";
import type { FormationInstance } from "../src/formationDomain";
import { createEmptyItemInventory } from "../src/itemDomain";
import { resolveTurn } from "../src/turn/resolveTurn";
import { resolveCombat } from "../src/systems/combatSystem";
import { createNewModelAdminHandlers } from "../src/server/admin/newModel";
import { createPlanetAdminHandlers } from "../src/server/admin/planets";
import { buildStateForSession } from "../src/server/visibility";
import { handleApiRequest, type ApiRouteHandlers } from "../src/server/router";
import { createStateTransactionManager } from "../src/server/stateTransaction";
import { appendAudit } from "../src/systems/auditSystem";
import type { AdminHandlerDeps } from "../src/server/admin/deps";

function formedState(): GameState {
  const state = createInitialGameState();
  state.tags = {
    STEALTH: { id: "STEALTH", name: "Stealth", parentTagIds: [] },
    INFANTRY: { id: "INFANTRY", name: "Infantry", parentTagIds: [] },
    HUMAN: { id: "HUMAN", name: "Human", parentTagIds: [] },
    IMPERIAL: { id: "IMPERIAL", name: "Imperial", parentTagIds: [] },
    GUARD: { id: "GUARD", name: "Guard", parentTagIds: ["INFANTRY", "HUMAN", "IMPERIAL"] },
  };
  state.itemKinds = {
    COMMANDER: { id: "COMMANDER", type: "ARTIFACT", name: "Commander", tags: [], commanderCapable: true },
    REGIMENT: { id: "REGIMENT", type: "PRODUCT", name: "Regiment", tags: ["GUARD"], baseCombatPower: 100, maxHealth: 100 },
  };
  const unit = state.fleets[1];
  state.artifacts.commander = {
    id: "commander", type: "ARTIFACT", kind: "COMMANDER", definitionCode: "COMMANDER",
    name: "Commander", owner: { kind: "FLEET", fleetId: unit.id }, configuration: {},
    isNavigator: false, warpVisibility: null, consumable: false, tags: [], effects: [],
  };
  unit.itemInventory.artifactIds.push("commander");
  replaceCommander(state, unit.id, "commander");
  return state;
}

function addFormation(state: GameState, id: string, currentHealth = 100): FormationInstance {
  const unit = state.fleets[1];
  const formation: FormationInstance = {
    id, type: "PRODUCT", kind: "REGIMENT", name: id, baseCombatPower: 100,
    maxHealth: 100, currentHealth, tags: ["GUARD"],
    owner: { kind: "FLEET", fleetId: unit.id },
  };
  (state.formations ??= {})[id] = formation;
  (unit.itemInventory.productIds ??= []).push(id);
  attachFormation(state, unit.id, id);
  return formation;
}

test("Formations derive Unit health and proportional power; 30% grants tags, 29% does not", () => {
  const state = formedState();
  addFormation(state, "a", 100);
  addFormation(state, "b", 30);
  assert.equal(calculateUnitDerived(state, 1)?.currentHealth, 130);
  assert.equal(calculateUnitDerived(state, 1)?.maxHealth, 200);
  assert.equal(calculateUnitDerived(state, 1)?.combatPower, 130);
  assert.equal(calculateUnitDerived(state, 1)?.doctrineSlots, 2);
  assert.deepEqual(new Set(effectiveUnitTags(state, 1).map((tag) => tag.tagId)),
    new Set(["GUARD", "INFANTRY", "HUMAN", "IMPERIAL"]));
  state.formations!.b.currentHealth = 29;
  assert.equal(calculateUnitDerived(state, 1)?.combatPower, 129);
  assert.equal(calculateUnitDerived(state, 1)?.doctrineSlots, 1);
  assert.ok(effectiveUnitTags(state, 1).some((tag) => tag.sourceId === "a" && tag.tagId === "INFANTRY"));
  assert.ok(!effectiveUnitTags(state, 1).some((tag) => tag.sourceId === "b"));
});

test("Damage shares equally, redistributes overkill, removes dead Formations and preserves Artifacts", () => {
  const state = formedState();
  addFormation(state, "a", 2);
  addFormation(state, "b", 100);
  const result = applyFormationDamage(state, 1, 20);
  assert.equal(result.actualLostHealth, 20);
  assert.deepEqual(result.destroyedFormationIds, ["a"]);
  assert.equal(state.formations?.a, undefined);
  assert.equal(state.formations?.b.currentHealth, 82);
  assert.equal(state.artifacts.commander.attachedUnitId, 1);
  assert.equal(state.fleets[1].morale, -1);
  assert.equal(applyFormationDamage(state, 1, 1000).actualLostHealth, 82);
  assert.equal(state.fleets[1].health, 0);
  assert.deepEqual(state.fleets[1].formationIds, []);
  assert.equal(state.artifacts.commander.name, "Commander");
});

test("Extracting a damaged Formation keeps its health and cannot empty a Unit", () => {
  const state = formedState();
  addFormation(state, "a", 50);
  addFormation(state, "b", 100);
  extractFormation(state, 1, "a", { kind: "FLEET", fleetId: 1 });
  assert.equal(state.formations?.a.currentHealth, 50);
  assert.deepEqual(state.formations?.a.owner, { kind: "FLEET", fleetId: 1 });
  assert.throws(() => extractFormation(state, 1, "b", { kind: "FLEET", fleetId: 1 }));
});

test("Morale thresholds and combat calculation order are exact", () => {
  assert.deepEqual([100, 95, 0, -65, -100].map(moraleCoefficient), [1.5, 1.4, 1, 0.9, 0.5]);
  const state = formedState();
  addFormation(state, "a", 100);
  state.fleets[1].morale = 60;
  state.artifacts.commander.effects = [
    { kind: "ADD_COMBAT_POWER", magnitude: { kind: "FIXED", value: 5 },
      conditions: { requiresAllTags: [], requiresAnyTags: [], forbiddenTags: [] } },
    { kind: "MULTIPLY_COMBAT_POWER", magnitude: { kind: "FIXED", value: 1.5 },
      conditions: { requiresAllTags: [], requiresAnyTags: [], forbiddenTags: [] } },
  ];
  assert.equal(calculateUnitDerived(state, 1)?.combatPower, Math.floor((100 * 1.1 + 5) * 1.5));
});

test("Commander replacement is atomic and Doctrine availability tracks Formation tags", () => {
  const state = formedState();
  addFormation(state, "a", 30);
  state.doctrines = { CHARGE: { id: "CHARGE", name: "Charge", description: "",
    tagRequirements: { requiresAllTags: ["INFANTRY"], requiresAnyTags: [], forbiddenTags: [] },
    effects: [], } };
  assert.deepEqual(calculateUnitDerived(state, 1)?.availableDoctrineIds, ["CHARGE"]);
  state.formations!.a.currentHealth = 29;
  assert.deepEqual(calculateUnitDerived(state, 1)?.availableDoctrineIds, []);
  assert.throws(() => replaceCommander(state, 1, "missing"));
  assert.equal(state.fleets[1].commanderArtifactId, "commander");
});

test("Tag inheritance accepts several parents and rejects cycles in validation", () => {
  const state = formedState();
  addFormation(state, "a");
  assert.deepEqual(new Set(effectiveUnitTags(state, 1).map((tag) => tag.tagId)),
    new Set(["GUARD", "INFANTRY", "HUMAN", "IMPERIAL"]));
  state.tags!.INFANTRY.parentTagIds = ["GUARD"];
  assert.throws(() => validateDocumentSnapshot({ schemaVersion: CURRENT_SCHEMA_VERSION,
    gameState: state, accounts: {}, sessions: {}, turnSnapshots: [] }), StateValidationError);
});

test("Player projection includes own individual PRODUCTs but hides detected enemy composition", () => {
  const state = formedState();
  addFormation(state, "own-a");
  addFormation(state, "own-b");
  extractFormation(state, 1, "own-a", { kind: "FLEET", fleetId: 1 });
  const enemy = state.fleets[3];
  enemy.position = { ...state.fleets[1].position };
  enemy.commanderArtifactId = "secret-commander";
  enemy.formationIds = ["enemy-regiment"];
  state.formations!["enemy-regiment"] = { id: "enemy-regiment", type: "PRODUCT", kind: "REGIMENT",
    name: "Enemy regiment", baseCombatPower: 100, maxHealth: 100, currentHealth: 80,
    tags: ["GUARD"], owner: { kind: "UNIT", unitId: enemy.id } };
  detectObjectsForFleetAtCurrentHex(state, 1, () => 0);
  const view = buildStateForSession({ token: "t", username: "player", role: "player",
    playerId: 1, expiresAt: Date.now() + 1000 }, state);
  assert.ok(view.formations?.["own-a"]);
  assert.ok(view.formations?.["own-b"]);
  assert.equal(view.formations?.["enemy-regiment"], undefined);
  assert.deepEqual(view.fleets[3].formationIds, []);
  assert.equal(view.fleets[3].commanderArtifactId, null);
});

test("Detection thresholds, stealth, stationary observers and stale coordinates", () => {
  assert.deepEqual([25, 26, 50, 51].map((roll) => classifyDetectionTier(roll, 100)), [1, 2, 2, 3]);
  const state = createInitialGameState();
  const observer = state.fleets[1];
  const enemy = state.fleets[3];
  observer.health = 100;
  enemy.position = { ...observer.position };
  enemy.tags = ["STEALTH"];
  assert.equal(detectObjectsForFleetAtCurrentHex(state, observer.id, () => 0.24)?.detected
    .some((entry) => entry.objectKind === "FLEET" && entry.objectId === enemy.id), true);
  state.detection.recordsByPlayerId = {};
  assert.equal(detectObjectsForFleetAtCurrentHex(state, observer.id, () => 0.25)?.detected
    .some((entry) => entry.objectKind === "FLEET" && entry.objectId === enemy.id), false);
  enemy.tags = [];
  const result = detectObjectsForFleetAtCurrentHex(state, observer.id, () => 0.50);
  assert.equal(result?.roll, 51);
  assert.deepEqual(result?.detected.find((entry) => entry.objectId === enemy.id && entry.objectKind === "FLEET")?.detectedHex,
    enemy.position);
  assert.equal(hasDetectedObject(state, observer.ownerPlayerId, "FLEET", enemy.id), true);
  enemy.position = { q: enemy.position.q + 1, r: enemy.position.r };
  assert.equal(hasDetectedObject(state, observer.ownerPlayerId, "FLEET", enemy.id), false);
  assert.equal(detectObjectsForFleetAtCurrentHex(state, 2), null);
});

test("Detection tiers apply universal STEALTH and Tier 3 object filtering", () => {
  const state = createInitialGameState();
  const observer = state.fleets[1];
  observer.health = 100;
  const position = { ...observer.position };
  state.fleets[3].position = position;
  state.planets[1].position = position;
  state.planets[1].tags = ["STEALTH"];
  state.shipwrecks[1] = { id: 1, position, tags: ["STEALTH"],
    inventory: createEmptyItemInventory(), createdOnTurn: 1, sourceUnitIds: [] };
  state.anomalies[1] = { id: 1, position, tags: [], informationRef: "" };
  const tier1 = detectObjectsForFleetAtCurrentHex(state, observer.id, () => 0.24);
  assert.ok(tier1?.detected.some((entry) => entry.objectKind === "PLANET" && entry.objectId === 1));
  assert.ok(tier1?.detected.some((entry) => entry.objectKind === "SHIPWRECK"));
  const tier2 = detectObjectsForFleetAtCurrentHex(state, observer.id, () => 0.25);
  assert.ok(!tier2?.detected.some((entry) => entry.objectKind === "PLANET" && entry.objectId === 1));
  assert.ok(!tier2?.detected.some((entry) => entry.objectKind === "SHIPWRECK"));
  assert.ok(tier2?.detected.some((entry) => entry.objectKind === "ANOMALY"));
  const tier3 = detectObjectsForFleetAtCurrentHex(state, observer.id, () => 0.50);
  assert.ok(tier3?.detected.some((entry) => entry.objectKind === "FLEET" && entry.objectId === 3));
  assert.ok(!tier3?.detected.some((entry) => entry.objectKind === "ANOMALY"));
});

test("Each moved hex triggers one detection; a stationary Fleet rolls once", () => {
  const stationary = createInitialGameState();
  const stationaryResult = resolveTurn(stationary, []);
  assert.equal(stationaryResult.detection.filter((entry) => entry.observerFleetId === 1).length, 1);
  const moving = createInitialGameState();
  moving.fleets[1].movementPoints = 3;
  const result = resolveTurn(moving, [{ id: "two-steps", type: "MOVE_FLEET", playerId: 1,
    payload: { fleetId: 1, path: [{ q: 2, r: 1 }, { q: 3, r: 1 }] } }]);
  assert.equal(result.detection.filter((entry) => entry.observerFleetId === 1).length, 2);
});

test("Combat destruction salvages attached Commander and Knowledge", () => {
  const state = formedState();
  addFormation(state, "a", 1);
  state.fleets[1].itemInventory.knowledge.push("LORE");
  const enemy = state.fleets[3];
  enemy.position = { ...state.fleets[1].position };
  enemy.combatPower = 10;
  state.players[1].wars.push(2);
  const report = resolveCombat(state);
  assert.ok(report.destroyedFleetIds.includes(1));
  assert.equal(state.fleets[1], undefined);
  const wreck = Object.values(state.shipwrecks).find((entry) => entry.sourceUnitIds.includes(1));
  assert.ok(wreck);
  assert.ok(wreck.inventory.artifactIds.includes("commander"));
  assert.ok(wreck.inventory.knowledge.includes("LORE"));
  assert.equal(state.artifacts.commander.attachedUnitId, undefined);
  assert.deepEqual(state.artifacts.commander.owner, { kind: "SHIPWRECK", shipwreckId: wreck.id });
});

test("Tithe increases and Anomaly UPDATE lower morale only where applicable", () => {
  const state = createInitialGameState();
  const planet = state.planets[1];
  state.players[1].factionId = 7;
  planet.maxTitheLevel = "SOLUTIO_TERTIUS";
  planet.morale = 10;
  state.administratumTitheProposals = [{ planetId: planet.id, playerId: 1,
    requestedOnTurn: state.turnNumber, titheLevel: "SOLUTIO_SECUNDUS" }];
  resolveAdministratumTitheProposals(state);
  assert.equal(planet.morale, 9);
  state.anomalies[1] = { id: 1, position: { ...planet.position }, tags: [], informationRef: "",
    moraleLoss: 200 };
  state.fleets[1].position = { ...planet.position };
  state.fleets[1].morale = -90;
  const elsewhere = state.fleets[3].morale;
  applyAnomalyMoraleLoss(state);
  assert.equal(planet.morale, -100);
  assert.equal(state.fleets[1].morale, -100);
  assert.equal(state.fleets[3].morale, elsewhere);
});

test("Tithe morale tracks step difference, never charges a decrease or conflict", () => {
  const state = createInitialGameState();
  const planet = state.planets[1];
  state.players[1].factionId = 7;
  state.players[2].factionId = 7;
  planet.maxTitheLevel = "SOLUTIO_TERTIUS";
  planet.morale = 5;
  state.administratumTitheProposals = [{ planetId: 1, playerId: 1,
    requestedOnTurn: state.turnNumber, titheLevel: "SOLUTIO_PARTICULAR" }];
  resolveAdministratumTitheProposals(state);
  assert.equal(planet.morale, 2);
  state.administratumTitheProposals = [{ planetId: 1, playerId: 1,
    requestedOnTurn: state.turnNumber, titheLevel: "SOLUTIO_SECUNDUS" }];
  resolveAdministratumTitheProposals(state);
  assert.equal(planet.morale, 2);
  state.administratumTitheProposals = [
    { planetId: 1, playerId: 1, requestedOnTurn: state.turnNumber, titheLevel: "DECUMA_PRIMA" },
    { planetId: 1, playerId: 2, requestedOnTurn: state.turnNumber, titheLevel: "DECUMA_SECUNDUS" },
  ];
  resolveAdministratumTitheProposals(state);
  assert.equal(planet.morale, 2);
  assert.equal(planet.maxTitheLevel, "SOLUTIO_SECUNDUS");
});

test("Direct admin increase of maximum tithe also charges the step difference", async () => {
  const state = createInitialGameState();
  state.planets[1].maxTitheLevel = "SOLUTIO_TERTIUS";
  state.planets[1].morale = 10;
  const deps = { state, requireAdmin: () => ({ username: "gm", role: "admin" }),
    ensurePlanningPhase: () => true, auditAdminMutation: () => {}, persistDatabase: () => {},
    broadcastState: () => {} } as unknown as AdminHandlerDeps;
  const handlers = createPlanetAdminHandlers(deps);
  async function update(maxTitheLevel: string): Promise<void> {
    const request = Readable.from([JSON.stringify({ maxTitheLevel })]) as IncomingMessage;
    const response = { statusCode: 200, setHeader() {}, end() {} } as unknown as ServerResponse;
    await handlers.handleUpdatePlanet(request, response, "1");
    assert.equal(response.statusCode, 200);
  }
  await update("SOLUTIO_PARTICULAR");
  assert.equal(state.planets[1].morale, 7);
  await update("SOLUTIO_SECUNDUS");
  assert.equal(state.planets[1].morale, 7);
});

test("Anomaly UPDATE refreshes a formed Unit's derived combat projection", () => {
  const state = formedState();
  addFormation(state, "a");
  const unit = state.fleets[1];
  unit.morale = 100;
  state.anomalies[1] = { id: 1, position: { ...unit.position }, tags: [], informationRef: "",
    moraleLoss: 40 };
  applyAnomalyMoraleLoss(state);
  assert.equal(unit.morale, 60);
  assert.equal(unit.combatPower, calculateUnitDerived(state, unit.id)?.combatPower);
});

test("Individual items and legacy data survive snapshot normalization", () => {
  const state = formedState();
  addFormation(state, "a", 45);
  state.unitVariants[5] = { id: 5, name: "Legacy", domain: "SPACE" };
  state.fleets[3].unitVariantId = 5;
  state.fleets[3].inventory.REGIMENTS = 4;
  state.planets[1].shop.items = createEmptyItemInventory();
  const restored = normalizeGameState(JSON.parse(JSON.stringify(state)) as GameState);
  assert.equal(restored.formations?.a.currentHealth, 45);
  assert.equal(restored.artifacts.commander.attachedUnitId, 1);
  assert.equal(restored.fleets[3].unitVariantId, 5);
  assert.equal(restored.fleets[3].inventory.REGIMENTS, 4);
});

test("Admin Tag API persists valid definitions and rolls back a cyclic update", async () => {
  const state = createInitialGameState();
  let broadcasts = 0;
  const manager = createStateTransactionManager({
    state, accounts: new Map(), turnSnapshots: [], pendingActions: new Map(),
    pendingAllianceProposals: new Set(), readyPlayers: new Set(),
    getSessions: () => ({}), restoreSessions: () => {},
    repository: { getSnapshot: () => ({ schemaVersion: CURRENT_SCHEMA_VERSION,
      gameState: state, accounts: {}, sessions: {}, turnSnapshots: [] }), replace: () => {} },
  });
  const deps = {
    state, accounts: new Map(), pendingActions: new Map(), pendingAllianceProposals: new Set(),
    readyPlayers: new Set(), requireAdmin: () => ({ username: "gm", role: "admin" }),
    ensurePlanningPhase: () => true, persistDatabase: manager.persistAndCommit,
    broadcastState: () => { broadcasts += 1; }, removeSessionsForPlayer: () => {},
    listTurnSnapshots: () => [], rollbackTurnSnapshot: () => false,
    auditAdminMutation: (_req: IncomingMessage, input: Parameters<AdminHandlerDeps["auditAdminMutation"]>[1]) => {
      appendAudit(state, { ...input, actor: { kind: "ADMIN", account: "gm" } });
    },
  } as unknown as AdminHandlerDeps;
  const handlers = { newModel: createNewModelAdminHandlers(deps) } as unknown as ApiRouteHandlers;
  async function put(path: string, payload: unknown): Promise<number> {
    const request = Readable.from([JSON.stringify(payload)]) as IncomingMessage;
    request.method = "PUT"; request.url = path;
    const response = { statusCode: 200, setHeader() {}, end() {} } as unknown as ServerResponse;
    await handleApiRequest(request, response, handlers);
    return response.statusCode;
  }
  assert.equal(await put("/api/admin/tags/NEW", { name: "New", parentTagIds: ["STEALTH"] }), 200);
  assert.equal(state.tags?.NEW.parentTagIds[0], "STEALTH");
  assert.equal(await put("/api/admin/tags/STEALTH", { name: "Stealth", parentTagIds: ["NEW"] }), 400);
  assert.deepEqual(state.tags?.STEALTH.parentTagIds, []);
  assert.equal(broadcasts, 1);
  assert.equal(state.audit.filter((entry) => entry.entityType === "TAGS").length, 1);
});

test("Admin creates a complete Unit from PRODUCT instances and a Commander Artifact", async () => {
  const state = formedState();
  const deps = {
    state, requireAdmin: () => ({ username: "gm", role: "admin" }), ensurePlanningPhase: () => true,
    persistDatabase: () => validateDocumentSnapshot({ schemaVersion: CURRENT_SCHEMA_VERSION,
      gameState: state, accounts: {}, sessions: {}, turnSnapshots: [] }),
    broadcastState: () => {},
    auditAdminMutation: (_req: IncomingMessage, input: Parameters<AdminHandlerDeps["auditAdminMutation"]>[1]) => {
      appendAudit(state, { ...input, actor: { kind: "ADMIN", account: "gm" } });
    },
  } as unknown as AdminHandlerDeps;
  const handler = createNewModelAdminHandlers(deps);
  const request = Readable.from([JSON.stringify({ ownerPlayerId: 1, domain: "SPACE",
    q: 1, r: 1, commanderKindId: "COMMANDER", formationKindIds: ["REGIMENT", "REGIMENT"] })]) as IncomingMessage;
  let result: { value?: { id: number } } = {};
  const response = { statusCode: 200, setHeader() {}, end(chunk?: string) {
    result = chunk ? JSON.parse(chunk) : {};
  } } as unknown as ServerResponse;
  await handler.createUnit(request, response);
  assert.equal(response.statusCode, 200);
  const unit = state.fleets[result.value!.id];
  assert.equal(unit.health, 200);
  assert.equal(unit.combatPower, 200);
  assert.equal(unit.formationIds?.length, 2);
  assert.equal(state.artifacts[unit.commanderArtifactId!].attachedUnitId, unit.id);
});

test("Legacy HP/BM-only Unit creation route is closed", async () => {
  const request = Readable.from([]) as IncomingMessage;
  request.method = "POST";
  request.url = "/api/admin/fleets";
  const response = { statusCode: 200, setHeader() {}, end() {} } as unknown as ServerResponse;
  await handleApiRequest(request, response, {} as ApiRouteHandlers);
  assert.equal(response.statusCode, 410);
});
