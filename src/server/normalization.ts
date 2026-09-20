import {
  computePopulationProduction,
  calculateTitheProgress,
  DEFAULT_PRODUCT_CONVERSION_RATES,
  INFO_CATEGORIES,
  isInfoCategory,
  isPlanetTag,
  isPlanetWorldType,
  isResourceKey,
  isTitheLevel,
  PlanetTag,
  PlanetWorldType,
  PRODUCT_RECIPES,
  PRODUCT_RESOURCE_KEYS,
  RAW_OUTPUTS_BY_WORLD_TYPE,
  roundConversionRate,
  titheValue,
} from "../planetDomain";
import type { ProductConversionRates } from "../planetDomain";
import {
  createEmptyItemInventory,
  isKnowledgeCode,
  type ArtifactInstance,
  type InventoryLocation,
  type ItemInventory,
  type JsonValue,
  type PlayerItemInventories,
} from "../itemDomain";
import {
  createEmptyShop,
  type DisappearingItemRef,
  type Shop,
} from "../shopDomain";
import { DEFAULT_TURN_DURATION_MS, type TurnTimerState } from "../turnTimerDomain";
import { isUnitTag, type UnitTag } from "../unitDomain";
import {
  isStationCapability,
  type Anomaly,
  type Shipwreck,
  type Station,
  type StationCapability,
} from "../worldObjectDomain";
import {
  detectionObjectKey,
  type DetectionRecord,
  type DetectionState,
} from "../detectionDomain";
import type { AuditEntry } from "../auditDomain";
import type { ProcessedCommand } from "../commandDomain";
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
import { normalizeWarpVisibility } from "../navigationDomain";
import type { SecretStorage } from "../secretStorageDomain";
import { secretStorageAllowsArtifact, validateAllowedTypeKeys } from "../secretStorageDomain";
import type { UnitVariant } from "../unitVariantDomain";

const DEFAULT_FACTIONS: Array<{ id: string; name: string }> = [
  { id: "astra_militarum", name: "Астра Милитарум" },
  { id: "battle_fleet", name: "Боевой Флот" },
  { id: "fleet", name: "Флот" },
  { id: "pirates", name: "Пираты" },
  { id: "rogue_traders", name: "Вольные Торговцы" },
  { id: "ecclesiarchy", name: "Эклезиархия" },
  { id: "administratum", name: "Администратум" },
  { id: "navis_nobilite", name: "Навигаторы" },
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

function normalizeItemInventory(value: unknown): ItemInventory {
  if (!value || typeof value !== "object") {
    return createEmptyItemInventory();
  }
  const candidate = value as Partial<ItemInventory>;
  const artifactIds = Array.isArray(candidate.artifactIds)
    ? candidate.artifactIds.filter((entry): entry is string =>
        typeof entry === "string" && entry.length > 0,
      )
    : [];
  const knowledge = Array.isArray(candidate.knowledge)
    ? candidate.knowledge.filter(isKnowledgeCode)
    : [];
  return {
    artifactIds: [...new Set(artifactIds)],
    knowledge: [...new Set(knowledge)],
  };
}

function normalizePlayerItemInventories(value: unknown): PlayerItemInventories {
  if (!value || typeof value !== "object") return {};
  const result: PlayerItemInventories = {};
  for (const [playerId, inventory] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(playerId)) || Number(playerId) <= 0) continue;
    result[playerId] = normalizeItemInventory(inventory);
  }
  return result;
}

function normalizeDisappearingItems(value: unknown): DisappearingItemRef[] {
  if (!Array.isArray(value)) return [];
  const result: DisappearingItemRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { kind?: unknown; code?: unknown };
    if (candidate.kind === "RESOURCE" && isResourceKey(candidate.code)) {
      result.push({ kind: "RESOURCE", code: candidate.code });
    } else if (
      candidate.kind === "ARTIFACT_DEFINITION"
      && typeof candidate.code === "string"
      && candidate.code.length > 0
    ) {
      result.push({ kind: "ARTIFACT_DEFINITION", code: candidate.code });
    } else if (candidate.kind === "KNOWLEDGE" && isKnowledgeCode(candidate.code)) {
      result.push({ kind: "KNOWLEDGE", code: candidate.code });
    }
  }
  const seen = new Set<string>();
  return result.filter((entry) => {
    const key = `${entry.kind}:${entry.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeShop(value: unknown): Shop {
  if (!value || typeof value !== "object") return createEmptyShop();
  const candidate = value as Partial<Shop>;
  return {
    resources: normalizeResourceStore(candidate.resources, true),
    items: normalizeItemInventory(candidate.items),
    disappearingItems: normalizeDisappearingItems(candidate.disappearingItems),
  };
}

function normalizeUnitTags(value: unknown): UnitTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isUnitTag))];
}

function normalizeProductConversionRates(
  value: unknown,
  legacyValue: unknown,
): ProductConversionRates {
  const source = value && typeof value === "object"
    ? value as Partial<Record<string, unknown>>
    : {};
  const legacySource = legacyValue && typeof legacyValue === "object"
    ? legacyValue as Partial<Record<string, unknown>>
    : {};

  return Object.fromEntries(
    PRODUCT_RESOURCE_KEYS.map((key) => {
      const directRate = source[key];
      const legacyRate = legacySource[PRODUCT_RECIPES[key].input];
      const rate = directRate ?? legacyRate;
      const roundedRate = typeof rate === "number" && Number.isFinite(rate)
        ? roundConversionRate(rate)
        : 0;
      return [
        key,
        roundedRate > 0
          ? roundedRate
          : DEFAULT_PRODUCT_CONVERSION_RATES[key],
      ];
    }),
  ) as ProductConversionRates;
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
      isChaos: false,
      isAdministratum: false,
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
    isChaos: raw.isChaos === true,
    isAdministratum: raw.isAdministratum === true,
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
      isChaos: false,
      isAdministratum: false,
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
        isChaos: false,
        isAdministratum: false,
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
    manualNavigator: player.manualNavigator === true,
  };
}

function normalizeSecretStorage(value: unknown): SecretStorage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<SecretStorage>;
  const allowedTypeKeys = validateAllowedTypeKeys(candidate.allowedTypeKeys);
  const verifier = candidate.passwordVerifier;
  if (
    !allowedTypeKeys
    || !verifier
    || verifier.algorithm !== "SCRYPT"
    || typeof verifier.salt !== "string"
    || typeof verifier.digest !== "string"
    || verifier.salt.length === 0
    || verifier.digest.length === 0
  ) return undefined;
  const stackableInventory = normalizeResourceStore(candidate.stackableInventory, true);
  for (const key of Object.keys(stackableInventory)) {
    if (!allowedTypeKeys.includes(key as never)) delete stackableInventory[key as keyof typeof stackableInventory];
  }
  const itemInventory = normalizeItemInventory(candidate.itemInventory);
  itemInventory.knowledge = itemInventory.knowledge.filter((code) =>
    allowedTypeKeys.includes(`KNOWLEDGE:${code}`),
  );
  return {
    enabled: candidate.enabled === true,
    passwordVerifier: { ...verifier },
    allowedTypeKeys,
    stackableInventory,
    itemInventory,
  };
}

function normalizePlanet(id: string, value: unknown, legacyProductOwnerId?: number): Planet {
  const planet = (value ?? {}) as Partial<Planet> & { productStorage?: unknown };
  const secretStorage = normalizeSecretStorage(planet.secretStorage);
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
    rawStock: normalizeResourceStore(planet.rawStock, true),
    productStorageByPlayerId,
    itemStorageByPlayerId: normalizePlayerItemInventories(planet.itemStorageByPlayerId),
    shop: normalizeShop(planet.shop),
    infoFragments: normalizeIntelMap(planet.infoFragments),
    ...(secretStorage ? { secretStorage } : {}),
  };
}

function normalizeFleet(id: string, value: unknown): Fleet {
  const fleet = (value ?? {}) as Partial<Fleet>;
  const legacyActionPoints = (fleet as Partial<Fleet> & { actionPoints?: unknown }).actionPoints;
  const movementPoints = intOrDefault(
    fleet.movementPoints ?? legacyActionPoints,
    fleet.domain === "GROUND" ? 0 : 3,
    0,
  );
  const maxMovementPoints = Math.max(
    movementPoints,
    intOrDefault(fleet.maxMovementPoints, movementPoints, 0),
  );

  return {
    id: Number(id),
    ownerPlayerId: Number(fleet.ownerPlayerId),
    position: normalizePosition(fleet.position),
    combatPower: intOrDefault(fleet.combatPower, 10, 0),
    health: intOrDefault(fleet.health, 100, 1),
    influence: intOrDefault(fleet.influence, 5, 0),
    movementPoints,
    maxMovementPoints,
    isNavigator: fleet.isNavigator === true,
    warpVisibility: normalizeWarpVisibility(
      fleet.warpVisibility !== undefined ? fleet.warpVisibility : (
        typeof (fleet as Partial<Fleet> & { navigatorRange?: unknown }).navigatorRange === "number"
          ? Math.min(3, Math.max(0, Math.trunc((fleet as Partial<Fleet> & { navigatorRange: number }).navigatorRange)))
          : null
      ),
    ),
    visionRange: intOrDefault(fleet.visionRange, 2, 0),
    shareVisionWithAllies: fleet.shareVisionWithAllies === true,
    capacity: intOrDefault(fleet.capacity, 10, 0),
    stance: fleet.stance === "DEFENSE" ? "DEFENSE" : "ATTACK",
    domain: fleet.domain === "GROUND" ? "GROUND" : "SPACE",
    inventory: normalizeResourceStore(fleet.inventory),
    itemInventory: normalizeItemInventory(fleet.itemInventory),
    tags: normalizeUnitTags(fleet.tags),
    ...(Number.isInteger(Number(fleet.carrierFleetId)) && Number(fleet.carrierFleetId) > 0
      ? { carrierFleetId: Number(fleet.carrierFleetId) }
      : {}),
    ...(Number.isInteger(Number(fleet.unitVariantId)) && Number(fleet.unitVariantId) > 0
      ? { unitVariantId: Number(fleet.unitVariantId) }
      : {}),
  };
}

function normalizeSystemSettings(value: unknown): GameState["systemSettings"] {
  const candidate = value && typeof value === "object"
    ? value as Partial<GameState["systemSettings"]>
    : {};
  return {
    baseFleetMovementPoints: intOrDefault(candidate.baseFleetMovementPoints, 1, 1),
  };
}

function normalizeWarpDisturbance(state: GameState): void {
  for (const tile of state.map.tiles) {
    tile.warpDisturbanceLevel = Math.min(
      6,
      Math.max(1, intOrDefault(tile.warpDisturbanceLevel, 1, 1)),
    );
  }
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

function normalizeStation(id: string, value: unknown): Station {
  const station = (value ?? {}) as Partial<Station>;
  const secretStorage = normalizeSecretStorage(station.secretStorage);
  const capabilities = Array.isArray(station.capabilities)
    ? [...new Set(station.capabilities.filter(isStationCapability))]
    : [];
  return {
    id: Number(id),
    name: typeof station.name === "string" && station.name.trim()
      ? station.name.trim()
      : `Station ${id}`,
    position: normalizePosition(station.position),
    capabilities,
    tags: capabilities.includes("TAGS") ? normalizeUnitTags(station.tags) : [],
    resourceGeneration: normalizeResourceStore(station.resourceGeneration, true),
    rawStock: normalizeResourceStore(station.rawStock, true),
    productStorageByPlayerId: normalizePlayerProductStorages(
      station.productStorageByPlayerId,
    ),
    itemStorageByPlayerId: normalizePlayerItemInventories(station.itemStorageByPlayerId),
    shop: normalizeShop(station.shop),
    infoFragments: normalizeIntelMap(station.infoFragments),
    ownerFactionId: Number.isInteger(Number(station.ownerFactionId)) && Number(station.ownerFactionId) > 0
      ? Number(station.ownerFactionId)
      : null,
    warpVisibility: normalizeWarpVisibility(station.warpVisibility),
    ...(secretStorage ? { secretStorage } : {}),
    fleetCombatPower: intOrDefault(station.fleetCombatPower, 0, 0),
    armyCombatPower: intOrDefault(station.armyCombatPower, 0, 0),
  };
}

function normalizeStations(value: unknown): Record<string, Station> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, Station> = {};
  for (const [id, station] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) continue;
    result[id] = normalizeStation(id, station);
  }
  return result;
}

function normalizeShipwrecks(value: unknown): Record<string, Shipwreck> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, Shipwreck> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0 || !raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as Partial<Shipwreck>;
    result[id] = {
      id: Number(id),
      position: normalizePosition(candidate.position),
      inventory: normalizeItemInventory(candidate.inventory),
      createdOnTurn: intOrDefault(candidate.createdOnTurn, 1, 1),
      sourceUnitIds: Array.isArray(candidate.sourceUnitIds)
        ? [...new Set(candidate.sourceUnitIds.filter((entry): entry is number =>
            Number.isInteger(entry) && entry > 0,
          ))]
        : [],
    };
  }
  return result;
}

function normalizeAnomalies(value: unknown): Record<string, Anomaly> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, Anomaly> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0 || !raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as Partial<Anomaly>;
    result[id] = {
      id: Number(id),
      position: normalizePosition(candidate.position),
      tags: normalizeUnitTags(candidate.tags),
      informationRef: typeof candidate.informationRef === "string"
        ? candidate.informationRef
        : "",
    };
  }
  return result;
}

function normalizeInventoryLocation(value: unknown): InventoryLocation | null {
  if (!value || typeof value !== "object") return null;
  const location = value as Record<string, unknown>;
  switch (location.kind) {
    case "FLEET":
      return Number.isInteger(location.fleetId) && Number(location.fleetId) > 0
        ? { kind: "FLEET", fleetId: Number(location.fleetId) }
        : null;
    case "PLANET_STORAGE":
      return Number.isInteger(location.planetId) && Number.isInteger(location.playerId)
        ? { kind: "PLANET_STORAGE", planetId: Number(location.planetId), playerId: Number(location.playerId) }
        : null;
    case "PLANET_SHOP":
      return Number.isInteger(location.planetId)
        ? { kind: "PLANET_SHOP", planetId: Number(location.planetId) }
        : null;
    case "STATION_STORAGE":
      return Number.isInteger(location.stationId) && Number.isInteger(location.playerId)
        ? { kind: "STATION_STORAGE", stationId: Number(location.stationId), playerId: Number(location.playerId) }
        : null;
    case "STATION_SHOP":
      return Number.isInteger(location.stationId)
        ? { kind: "STATION_SHOP", stationId: Number(location.stationId) }
        : null;
    case "PLANET_SECRET":
      return Number.isInteger(location.planetId)
        ? { kind: "PLANET_SECRET", planetId: Number(location.planetId) }
        : null;
    case "STATION_SECRET":
      return Number.isInteger(location.stationId)
        ? { kind: "STATION_SECRET", stationId: Number(location.stationId) }
        : null;
    case "SHIPWRECK":
      return Number.isInteger(location.shipwreckId)
        ? { kind: "SHIPWRECK", shipwreckId: Number(location.shipwreckId) }
        : null;
    default:
      return null;
  }
}

function normalizeJsonRecord(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>;
  } catch {
    return {};
  }
}

function normalizeArtifacts(
  value: unknown,
  players: GameState["players"],
): Record<string, ArtifactInstance> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, ArtifactInstance> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!id || !raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<ArtifactInstance>;
    const owner = normalizeInventoryLocation(candidate.owner);
    if (!owner) continue;
    const passiveEffect = candidate.passiveEffect
      && typeof candidate.passiveEffect.effectCode === "string"
      ? {
          effectCode: candidate.passiveEffect.effectCode,
          params: normalizeJsonRecord(candidate.passiveEffect.params),
        }
      : undefined;
    const useEffect = candidate.useEffect
      && typeof candidate.useEffect.effectCode === "string"
      ? {
          effectCode: candidate.useEffect.effectCode,
          params: normalizeJsonRecord(candidate.useEffect.params),
        }
      : undefined;
    const legacyOriginPlayerId = candidate.configuration?.navigatorOriginPlayerId;
    const originCandidate = candidate.navigatorOriginPlayerId !== undefined
      ? candidate.navigatorOriginPlayerId
      : legacyOriginPlayerId;
    const navigatorOriginPlayerId = typeof originCandidate === "number"
      && Number.isInteger(originCandidate)
      && originCandidate > 0
      && Boolean(players[originCandidate])
      ? originCandidate
      : undefined;
    result[id] = {
      id,
      definitionCode: typeof candidate.definitionCode === "string" && candidate.definitionCode
        ? candidate.definitionCode
        : id,
      name: typeof candidate.name === "string" && candidate.name ? candidate.name : id,
      owner,
      configuration: normalizeJsonRecord(candidate.configuration),
      isNavigator: candidate.isNavigator === true,
      warpVisibility: normalizeWarpVisibility(
        candidate.warpVisibility !== undefined
          ? candidate.warpVisibility
          : candidate.configuration?.navigatorRange,
      ),
      ...(navigatorOriginPlayerId !== undefined ? { navigatorOriginPlayerId } : {}),
      ...(passiveEffect ? { passiveEffect } : {}),
      ...(useEffect ? { useEffect } : {}),
      ...(Number.isInteger(candidate.cooldownTurns) && Number(candidate.cooldownTurns) >= 0
        ? { cooldownTurns: Number(candidate.cooldownTurns) }
        : {}),
      ...(Number.isInteger(candidate.cooldownUntilTurn) && Number(candidate.cooldownUntilTurn) >= 0
        ? { cooldownUntilTurn: Number(candidate.cooldownUntilTurn) }
        : {}),
      consumable: candidate.consumable === true,
    };
  }
  return result;
}

function normalizeUnitVariants(value: unknown): Record<string, UnitVariant> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, UnitVariant> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0 || !raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<UnitVariant>;
    if (typeof candidate.name !== "string" || !candidate.name.trim()) continue;
    if (candidate.domain !== "SPACE" && candidate.domain !== "GROUND") continue;
    const description = typeof candidate.description === "string" && candidate.description.trim()
      ? candidate.description.trim()
      : undefined;
    result[id] = {
      id: Number(id),
      name: candidate.name.trim(),
      domain: candidate.domain,
      ...(description ? { description } : {}),
    };
  }
  return result;
}

function normalizeAdministratumWorldReports(value: unknown, state: GameState): GameState["administratumWorldReports"] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Partial<GameState["administratumWorldReports"][number]>;
    const planetId = Number(entry.planetId);
    if (!Number.isInteger(planetId) || !state.planets[planetId] || seen.has(planetId)) return [];
    seen.add(planetId);
    return [{
      planetId,
      reportedAtTurn: intOrDefault(entry.reportedAtTurn, 1, 1),
      sequence: intOrDefault(entry.sequence, seen.size, 1),
    }];
  }).sort((a, b) => a.sequence - b.sequence);
}

function normalizeAdministratumTitheProposals(value: unknown, state: GameState): GameState["administratumTitheProposals"] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, GameState["administratumTitheProposals"][number]>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<GameState["administratumTitheProposals"][number]>;
    const planetId = Number(entry.planetId);
    const playerId = Number(entry.playerId);
    if (!state.planets[planetId] || !state.players[playerId] || !isTitheLevel(entry.titheLevel)) continue;
    const requestedOnTurn = intOrDefault(entry.requestedOnTurn, state.turnNumber, 1);
    result.set(`${playerId}:${planetId}:${requestedOnTurn}`, {
      planetId,
      playerId,
      requestedOnTurn,
      titheLevel: entry.titheLevel,
    });
  }
  return [...result.values()];
}

function normalizeDetectionState(value: unknown): DetectionState {
  const result: DetectionState = { recordsByPlayerId: {} };
  if (!value || typeof value !== "object") return result;
  const source = (value as Partial<DetectionState>).recordsByPlayerId;
  if (!source || typeof source !== "object") return result;
  const validKinds = new Set(["PLANET", "FLEET", "STATION", "SHIPWRECK", "ANOMALY"]);
  for (const [playerId, rawRecords] of Object.entries(source)) {
    if (!Number.isInteger(Number(playerId)) || !rawRecords || typeof rawRecords !== "object") continue;
    const records: Record<string, DetectionRecord> = {};
    for (const raw of Object.values(rawRecords as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const candidate = raw as Partial<DetectionRecord>;
      if (
        !validKinds.has(String(candidate.objectKind))
        || !Number.isInteger(candidate.objectId)
        || !Number.isInteger(candidate.detectedByUnitId)
      ) continue;
      const record: DetectionRecord = {
        playerId: Number(playerId),
        detectedByUnitId: Number(candidate.detectedByUnitId),
        objectKind: candidate.objectKind as DetectionRecord["objectKind"],
        objectId: Number(candidate.objectId),
        detectedAtTurn: intOrDefault(candidate.detectedAtTurn, 1, 1),
        confidence: candidate.confidence === "EXACT" ? "EXACT" : "ESTIMATED",
      };
      records[detectionObjectKey(record.objectKind, record.objectId)] = record;
    }
    result.recordsByPlayerId[playerId] = records;
  }
  return result;
}

function normalizeAudit(value: unknown): AuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is AuditEntry => Boolean(
    entry && typeof entry === "object" && Number.isInteger((entry as AuditEntry).id),
  )).slice(-5000);
}

function normalizeProcessedCommands(value: unknown): ProcessedCommand[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ProcessedCommand => Boolean(
    entry
    && typeof entry === "object"
    && typeof (entry as ProcessedCommand).key === "string"
    && Number.isFinite((entry as ProcessedCommand).processedAt),
  )).slice(-1000);
}

function normalizeTurnTimer(value: unknown, now = Date.now()): TurnTimerState {
  const candidate = value && typeof value === "object"
    ? value as Partial<TurnTimerState>
    : {};
  const durationMs = intOrDefault(candidate.durationMs, DEFAULT_TURN_DURATION_MS, 1);
  const turnStartedAt = intOrDefault(candidate.turnStartedAt, now, 0);
  const fallbackEnd = turnStartedAt + durationMs;
  const turnEndsAt = intOrDefault(candidate.turnEndsAt, fallbackEnd, 0);
  return { durationMs, turnStartedAt, turnEndsAt };
}

function syncPlanetTileLinks(state: GameState): void {
  for (const tile of state.map.tiles) {
    delete tile.planetId;
  }

  for (const planet of Object.values(state.planets).sort((a, b) => a.id - b.id)) {
    const tile = state.map.tiles.find(
      (entry) => entry.q === planet.position.q && entry.r === planet.position.r,
    );
    if (tile && tile.planetId === undefined) {
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

function resolveItemInventory(
  state: GameState,
  location: InventoryLocation,
): ItemInventory | null {
  switch (location.kind) {
    case "FLEET":
      return state.fleets[location.fleetId]?.itemInventory ?? null;
    case "PLANET_STORAGE": {
      const planet = state.planets[location.planetId];
      if (!planet || !state.players[location.playerId]) return null;
      return planet.itemStorageByPlayerId[String(location.playerId)] ??=
        createEmptyItemInventory();
    }
    case "PLANET_SHOP":
      return state.planets[location.planetId]?.shop.items ?? null;
    case "STATION_STORAGE": {
      const station = state.stations[location.stationId];
      if (!station || !station.capabilities.includes("PLAYER_STORAGE") || !state.players[location.playerId]) {
        return null;
      }
      return station.itemStorageByPlayerId[String(location.playerId)] ??=
        createEmptyItemInventory();
    }
    case "STATION_SHOP": {
      const station = state.stations[location.stationId];
      return station?.capabilities.includes("SHOP") ? station.shop.items : null;
    }
    case "PLANET_SECRET":
      return state.planets[location.planetId]?.secretStorage?.itemInventory ?? null;
    case "STATION_SECRET":
      return state.stations[location.stationId]?.secretStorage?.itemInventory ?? null;
    case "SHIPWRECK":
      return state.shipwrecks[location.shipwreckId]?.inventory ?? null;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

function reconcileArtifactOwnership(state: GameState): void {
  const inventories: ItemInventory[] = [];
  for (const fleet of Object.values(state.fleets)) inventories.push(fleet.itemInventory);
  for (const planet of Object.values(state.planets)) {
    inventories.push(planet.shop.items, ...Object.values(planet.itemStorageByPlayerId));
    if (planet.secretStorage) inventories.push(planet.secretStorage.itemInventory);
  }
  for (const station of Object.values(state.stations)) {
    inventories.push(station.shop.items, ...Object.values(station.itemStorageByPlayerId));
    if (station.secretStorage) inventories.push(station.secretStorage.itemInventory);
  }
  for (const shipwreck of Object.values(state.shipwrecks)) inventories.push(shipwreck.inventory);
  for (const inventory of inventories) inventory.artifactIds = [];

  for (const [artifactId, artifact] of Object.entries(state.artifacts)) {
    if (artifact.owner.kind === "PLANET_SECRET") {
      const storage = state.planets[artifact.owner.planetId]?.secretStorage;
      if (!storage || !secretStorageAllowsArtifact(storage, artifact.definitionCode)) {
        delete state.artifacts[artifactId];
        continue;
      }
    }
    if (artifact.owner.kind === "STATION_SECRET") {
      const storage = state.stations[artifact.owner.stationId]?.secretStorage;
      if (!storage || !secretStorageAllowsArtifact(storage, artifact.definitionCode)) {
        delete state.artifacts[artifactId];
        continue;
      }
    }
    const inventory = resolveItemInventory(state, artifact.owner);
    if (!inventory) {
      delete state.artifacts[artifactId];
      continue;
    }
    inventory.artifactIds.push(artifactId);
  }
}

export function normalizeGameState(state: GameState): GameState {
  delete (state as GameState & { titheRules?: unknown }).titheRules;
  const rawFactions = (state as Partial<GameState>).factions;
  const legacyNavigatorFactionIds = new Set<number>();
  if (rawFactions && typeof rawFactions === "object") {
    for (const [id, raw] of Object.entries(rawFactions)) {
      if (raw && typeof raw === "object" && (raw as { isNavigator?: unknown }).isNavigator === true) {
        legacyNavigatorFactionIds.add(Number(id));
      }
    }
  }
  const normalizedFactions = normalizeFactions(rawFactions);
  state.systemSettings = normalizeSystemSettings((state as Partial<GameState>).systemSettings);
  normalizeWarpDisturbance(state);
  const fallbackFactionId = resolveDefaultFactionId(normalizedFactions);

  const normalizedPlayers: Record<string, Player> = {};
  for (const [playerId, value] of Object.entries(state.players ?? {})) {
    const player = normalizePlayer(playerId, value, fallbackFactionId);
    if (!normalizedFactions[player.factionId]) {
      player.factionId = Number(fallbackFactionId);
    }
    if (legacyNavigatorFactionIds.has(player.factionId)) player.manualNavigator = true;

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
    const legacyNavigatorRange = (value as Partial<Fleet> & { navigatorRange?: unknown })
      ?.navigatorRange;
    if (
      !fleet.isNavigator
      && legacyNavigatorFactionIds.has(normalizedPlayers[fleet.ownerPlayerId].factionId)
      && typeof legacyNavigatorRange === "number"
      && Number.isFinite(legacyNavigatorRange)
      && legacyNavigatorRange > 0
    ) {
      // In legacy snapshots the Faction flag and a positive fleet range formed
      // one navigation source. Preserve that source while moving permission to
      // Player.manualNavigator and source capability to Fleet.isNavigator.
      fleet.isNavigator = true;
    }
    if (fleet.domain === "SPACE") {
      fleet.maxMovementPoints = Math.max(
        state.systemSettings.baseFleetMovementPoints,
        fleet.maxMovementPoints,
      );
      fleet.movementPoints = Math.min(fleet.movementPoints, fleet.maxMovementPoints);
    }

    normalizedFleets[fleetId] = fleet;
  }

  state.factions = normalizedFactions;
  const stateWithLegacyRates = state as Partial<GameState> & {
    resourceConversionRates?: unknown;
  };
  state.productConversionRates = normalizeProductConversionRates(
    stateWithLegacyRates.productConversionRates,
    stateWithLegacyRates.resourceConversionRates,
  );
  delete stateWithLegacyRates.resourceConversionRates;
  state.players = normalizedPlayers;
  state.planets = normalizedPlanets;
  state.fleets = normalizedFleets;
  const partialState = state as Partial<GameState>;
  state.stations = normalizeStations(partialState.stations);
  for (const station of Object.values(state.stations)) {
    if (station.ownerFactionId !== null && !state.factions[station.ownerFactionId]) {
      station.ownerFactionId = null;
    }
  }
  state.shipwrecks = normalizeShipwrecks(partialState.shipwrecks);
  state.anomalies = normalizeAnomalies(partialState.anomalies);
  state.artifacts = normalizeArtifacts(partialState.artifacts, state.players);
  state.unitVariants = normalizeUnitVariants(partialState.unitVariants);
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.unitVariantId === undefined) continue;
    const variant = state.unitVariants[fleet.unitVariantId];
    if (!variant || variant.domain !== fleet.domain) delete fleet.unitVariantId;
  }
  state.audit = normalizeAudit(partialState.audit);
  state.detection = normalizeDetectionState(partialState.detection);
  state.processedCommands = normalizeProcessedCommands(partialState.processedCommands);
  state.turnTimer = normalizeTurnTimer(partialState.turnTimer);
  state.nextIds = {
    player: intOrDefault(state.nextIds?.player, 1, 1),
    faction: Math.max(intOrDefault(state.nextIds?.faction, 1, 1), ...Object.values(state.factions).map((entry) => entry.id + 1)),
    planet: intOrDefault(state.nextIds?.planet, 1, 1),
    unit: intOrDefault(state.nextIds?.unit, 1, 1),
    event: intOrDefault(state.nextIds?.event, 1, 1),
    station: Math.max(
      intOrDefault(state.nextIds?.station, 1, 1),
      ...Object.values(state.stations).map((entry) => entry.id + 1),
    ),
    shipwreck: Math.max(
      intOrDefault(state.nextIds?.shipwreck, 1, 1),
      ...Object.values(state.shipwrecks).map((entry) => entry.id + 1),
    ),
    anomaly: Math.max(
      intOrDefault(state.nextIds?.anomaly, 1, 1),
      ...Object.values(state.anomalies).map((entry) => entry.id + 1),
    ),
    artifact: intOrDefault(state.nextIds?.artifact, 1, 1),
    audit: Math.max(
      intOrDefault(state.nextIds?.audit, 1, 1),
      ...state.audit.map((entry) => entry.id + 1),
    ),
    unitVariant: Math.max(
      intOrDefault(state.nextIds?.unitVariant, 1, 1),
      ...Object.values(state.unitVariants).map((entry) => entry.id + 1),
    ),
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
  reconcileArtifactOwnership(state);
  for (const planet of Object.values(state.planets)) {
    const progress = calculateTitheProgress(
      planet.maxTitheLevel,
      planet.titheContributions,
    );
    planet.titheLevel = progress.currentLevel;
    planet.tithePaid = progress.paid;
    planet.titheTarget = progress.target;
  }
  // Legacy scheduled faction changes are not proposals and are intentionally discarded.
  state.pendingTitheChanges = [];
  state.pendingInformantActions = normalizePendingInformants(state.pendingInformantActions);
  state.pendingArmyTransportRequests = normalizeArmyTransportRequests(
    (state as Partial<GameState>).pendingArmyTransportRequests,
  ).filter((request) => {
    const army = state.fleets[request.armyId];
    const fleet = state.fleets[request.fleetId];
    return army?.domain === "GROUND" && fleet?.domain === "SPACE" && army.carrierFleetId !== fleet.id;
  });
  state.administratumWorldReports = normalizeAdministratumWorldReports(
    partialState.administratumWorldReports,
    state,
  );
  state.administratumTitheProposals = normalizeAdministratumTitheProposals(
    partialState.administratumTitheProposals,
    state,
  );

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
