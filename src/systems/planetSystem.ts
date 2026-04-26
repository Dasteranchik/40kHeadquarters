import {
  computePopulationProduction,
  isProductResourceKey,
  isRawResourceKey,
  isResourceKey,
  isTitheLevel,
  PRODUCT_RECIPES,
  RAW_OUTPUTS_BY_WORLD_TYPE,
  ResourceKey,
  titheCategoryRank,
  titheValue,
} from "../planetDomain";
import {
  Fleet,
  GameState,
  Planet,
  PlanetAction,
  PlanetEvent,
  PlanetReport,
  ResourceStore,
} from "../types";

const MAX_MORALE = 100;

function orderedPlanetIds(state: GameState): string[] {
  return Object.keys(state.planets).sort((a, b) => a.localeCompare(b));
}

function orderedPlanetActions(actions: PlanetAction[]): PlanetAction[] {
  return [...actions].sort((a, b) => a.id.localeCompare(b.id));
}

function fleetSortById(a: Fleet, b: Fleet): number {
  return a.id.localeCompare(b.id);
}

function getStoreAmount(store: ResourceStore, resourceKey: ResourceKey): number {
  return Math.max(0, Math.trunc(store[resourceKey] ?? 0));
}

function addToStore(store: ResourceStore, resourceKey: ResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }

  store[resourceKey] = getStoreAmount(store, resourceKey) + amount;
}

function takeFromStore(
  store: ResourceStore,
  resourceKey: ResourceKey,
  requested: number,
): number {
  const available = getStoreAmount(store, resourceKey);
  const moved = Math.min(Math.max(0, Math.trunc(requested)), available);
  if (moved <= 0) {
    return 0;
  }

  const left = available - moved;
  if (left <= 0) {
    delete store[resourceKey];
  } else {
    store[resourceKey] = left;
  }

  return moved;
}

function inventoryLoad(fleet: Fleet): number {
  return Object.values(fleet.inventory).reduce((sum, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return sum;
    }

    return sum + Math.max(0, Math.trunc(value));
  }, 0);
}

function fleetFreeCapacity(fleet: Fleet): number {
  return Math.max(0, Math.trunc(fleet.capacity) - inventoryLoad(fleet));
}

function addToFleetInventory(
  fleet: Fleet,
  resourceKey: ResourceKey,
  requested: number,
): number {
  const free = fleetFreeCapacity(fleet);
  const moved = Math.min(Math.max(0, Math.trunc(requested)), free);
  if (moved <= 0) {
    return 0;
  }

  fleet.inventory[resourceKey] = getStoreAmount(fleet.inventory, resourceKey) + moved;
  return moved;
}

function removeFromFleetInventory(
  fleet: Fleet,
  resourceKey: ResourceKey,
  requested: number,
): number {
  return takeFromStore(fleet.inventory, resourceKey, requested);
}

function fleetsOnPlanet(state: GameState, planet: Planet): Fleet[] {
  return Object.values(state.fleets)
    .filter(
      (fleet) =>
        fleet.position.q === planet.position.q && fleet.position.r === planet.position.r,
    )
    .sort(fleetSortById);
}

function playerFleetsOnPlanet(
  state: GameState,
  planet: Planet,
  playerId: string,
): Fleet[] {
  return fleetsOnPlanet(state, planet).filter((fleet) => fleet.ownerPlayerId === playerId);
}

function isImperialPlayer(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  return player?.alignment === "IMPERIAL";
}

function event(
  report: PlanetReport,
  payload: PlanetEvent,
): void {
  report.events.push(payload);
}

function parseAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function applyPendingInformants(state: GameState, report: PlanetReport): void {
  const next: GameState["pendingInformantActions"] = [];

  for (const pending of state.pendingInformantActions) {
    if (pending.applyOnTurn > state.turnNumber) {
      next.push(pending);
      continue;
    }

    const player = state.players[pending.playerId];
    const planet = state.planets[pending.planetId];
    if (!player || !planet) {
      continue;
    }

    const gained = Math.max(0, Math.trunc(planet.infoFragments[pending.infoCategory] ?? 0));
    player.intelFragments[pending.infoCategory] =
      Math.max(0, Math.trunc(player.intelFragments[pending.infoCategory] ?? 0)) + gained;

    event(report, {
      planetId: planet.id,
      kind: "PENDING_INFORMANT_APPLIED",
      details: `player ${player.id} gained ${gained} ${pending.infoCategory} intel`,
    });
  }

  state.pendingInformantActions = next;
}

function applyPendingTitheChanges(state: GameState, report: PlanetReport): void {
  const next: GameState["pendingTitheChanges"] = [];

  for (const pending of state.pendingTitheChanges) {
    if (pending.applyOnTurn > state.turnNumber) {
      next.push(pending);
      continue;
    }

    const planet = state.planets[pending.planetId];
    if (!planet) {
      continue;
    }

    planet.titheLevel = pending.titheLevel;
    planet.titheTarget = titheValue(pending.titheLevel);

    event(report, {
      planetId: planet.id,
      kind: "PENDING_TITHE_APPLIED",
      details: `tithe set to ${pending.titheLevel} (${planet.titheTarget})`,
    });
  }

  state.pendingTitheChanges = next;
}

function generateForPlanet(
  planet: Planet,
  report: PlanetReport,
  kind: "TURN_GENERATION" | "MANUAL_GENERATION",
  actionId?: string,
): void {
  const perResourceRate = computePopulationProduction(planet.population);
  const outputs = RAW_OUTPUTS_BY_WORLD_TYPE[planet.worldType] ?? [];
  planet.resourceProduction = perResourceRate * outputs.length;

  if (outputs.length === 0 || perResourceRate <= 0) {
    return;
  }

  if (planet.tithePaid >= planet.titheTarget) {
    return;
  }

  for (const resourceKey of outputs) {
    addToStore(planet.rawStock, resourceKey, perResourceRate);
  }

  event(report, {
    actionId,
    planetId: planet.id,
    kind,
    details: `generated ${perResourceRate} x ${outputs.join(",")}`,
  });
}

function applyTurnGeneration(state: GameState, report: PlanetReport): void {
  for (const planetId of orderedPlanetIds(state)) {
    const planet = state.planets[planetId];
    if (!planet) {
      continue;
    }

    generateForPlanet(planet, report, "TURN_GENERATION");
  }
}

function reject(
  report: PlanetReport,
  action: PlanetAction,
  reason: string,
): void {
  event(report, {
    actionId: action.id,
    planetId: action.payload.planetId,
    kind: "REJECTED",
    details: reason,
  });
}

function requireActionFleet(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): Fleet | null {
  const fleetId = action.payload.fleetId;
  if (!fleetId) {
    reject(report, action, "fleetId is required");
    return null;
  }

  const fleet = state.fleets[fleetId];
  if (!fleet || fleet.ownerPlayerId !== action.playerId) {
    reject(report, action, "fleet not found or does not belong to player");
    return null;
  }

  if (fleet.position.q !== planet.position.q || fleet.position.r !== planet.position.r) {
    reject(report, action, "fleet is not in planet hex");
    return null;
  }

  return fleet;
}

function applyTakeStock(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  if (!isImperialPlayer(state, action.playerId)) {
    reject(report, action, "take stock is only for imperial players");
    return;
  }

  const fleet = requireActionFleet(state, action, planet, report);
  if (!fleet) {
    return;
  }

  const resourceKey = action.payload.resourceKey;
  if (!isRawResourceKey(resourceKey)) {
    reject(report, action, "resourceKey must be a raw resource");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "amount must be positive");
    return;
  }

  const taken = takeFromStore(planet.rawStock, resourceKey, requested);
  if (taken <= 0) {
    reject(report, action, "planet raw stock is empty for this resource");
    return;
  }

  const moved = addToFleetInventory(fleet, resourceKey, taken);
  if (moved <= 0) {
    addToStore(planet.rawStock, resourceKey, taken);
    reject(report, action, "fleet has no free capacity");
    return;
  }

  if (moved < taken) {
    addToStore(planet.rawStock, resourceKey, taken - moved);
  }

  planet.tithePaid += moved;

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "TAKE_STOCK",
    details: `${fleet.id} took ${moved} ${resourceKey} from raw stock`,
  });
}

function applyRaidStock(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  if (isImperialPlayer(state, action.playerId)) {
    reject(report, action, "raid stock is only for non-imperial players");
    return;
  }

  const fleet = requireActionFleet(state, action, planet, report);
  if (!fleet) {
    return;
  }

  const hasGroundUnits = fleetsOnPlanet(state, planet).some(
    (otherFleet) => otherFleet.domain === "GROUND",
  );
  if (hasGroundUnits) {
    reject(report, action, "cannot raid while ground units are present");
    return;
  }

  const resourceKey = action.payload.resourceKey;
  if (!isRawResourceKey(resourceKey)) {
    reject(report, action, "resourceKey must be a raw resource");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "amount must be positive");
    return;
  }

  const taken = takeFromStore(planet.rawStock, resourceKey, requested);
  if (taken <= 0) {
    reject(report, action, "planet raw stock is empty for this resource");
    return;
  }

  const moved = addToFleetInventory(fleet, resourceKey, taken);
  if (moved <= 0) {
    addToStore(planet.rawStock, resourceKey, taken);
    reject(report, action, "fleet has no free capacity");
    return;
  }

  if (moved < taken) {
    addToStore(planet.rawStock, resourceKey, taken - moved);
  }

  planet.tithePaid += moved;

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "RAID_STOCK",
    details: `${fleet.id} raided ${moved} ${resourceKey}`,
  });
}

function applyTakeFromStorage(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  const fleet = requireActionFleet(state, action, planet, report);
  if (!fleet) {
    return;
  }

  const resourceKey = action.payload.resourceKey;
  if (!isResourceKey(resourceKey)) {
    reject(report, action, "resourceKey is required");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "amount must be positive");
    return;
  }

  const taken = takeFromStore(planet.productStorage, resourceKey, requested);
  if (taken <= 0) {
    reject(report, action, "planet product storage is empty for this resource");
    return;
  }

  const moved = addToFleetInventory(fleet, resourceKey, taken);
  if (moved <= 0) {
    addToStore(planet.productStorage, resourceKey, taken);
    reject(report, action, "fleet has no free capacity");
    return;
  }

  if (moved < taken) {
    addToStore(planet.productStorage, resourceKey, taken - moved);
  }

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "TAKE_FROM_STORAGE",
    details: `${fleet.id} took ${moved} ${resourceKey} from product storage`,
  });
}

function applyDepositToStorage(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  const fleet = requireActionFleet(state, action, planet, report);
  if (!fleet) {
    return;
  }

  const resourceKey = action.payload.resourceKey;
  if (!isResourceKey(resourceKey)) {
    reject(report, action, "resourceKey is required");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "amount must be positive");
    return;
  }

  const moved = removeFromFleetInventory(fleet, resourceKey, requested);
  if (moved <= 0) {
    reject(report, action, "fleet does not have this resource in inventory");
    return;
  }

  addToStore(planet.productStorage, resourceKey, moved);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "DEPOSIT_TO_STORAGE",
    details: `${fleet.id} deposited ${moved} ${resourceKey} to product storage`,
  });
}

function applyCreateProduct(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "player must have a fleet in planet hex");
    return;
  }

  const productKey = action.payload.productKey;
  if (!isProductResourceKey(productKey)) {
    reject(report, action, "productKey is invalid");
    return;
  }

  const recipe = PRODUCT_RECIPES[productKey];
  if (!planet.worldTags.includes(recipe.requiredTag)) {
    reject(report, action, `planet requires tag ${recipe.requiredTag}`);
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "amount must be positive");
    return;
  }

  let totalAvailable = 0;
  for (const fleet of fleets) {
    totalAvailable += getStoreAmount(fleet.inventory, recipe.input);
  }

  let toConvert = Math.min(requested, totalAvailable);
  if (toConvert <= 0) {
    reject(report, action, `not enough ${recipe.input} in fleets inventory`);
    return;
  }

  for (const fleet of fleets) {
    if (toConvert <= 0) {
      break;
    }

    const removed = removeFromFleetInventory(fleet, recipe.input, toConvert);
    toConvert -= removed;
  }

  const converted = Math.min(requested, totalAvailable);
  addToStore(planet.productStorage, productKey, converted);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "CREATE_PRODUCT",
    details: `converted ${converted} ${recipe.input} into ${productKey}`,
  });
}

function applyRaiseMorale(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
  usedPlayers: Set<string>,
): void {
  if (!isImperialPlayer(state, action.playerId)) {
    reject(report, action, "raise morale is only for imperial players");
    return;
  }

  if (usedPlayers.has(action.playerId)) {
    reject(report, action, "player already raised morale this turn");
    return;
  }

  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "player must have a fleet in planet hex");
    return;
  }

  planet.morale = Math.min(MAX_MORALE, planet.morale + 1);
  usedPlayers.add(action.playerId);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "RAISE_MORALE",
    details: `morale increased to ${planet.morale}`,
  });
}

function applyScheduleInformant(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  if (!isImperialPlayer(state, action.playerId)) {
    reject(report, action, "informant action is only for imperial players");
    return;
  }

  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "player must have a fleet in planet hex");
    return;
  }

  const category = action.payload.infoCategory;
  if (!category) {
    reject(report, action, "infoCategory is required");
    return;
  }

  state.pendingInformantActions.push({
    planetId: planet.id,
    playerId: action.playerId,
    infoCategory: category,
    applyOnTurn: state.turnNumber + 1,
  });

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "SCHEDULE_INFORMANT",
    details: `${category} informant scheduled for turn ${state.turnNumber + 1}`,
  });
}

function titheMoralePenalty(deltaCategories: number): number {
  if (deltaCategories >= 8) {
    return 3;
  }

  if (deltaCategories >= 4) {
    return 2;
  }

  if (deltaCategories >= 1) {
    return 1;
  }

  return 0;
}

function applyScheduleTithe(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  if (!isImperialPlayer(state, action.playerId)) {
    reject(report, action, "set tithe is only for imperial players");
    return;
  }

  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "player must have a fleet in planet hex");
    return;
  }

  const nextTitheLevel = action.payload.titheLevel;
  if (!isTitheLevel(nextTitheLevel)) {
    reject(report, action, "titheLevel is invalid");
    return;
  }

  const pending = state.pendingTitheChanges.find(
    (entry) => entry.planetId === planet.id && entry.applyOnTurn === state.turnNumber + 1,
  );

  const baseLevel = pending?.titheLevel ?? planet.titheLevel;
  const deltaCategories = Math.max(
    0,
    titheCategoryRank(baseLevel) - titheCategoryRank(nextTitheLevel),
  );
  const moralePenalty = titheMoralePenalty(deltaCategories);
  if (moralePenalty > 0) {
    planet.morale = Math.max(0, planet.morale - moralePenalty);
  }

  if (pending) {
    pending.titheLevel = nextTitheLevel;
    pending.requestedByPlayerId = action.playerId;
  } else {
    state.pendingTitheChanges.push({
      planetId: planet.id,
      titheLevel: nextTitheLevel,
      requestedByPlayerId: action.playerId,
      applyOnTurn: state.turnNumber + 1,
    });
  }

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "SCHEDULE_TITHE",
    details: `tithe scheduled ${baseLevel} -> ${nextTitheLevel} for turn ${
      state.turnNumber + 1
    }, morale ${planet.morale}`,
  });
}

function applyManualProduction(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
  usedPlanets: Set<string>,
): void {
  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "player must have a fleet in planet hex");
    return;
  }

  if (usedPlanets.has(planet.id)) {
    reject(report, action, "manual production already used on this planet this turn");
    return;
  }

  usedPlanets.add(planet.id);
  generateForPlanet(planet, report, "MANUAL_GENERATION", action.id);
}

function executePlanetAction(
  state: GameState,
  action: PlanetAction,
  report: PlanetReport,
  moraleUsedByPlayer: Set<string>,
  manualProductionUsedByPlanet: Set<string>,
): void {
  const planet = state.planets[action.payload.planetId];
  if (!planet) {
    reject(report, action, "planet not found");
    return;
  }

  if (!state.players[action.playerId]) {
    reject(report, action, "player not found");
    return;
  }

  switch (action.payload.kind) {
    case "TAKE_STOCK":
      applyTakeStock(state, action, planet, report);
      return;

    case "RAID_STOCK":
      applyRaidStock(state, action, planet, report);
      return;

    case "TAKE_FROM_STORAGE":
      applyTakeFromStorage(state, action, planet, report);
      return;

    case "DEPOSIT_TO_STORAGE":
      applyDepositToStorage(state, action, planet, report);
      return;

    case "CREATE_PRODUCT":
      applyCreateProduct(state, action, planet, report);
      return;

    case "ECCLESIARCHY_RAISE_MORALE":
      applyRaiseMorale(state, action, planet, report, moraleUsedByPlayer);
      return;

    case "INQUISITION_DEPLOY_INFORMANT":
      applyScheduleInformant(state, action, planet, report);
      return;

    case "ADMINISTRATUM_SET_TITHE":
      applyScheduleTithe(state, action, planet, report);
      return;

    case "PRODUCE_RESOURCE":
      applyManualProduction(
        state,
        action,
        planet,
        report,
        manualProductionUsedByPlanet,
      );
      return;

    default:
      reject(report, action, `unsupported action kind ${action.payload.kind}`);
  }
}

export function applyPlanetSystems(
  state: GameState,
  actions: PlanetAction[],
): PlanetReport {
  const report: PlanetReport = {
    events: [],
  };

  applyPendingInformants(state, report);
  applyPendingTitheChanges(state, report);
  applyTurnGeneration(state, report);

  const moraleUsedByPlayer = new Set<string>();
  const manualProductionUsedByPlanet = new Set<string>();

  for (const action of orderedPlanetActions(actions)) {
    executePlanetAction(
      state,
      action,
      report,
      moraleUsedByPlayer,
      manualProductionUsedByPlanet,
    );
  }

  return report;
}

