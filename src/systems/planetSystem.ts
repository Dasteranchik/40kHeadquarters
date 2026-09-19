import {
  calculateTitheProgress,
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
import { getPlayerProductStorage } from "./planetStorage";

export type ImmediatePlanetActionKind =
  | "TAKE_STOCK"
  | "RAID_STOCK"
  | "TAKE_FROM_STORAGE"
  | "DEPOSIT_TO_STORAGE"
  | "CREATE_PRODUCT";

export interface ImmediatePlanetActionResult {
  ok: boolean;
  message: string;
  report: PlanetReport;
}

export function isImmediatePlanetActionKind(
  kind: PlanetAction["payload"]["kind"],
): kind is ImmediatePlanetActionKind {
  return kind === "TAKE_STOCK"
    || kind === "RAID_STOCK"
    || kind === "TAKE_FROM_STORAGE"
    || kind === "DEPOSIT_TO_STORAGE"
    || kind === "CREATE_PRODUCT";
}

const MAX_MORALE = 100;
const ECCLESIARCHY_FACTION_ID = "ecclesiarchy";
const INQUISITION_FACTION_ID = "inquisition";

function orderedPlanetIds(state: GameState): string[] {
  return Object.keys(state.planets).sort((a, b) => a.localeCompare(b));
}

function orderedPlanetActions(actions: PlanetAction[]): PlanetAction[] {
  return [...actions].sort((a, b) => a.id.localeCompare(b.id));
}

function fleetSortById(a: Fleet, b: Fleet): number {
    return a.id - b.id;
}

function getStoreAmount(store: ResourceStore, resourceKey: ResourceKey): number {
  const value = store[resourceKey];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function addToStore(store: ResourceStore, resourceKey: ResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }

  store[resourceKey] = Math.round((getStoreAmount(store, resourceKey) + amount) * 100) / 100;
}

function takeFromStore(
  store: ResourceStore,
  resourceKey: ResourceKey,
  requested: number,
): number {
  const available = getStoreAmount(store, resourceKey);
  const moved = Math.min(Math.max(0, Math.trunc(requested)), Math.floor(available));
  if (moved <= 0) {
    return 0;
  }

  const left = available - moved;
  if (left <= 0) {
    delete store[resourceKey];
  } else {
    store[resourceKey] = Math.round(left * 100) / 100;
  }

  return moved;
}

function takeFractionalFromStore(
  store: ResourceStore,
  resourceKey: ResourceKey,
  requested: number,
): number {
  const available = getStoreAmount(store, resourceKey);
  const normalizedRequest = Math.max(0, Math.round(requested * 100) / 100);
  const moved = Math.min(normalizedRequest, available);
  if (moved <= 0) {
    return 0;
  }

  const left = Math.round((available - moved) * 100) / 100;
  if (left <= 0) {
    delete store[resourceKey];
  } else {
    store[resourceKey] = left;
  }

  return Math.round(moved * 100) / 100;
}

function addToFleetInventory(
  fleet: Fleet,
  resourceKey: ResourceKey,
  requested: number,
): number {
  const moved = Math.max(0, Math.trunc(requested));
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

function playerHasFaction(
  state: GameState,
  playerId: string,
  factionCode: string,
): boolean {
  const player = state.players[playerId];
  return Boolean(player && state.factions[player.factionId]?.code === factionCode);
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
      details: `Игрок ${player.id} получил ${gained} ед. разведданных ${pending.infoCategory}`,
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
      details: `Десятина установлена на ${pending.titheLevel} (цель: ${planet.titheTarget})`,
    });
  }

  state.pendingTitheChanges = next;
}

function generateForPlanet(
  planet: Planet,
  report: PlanetReport,
): void {
  const generated: string[] = [];
  const populationProduction = computePopulationProduction(planet.population);
  const generationTarget = planet.tithePaid >= planet.titheTarget
    ? planet.shop.resources
    : planet.rawStock;
  planet.resourceProduction = 0;
  for (const [resourceKey, enabled] of Object.entries(planet.resourceGeneration)) {
    if (!isResourceKey(resourceKey)) continue;
    if (!enabled || enabled <= 0) continue;
    const amount = populationProduction;
    if (amount <= 0) continue;
    addToStore(generationTarget, resourceKey, amount);
    planet.resourceProduction = Math.round((planet.resourceProduction + amount) * 100) / 100;
    generated.push(`${amount} ${resourceKey}`);
  }

  if (generated.length === 0) return;

  event(report, {
    planetId: planet.id,
    kind: "TURN_GENERATION",
    details: `Произведено ${generated.join(", ")} в ${generationTarget === planet.rawStock ? "Склад десятины" : "Магазин"}`,
  });
}

function recordTitheContribution(state: GameState, planet: Planet, resourceKey: ResourceKey, amount: number): void {
  addToStore(planet.titheContributions, resourceKey, amount);
  const progress = calculateTitheProgress(
    planet.maxTitheLevel,
    planet.titheContributions,
  );
  planet.titheLevel = progress.currentLevel;
  planet.tithePaid = progress.paid;
  planet.titheTarget = progress.target;
}

function remainingTitheCapacity(planet: Planet): number {
  return Math.max(0, Math.floor(planet.titheTarget - planet.tithePaid));
}

function applyTurnGeneration(state: GameState, report: PlanetReport): void {
  for (const planetId of orderedPlanetIds(state)) {
    const planet = state.planets[planetId];
    if (!planet) {
      continue;
    }

    generateForPlanet(planet, report);
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
    reject(report, action, "Требуется fleetId");
    return null;
  }

  const fleet = state.fleets[fleetId];
  if (!fleet || fleet.ownerPlayerId !== action.playerId) {
    reject(report, action, "Флот не найден или не принадлежит игроку");
    return null;
  }

  if (fleet.position.q !== planet.position.q || fleet.position.r !== planet.position.r) {
    reject(report, action, "Флот не находится в гексе планеты");
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
    reject(report, action, "Забирать десятину могут только имперские игроки");
    return;
  }
  if (!state.players[action.playerId]?.canTakePlanetResources) {
    reject(report, action, "Игроку запрещено забирать ресурсы планеты");
    return;
  }

  const fleet = requireActionFleet(state, action, planet, report);
  if (!fleet) {
    return;
  }

  const resourceKey = action.payload.resourceKey;
  if (!isRawResourceKey(resourceKey)) {
    reject(report, action, "resourceKey должен указывать RAW-ресурс");
    return;
  }

  const requested = Math.min(
    parseAmount(action.payload.amount),
    remainingTitheCapacity(planet),
  );
  if (requested <= 0) {
    reject(report, action, "Лимит десятины планеты исчерпан");
    return;
  }

  const taken = takeFromStore(planet.rawStock, resourceKey, requested);
  if (taken <= 0) {
    reject(report, action, "В Складе десятины нет этого ресурса");
    return;
  }

  const moved = addToFleetInventory(fleet, resourceKey, taken);
  if (moved <= 0) {
    addToStore(planet.rawStock, resourceKey, taken);
    reject(report, action, "У флота нет свободной вместимости");
    return;
  }

  if (moved < taken) {
    addToStore(planet.rawStock, resourceKey, taken - moved);
  }

  recordTitheContribution(state, planet, resourceKey, moved);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "TAKE_STOCK",
    details: `Флот ${fleet.id} получил ${moved} ${resourceKey} из Склада десятины`,
  });
}

function applyRaidStock(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  if (isImperialPlayer(state, action.playerId)) {
    reject(report, action, "Грабёж доступен только неимперским игрокам");
    return;
  }
  if (!state.players[action.playerId]?.canTakePlanetResources) {
    reject(report, action, "Игроку запрещено забирать ресурсы планеты");
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
    reject(report, action, "Грабёж невозможен, пока в гексе есть наземные юниты");
    return;
  }

  const resourceKey = action.payload.resourceKey;
  if (!isRawResourceKey(resourceKey)) {
    reject(report, action, "resourceKey должен указывать RAW-ресурс");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "Количество должно быть положительным");
    return;
  }

  const taken = takeFromStore(planet.shop.resources, resourceKey, requested);
  if (taken <= 0) {
    reject(report, action, "В Магазине планеты нет этого ресурса");
    return;
  }

  const moved = addToFleetInventory(fleet, resourceKey, taken);
  if (moved <= 0) {
    addToStore(planet.shop.resources, resourceKey, taken);
    reject(report, action, "У флота нет свободной вместимости");
    return;
  }

  if (moved < taken) {
    addToStore(planet.shop.resources, resourceKey, taken - moved);
  }

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "RAID_STOCK",
    details: `Флот ${fleet.id} награбил ${moved} ${resourceKey} из Магазина`,
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
    reject(report, action, "Требуется resourceKey");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "Количество должно быть положительным");
    return;
  }

  const productStorage = getPlayerProductStorage(planet, action.playerId);
  const taken = takeFromStore(productStorage, resourceKey, requested);
  if (taken <= 0) {
    reject(report, action, "В складе продуктов планеты нет этого ресурса");
    return;
  }

  const moved = addToFleetInventory(fleet, resourceKey, taken);
  if (moved <= 0) {
    addToStore(productStorage, resourceKey, taken);
    reject(report, action, "У флота нет свободной вместимости");
    return;
  }

  if (moved < taken) {
    addToStore(productStorage, resourceKey, taken - moved);
  }

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "TAKE_FROM_STORAGE",
    details: `Флот ${fleet.id} получил ${moved} ${resourceKey} из склада продуктов`,
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
    reject(report, action, "Требуется resourceKey");
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "Количество должно быть положительным");
    return;
  }

  const moved = removeFromFleetInventory(fleet, resourceKey, requested);
  if (moved <= 0) {
    reject(report, action, "В инвентаре флота нет этого ресурса");
    return;
  }

  addToStore(getPlayerProductStorage(planet, action.playerId), resourceKey, moved);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "DEPOSIT_TO_STORAGE",
    details: `Флот ${fleet.id} поместил ${moved} ${resourceKey} в склад продуктов`,
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
    reject(report, action, "Флот игрока должен находиться в гексе планеты");
    return;
  }

  const productKey = action.payload.productKey;
  if (!isProductResourceKey(productKey)) {
    reject(report, action, "Недопустимый productKey");
    return;
  }

  const recipe = PRODUCT_RECIPES[productKey];
  if (!planet.worldTags.includes(recipe.requiredTag)) {
    reject(report, action, `Планете требуется тег ${recipe.requiredTag}`);
    return;
  }

  const requested = parseAmount(action.payload.amount);
  if (requested <= 0) {
    reject(report, action, "Количество должно быть положительным");
    return;
  }

  let totalAvailable = 0;
  for (const fleet of fleets) {
    totalAvailable += getStoreAmount(fleet.inventory, recipe.input);
  }

  const conversionRate = state.productConversionRates[productKey];
  const converted = Math.min(
    requested,
    Math.floor(totalAvailable * conversionRate + 1e-9),
  );
  if (converted <= 0) {
    reject(report, action, `В инвентарях флотов недостаточно ${recipe.input}`);
    return;
  }

  const inputRequired = Math.ceil((converted / conversionRate) * 100 - 1e-9) / 100;
  let inputRemaining = inputRequired;

  for (const fleet of fleets) {
    if (inputRemaining <= 0) {
      break;
    }

    const removed = takeFractionalFromStore(fleet.inventory, recipe.input, inputRemaining);
    inputRemaining = Math.round((inputRemaining - removed) * 100) / 100;
  }

  addToStore(getPlayerProductStorage(planet, action.playerId), productKey, converted);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "CREATE_PRODUCT",
    details: `Преобразовано ${inputRequired} ${recipe.input} в ${converted} ${productKey} (коэффициент ${conversionRate})`,
  });
}

export function applyImmediatePlanetAction(
  state: GameState,
  action: PlanetAction,
): ImmediatePlanetActionResult {
  const report: PlanetReport = { events: [] };
  const planet = state.planets[action.payload.planetId];
  if (!planet) {
    reject(report, action, "Планета не найдена");
  } else if (!state.players[action.playerId]) {
    reject(report, action, "Игрок не найден");
  } else {
    switch (action.payload.kind) {
      case "TAKE_STOCK":
        applyTakeStock(state, action, planet, report);
        break;
      case "RAID_STOCK":
        applyRaidStock(state, action, planet, report);
        break;
      case "TAKE_FROM_STORAGE":
        applyTakeFromStorage(state, action, planet, report);
        break;
      case "DEPOSIT_TO_STORAGE":
        applyDepositToStorage(state, action, planet, report);
        break;
      case "CREATE_PRODUCT":
        applyCreateProduct(state, action, planet, report);
        break;
      default:
        reject(report, action, `${action.payload.kind} не является немедленным экономическим действием`);
    }
  }

  const rejected = report.events.find((entry) => entry.kind === "REJECTED");
  const lastEvent = report.events[report.events.length - 1];
  return {
    ok: !rejected && Boolean(lastEvent),
    message: rejected?.details ?? lastEvent?.details ?? "Экономическое действие не дало результата",
    report,
  };
}

function applyRaiseMorale(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
  usedPlayers: Set<number>,
): void {
  if (!isImperialPlayer(state, action.playerId)) {
    reject(report, action, "Поднимать мораль могут только имперские игроки");
    return;
  }

  if (!playerHasFaction(state, action.playerId, ECCLESIARCHY_FACTION_ID)) {
    reject(report, action, "Для поднятия морали требуется фракция Экклезиархии");
    return;
  }

  if (usedPlayers.has(action.playerId)) {
    reject(report, action, "Игрок уже поднимал мораль в этом ходу");
    return;
  }

  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "Флот игрока должен находиться в гексе планеты");
    return;
  }

  planet.morale = Math.min(MAX_MORALE, planet.morale + 1);
  usedPlayers.add(action.playerId);

  event(report, {
    actionId: action.id,
    planetId: planet.id,
    kind: "RAISE_MORALE",
    details: `Мораль повышена до ${planet.morale}`,
  });
}

function applyScheduleInformant(
  state: GameState,
  action: PlanetAction,
  planet: Planet,
  report: PlanetReport,
): void {
  if (!isImperialPlayer(state, action.playerId)) {
    reject(report, action, "Действие с осведомителем доступно только имперским игрокам");
    return;
  }

  if (!playerHasFaction(state, action.playerId, INQUISITION_FACTION_ID)) {
    reject(report, action, "Для осведомителя требуется фракция Инквизиции");
    return;
  }

  const fleets = playerFleetsOnPlanet(state, planet, action.playerId);
  if (fleets.length === 0) {
    reject(report, action, "Флот игрока должен находиться в гексе планеты");
    return;
  }

  const category = action.payload.infoCategory;
  if (!category) {
    reject(report, action, "Требуется infoCategory");
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
    details: `Осведомитель ${category} назначен на ход ${state.turnNumber + 1}`,
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
  _state: GameState,
  action: PlanetAction,
  _planet: Planet,
  report: PlanetReport,
): void {
  reject(report, action, "Уровни десятины изменяются через предложения Администратума");
}

function executePlanetAction(
  state: GameState,
  action: PlanetAction,
  report: PlanetReport,
  moraleUsedByPlayer: Set<number>,
): void {
  const planet = state.planets[action.payload.planetId];
  if (!planet) {
    reject(report, action, "Планета не найдена");
    return;
  }

  if (!state.players[action.playerId]) {
    reject(report, action, "Игрок не найден");
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

    default:
      reject(report, action, `Неподдерживаемый тип действия ${action.payload.kind}`);
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

  const moraleUsedByPlayer = new Set<number>();
  for (const action of orderedPlanetActions(actions)) {
    executePlanetAction(
      state,
      action,
      report,
      moraleUsedByPlayer,
    );
  }

  return report;
}

