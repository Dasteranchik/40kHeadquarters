import {
  computePopulationProduction,
  calculateTitheProgress,
  INFO_CATEGORIES,
  isInfoCategory,
  isPlanetTag,
  isPlanetWorldType,
  isResourceKey,
  isTitheLevel,
  PlanetTag,
  PlanetWorldType,
  RAW_OUTPUTS_BY_WORLD_TYPE,
  titheValue,
} from "../planetDomain";
import {
  Faction,
  Fleet,
  GameState,
  HexCoord,
  IntelFragmentMap,
  PendingPlanetInformantAction,
  PendingPlanetTitheChange,
  ArmyTransportRequest,
  Planet,
  Player,
  PlayerProductStorages,
  ResourceStore,
} from "../types";
import { defaultPlayerColor, isPlayerColor } from "../utils/playerColor";

const DEFAULT_FACTIONS: Array<{ id: string; name: string }> = [
  { id: "astra_militarum", name: "Астра Милитарум" },
  { id: "battle_fleet", name: "Боевой Флот" },
  { id: "fleet", name: "Флот" },
  { id: "pirates", name: "Пираты" },
  { id: "rogue_traders", name: "Вольные Торговцы" },
  { id: "ecclesiarchy", name: "Эклезиархия" },
  { id: "administratum", name: "Администратум" },
  { id: "navis_nobilite", name: "Навис Нобилите" },
  { id: "other_psykers", name: "другие псайкеры" },
  { id: "inquisition", name: "Инквизиция" },
  { id: "chaos", name: "Хаоситы" },
  { id: "mechanicus", name: "Механикус" },
  { id: "dark_mechanicus", name: "Тёмные Механикус" },
];

function intOrDefault(value: unknown, fallback: number, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.trunc(value));
}

function normalizeResourceStore(value: unknown, allowFraction = false): ResourceStore {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: ResourceStore = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isResourceKey(key)) {
      continue;
    }

    const amount = typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(0, allowFraction ? Math.round(raw * 100) / 100 : Math.trunc(raw))
      : 0;
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

function normalizePlayerProductStorages(value: unknown): PlayerProductStorages {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: PlayerProductStorages = {};
  for (const [playerId, store] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(playerId)) || Number(playerId) <= 0) {
      continue;
    }
    result[playerId] = normalizeResourceStore(store, true);
  }
  return result;
}

function normalizeIntelMap(value: unknown): IntelFragmentMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: IntelFragmentMap = {};
  for (const category of INFO_CATEGORIES) {
    const amount = intOrDefault((value as Record<string, unknown>)[category], 0, 0);
    if (amount > 0) {
      result[category] = amount;
    }
  }

  return result;
}

function normalizeTags(value: unknown): PlanetTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags = value.filter((entry): entry is PlanetTag => isPlanetTag(entry));
  return [...new Set(tags)];
}

function defaultWorldType(planet: Partial<Planet>): PlanetWorldType {
  if ((planet.worldType as string | undefined) === "DEATH_WORLD") {
    return "CEMETERY_WORLD";
  }
  if (isPlanetWorldType(planet.worldType)) {
    return planet.worldType;
  }

  const legacyProduction = intOrDefault(planet.resourceProduction, 0, 0);
  if (legacyProduction >= 8) {
    return "MINING_WORLD";
  }

  if (legacyProduction >= 6) {
    return "HIVE_WORLD";
  }

  return "AGRI_WORLD";
}

function defaultTagsByWorldType(worldType: PlanetWorldType): PlanetTag[] {
  switch (worldType) {
    case "AGRI_WORLD":
      return ["FOOD_PRODUCTION"];
    case "MINING_WORLD":
      return ["INDUSTRIAL_PRODUCTION"];
    case "HIVE_WORLD":
    case "FERAL_WORLD":
    case "FEUDAL_WORLD":
      return ["RECRUITMENT_CENTER"];
    default:
      return [];
  }
}

function normalizePosition(coord: unknown): HexCoord {
  if (!coord || typeof coord !== "object") {
    return { q: 0, r: 0 };
  }

  const candidate = coord as Partial<HexCoord>;
  return {
    q: intOrDefault(candidate.q, 0, 0),
    r: intOrDefault(candidate.r, 0, 0),
  };
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{2,32}$/.test(id);
}

function fallbackFactionNameById(factionId: string): string {
  return DEFAULT_FACTIONS.find((entry) => entry.id === factionId)?.name ?? factionId;
}

function normalizeFaction(factionId: string, value: unknown): Faction {
  const id = Number(factionId);
  if (!value || typeof value !== "object") {
    return {
      id,
      code: factionId,
      name: fallbackFactionNameById(factionId),
    };
  }

  const raw = value as Partial<Faction>;
  const normalizedName =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : fallbackFactionNameById(factionId);

  const normalizedDescription =
    typeof raw.description === "string" && raw.description.trim().length > 0
      ? raw.description.trim()
      : undefined;

  return {
    id: Number(id),
    code: typeof (raw as { code?: unknown }).code === "string"
      ? (raw as { code: string }).code
      : factionId,
    name: normalizedName,
    description: normalizedDescription,
  };
}

function defaultFactions(): Record<string, Faction> {
  const result: Record<string, Faction> = {};
  DEFAULT_FACTIONS.forEach((faction, index) => {
    const id = index + 1;
    result[id] = {
      id,
      code: faction.id,
      name: faction.name,
    };
  });
  return result;
}

function addMissingDefaultFactions(factions: Record<string, Faction>): void {
  for (const faction of DEFAULT_FACTIONS) {
    if (!Object.values(factions).some((entry) => entry.code === faction.id)) {
      const id = Math.max(0, ...Object.values(factions).map((entry) => entry.id)) + 1;
      factions[id] = {
        id,
        code: faction.id,
        name: faction.name,
      };
    }
  }
}

function normalizeFactions(value: unknown): Record<string, Faction> {
  if (!value || typeof value !== "object") {
    return defaultFactions();
  }

  const factions: Record<string, Faction> = {};
  for (const [factionId, factionValue] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(factionId)) || Number(factionId) <= 0) {
      continue;
    }

    factions[factionId] = normalizeFaction(factionId, factionValue);
  }

  if (Object.keys(factions).length === 0) {
    return defaultFactions();
  }

  addMissingDefaultFactions(factions);

  return factions;
}

function resolveDefaultFactionId(factions: Record<string, Faction>): string {
  const ids = Object.keys(factions).sort((a, b) => a.localeCompare(b));
  if (ids.length > 0) {
    return ids[0];
  }

  return String(Object.values(factions).sort((a, b) => a.id - b.id)[0].id);
}

function normalizePlayer(
  id: string,
  value: unknown,
  fallbackFactionId: string,
): Player {
  const player = (value ?? {}) as Partial<Player>;
  const name = typeof player.name === "string" && player.name.trim() ? player.name : id;
  const derivedAlignment = name.toLowerCase().includes("imperial")
    ? "IMPERIAL"
    : "NON_IMPERIAL";
  const rawFactionId = Number(player.factionId);

  return {
    id: Number(id),
    name,
    color: isPlayerColor(player.color) ? player.color.toLowerCase() : defaultPlayerColor(Number(id)),
    canTakePlanetResources: player.canTakePlanetResources === true,
    resources: intOrDefault(player.resources, 100, 0),
    alliances: Array.isArray(player.alliances)
      ? player.alliances.filter((entry) => Number.isInteger(Number(entry))).map(Number)
      : [],
    wars: Array.isArray(player.wars)
      ? player.wars.filter((entry) => Number.isInteger(Number(entry))).map(Number)
      : [],
    exploredTiles: Array.isArray(player.exploredTiles)
      ? player.exploredTiles.map((coord) => normalizePosition(coord))
      : [],
    alignment:
      player.alignment === "IMPERIAL" || player.alignment === "NON_IMPERIAL"
        ? player.alignment
        : derivedAlignment,
    factionId: Number.isInteger(rawFactionId) ? rawFactionId : Number(fallbackFactionId),
    intelFragments: normalizeIntelMap(player.intelFragments),
  };
}

function normalizePlanet(id: string, value: unknown, legacyProductOwnerId?: number): Planet {
  const planet = (value ?? {}) as Partial<Planet> & { productStorage?: unknown };
  const worldType = defaultWorldType(planet);
  const worldTags = normalizeTags(planet.worldTags);
  const population = intOrDefault(
    planet.population,
    intOrDefault(planet.resourceProduction, 6, 0) * 10,
    0,
  );
  const titheLevel = isTitheLevel(planet.titheLevel) ? planet.titheLevel : "DECUMA_PRIMA";
  const legacyGeneration: ResourceStore = {};
  for (const key of RAW_OUTPUTS_BY_WORLD_TYPE[worldType] ?? []) {
    legacyGeneration[key] = 1;
  }
  const resourceGeneration = planet.resourceGeneration
    ? normalizeResourceStore(planet.resourceGeneration)
    : legacyGeneration;
  for (const key of Object.keys(resourceGeneration)) {
    resourceGeneration[key as keyof ResourceStore] = 1;
  }
  const generatedResourceCount = Object.keys(resourceGeneration).length;
  const productStorageByPlayerId = normalizePlayerProductStorages(
    planet.productStorageByPlayerId,
  );
  if (
    Object.keys(productStorageByPlayerId).length === 0
    && legacyProductOwnerId
    && planet.productStorage
  ) {
    const legacyStore = normalizeResourceStore(planet.productStorage, true);
    if (Object.keys(legacyStore).length > 0) {
      productStorageByPlayerId[String(legacyProductOwnerId)] = legacyStore;
    }
  }

  return {
    id: Number(id),
    name: typeof planet.name === "string" && planet.name.trim()
      ? planet.name.trim()
      : `Planet ${id}`,
    position: normalizePosition(planet.position),
    worldType,
    worldTags: worldTags.length > 0 ? worldTags : defaultTagsByWorldType(worldType),
    population,
    morale: intOrDefault(planet.morale, 5, 0),
    titheLevel,
    maxTitheLevel: isTitheLevel(planet.maxTitheLevel) ? planet.maxTitheLevel : titheLevel,
    titheTarget: intOrDefault(planet.titheTarget, titheValue(titheLevel), 0),
    tithePaid: intOrDefault(planet.tithePaid, 0, 0),
    titheContributions: normalizeResourceStore(planet.titheContributions),
    resourceGeneration,
    resourceProduction: Math.round(
      computePopulationProduction(population) * generatedResourceCount * 100,
    ) / 100,
    influenceValue: intOrDefault(planet.influenceValue, 1, 0),
    visionRange: intOrDefault(planet.visionRange, 1, 0),
    overviewRange: intOrDefault(planet.overviewRange, intOrDefault(planet.visionRange, 1, 0), 0),
    rawStock: normalizeResourceStore(planet.rawStock, true),
    productStorageByPlayerId,
    infoFragments: normalizeIntelMap(planet.infoFragments),
  };
}

function normalizeFleet(id: string, value: unknown): Fleet {
  const fleet = (value ?? {}) as Partial<Fleet>;

  return {
    id: Number(id),
    ownerPlayerId: Number(fleet.ownerPlayerId),
    position: normalizePosition(fleet.position),
    combatPower: intOrDefault(fleet.combatPower, 10, 0),
    health: intOrDefault(fleet.health, 100, 1),
    influence: intOrDefault(fleet.influence, 5, 0),
    actionPoints: intOrDefault(fleet.actionPoints, 3, 0),
    visionRange: intOrDefault(fleet.visionRange, 2, 0),
    shareVisionWithAllies: fleet.shareVisionWithAllies === true,
    capacity: intOrDefault(fleet.capacity, 10, 0),
    stance: fleet.stance === "DEFENSE" ? "DEFENSE" : "ATTACK",
    domain: fleet.domain === "GROUND" ? "GROUND" : "SPACE",
    inventory: normalizeResourceStore(fleet.inventory),
    ...(typeof fleet.carrierFleetId === "string" && fleet.carrierFleetId
      ? { carrierFleetId: fleet.carrierFleetId }
      : {}),
  };
}

function normalizeArmyTransportRequests(value: unknown): ArmyTransportRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ArmyTransportRequest[] => {
    if (!entry || typeof entry !== "object") return [];
    const request = entry as Partial<ArmyTransportRequest>;
    if (typeof request.id !== "string" || typeof request.armyId !== "string" ||
        typeof request.fleetId !== "string" || typeof request.requestedByPlayerId !== "string") return [];
    return [{
      id: request.id,
      armyId: request.armyId,
      fleetId: request.fleetId,
      requestedByPlayerId: request.requestedByPlayerId,
      requestedOnTurn: intOrDefault(request.requestedOnTurn, 1, 1),
    }];
  });
}

function normalizePendingTitheChanges(value: unknown): PendingPlanetTitheChange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: PendingPlanetTitheChange[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Partial<PendingPlanetTitheChange>;
    if (
      typeof candidate.planetId !== "string" ||
      typeof candidate.requestedByPlayerId !== "string" ||
      !isTitheLevel(candidate.titheLevel)
    ) {
      continue;
    }

    result.push({
      planetId: candidate.planetId,
      requestedByPlayerId: candidate.requestedByPlayerId,
      titheLevel: candidate.titheLevel,
      applyOnTurn: intOrDefault(candidate.applyOnTurn, 1, 1),
    });
  }

  return result;
}

function normalizePendingInformants(value: unknown): PendingPlanetInformantAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: PendingPlanetInformantAction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Partial<PendingPlanetInformantAction>;
    if (
      typeof candidate.planetId !== "string" ||
      typeof candidate.playerId !== "string" ||
      !isInfoCategory(candidate.infoCategory)
    ) {
      continue;
    }

    result.push({
      planetId: candidate.planetId,
      playerId: candidate.playerId,
      infoCategory: candidate.infoCategory,
      applyOnTurn: intOrDefault(candidate.applyOnTurn, 1, 1),
    });
  }

  return result;
}

function syncPlanetTileLinks(state: GameState): void {
  for (const tile of state.map.tiles) {
    if (tile.planetId && !state.planets[tile.planetId]) {
      delete tile.planetId;
    }
  }

  for (const planet of Object.values(state.planets)) {
    const tile = state.map.tiles.find(
      (entry) => entry.q === planet.position.q && entry.r === planet.position.r,
    );
    if (tile) {
      tile.planetId = planet.id;
    }
  }
}

function pruneRelations(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.alliances = player.alliances.filter((otherId) => Boolean(state.players[otherId]));
    player.wars = player.wars.filter((otherId) => Boolean(state.players[otherId]));
  }
}

export function normalizeGameState(state: GameState): GameState {
  delete (state as GameState & { titheRules?: unknown }).titheRules;
  const normalizedFactions = normalizeFactions((state as Partial<GameState>).factions);
  const fallbackFactionId = resolveDefaultFactionId(normalizedFactions);

  const normalizedPlayers: Record<string, Player> = {};
  for (const [playerId, value] of Object.entries(state.players ?? {})) {
    const player = normalizePlayer(playerId, value, fallbackFactionId);
    if (!normalizedFactions[player.factionId]) {
      player.factionId = Number(fallbackFactionId);
    }

    normalizedPlayers[playerId] = player;
  }

  const normalizedPlanets: Record<string, Planet> = {};
  const legacyProductOwnerId = Object.values(normalizedPlayers)
    .map((player) => player.id)
    .sort((a, b) => a - b)[0];
  for (const [planetId, value] of Object.entries(state.planets ?? {})) {
    normalizedPlanets[planetId] = normalizePlanet(planetId, value, legacyProductOwnerId);
  }

  const normalizedFleets: Record<string, Fleet> = {};
  for (const [fleetId, value] of Object.entries(state.fleets ?? {})) {
    const fleet = normalizeFleet(fleetId, value);
    if (!normalizedPlayers[fleet.ownerPlayerId]) {
      continue;
    }

    normalizedFleets[fleetId] = fleet;
  }

  state.factions = normalizedFactions;
  state.players = normalizedPlayers;
  state.planets = normalizedPlanets;
  state.fleets = normalizedFleets;
  state.nextIds = {
    player: intOrDefault(state.nextIds?.player, 1, 1),
    faction: Math.max(intOrDefault(state.nextIds?.faction, 1, 1), ...Object.values(state.factions).map((entry) => entry.id + 1)),
    planet: intOrDefault(state.nextIds?.planet, 1, 1),
    unit: intOrDefault(state.nextIds?.unit, 1, 1),
    event: intOrDefault(state.nextIds?.event, 1, 1),
  };
  state.events = Array.isArray((state as Partial<GameState>).events)
    ? (state as Partial<GameState>).events!.filter((event) =>
        event &&
        Number.isInteger(event.id) &&
        Number.isInteger(event.turnNumber) &&
        typeof event.message === "string" &&
        Array.isArray(event.playerIds)
      ).map((event) => ({
        ...event,
        playerIds: event.playerIds.filter((id) => Number.isInteger(Number(id))).map(Number),
      }))
    : [];
  state.nextIds.event = Math.max(
    state.nextIds.event,
    ...state.events.map((event) => event.id + 1),
  );
  for (const planet of Object.values(state.planets)) {
    const progress = calculateTitheProgress(
      planet.maxTitheLevel,
      planet.titheContributions,
    );
    planet.titheLevel = progress.currentLevel;
    planet.tithePaid = progress.paid;
    planet.titheTarget = progress.target;
  }
  // Tithe is now configured directly by the administrator; legacy scheduled
  // faction changes must not overwrite the derived current level.
  state.pendingTitheChanges = [];
  state.pendingInformantActions = normalizePendingInformants(state.pendingInformantActions);
  state.pendingArmyTransportRequests = normalizeArmyTransportRequests(
    (state as Partial<GameState>).pendingArmyTransportRequests,
  ).filter((request) => {
    const army = state.fleets[request.armyId];
    const fleet = state.fleets[request.fleetId];
    return army?.domain === "GROUND" && fleet?.domain === "SPACE" && army.carrierFleetId !== fleet.id;
  });

  for (const army of Object.values(state.fleets)) {
    if (army.domain !== "GROUND" || !army.carrierFleetId) continue;
    const carrier = state.fleets[army.carrierFleetId];
    if (!carrier || carrier.domain !== "SPACE") {
      delete army.carrierFleetId;
      continue;
    }
    army.position = { ...carrier.position };
  }

  pruneRelations(state);
  syncPlanetTileLinks(state);

  return state;
}
