import {
  computePopulationProduction,
  DEFAULT_PRODUCT_CONVERSION_RATES,
  RAW_OUTPUTS_BY_WORLD_TYPE,
  titheValue,
} from "../planetDomain";
import type { DocumentSnapshot } from "../storage/documentDb";
import { CURRENT_SCHEMA_VERSION } from "../storage/snapshot";
import { createEmptyItemInventory } from "../itemDomain";
import { createEmptyShop } from "../shopDomain";
import { DEFAULT_TURN_DURATION_MS } from "../turnTimerDomain";
import {
  Faction,
  Fleet,
  GameState,
  IntelFragmentMap,
  MapState,
  Planet,
  Player,
  TerrainType,
  Tile,
} from "../types";
import { defaultPlayerColor } from "../utils/playerColor";

const DEFAULT_FACTIONS: Array<{ id: string; name: string; isChaos?: boolean; isAdministratum?: boolean }> = [
  { id: "astra_militarum", name: "Астра Милитарум" },
  { id: "battle_fleet", name: "Боевой Флот" },
  { id: "fleet", name: "Флот" },
  { id: "pirates", name: "Пираты" },
  { id: "rogue_traders", name: "Вольные Торговцы" },
  { id: "ecclesiarchy", name: "Эклезиархия" },
  { id: "administratum", name: "Администратум", isAdministratum: true },
  { id: "navis_nobilite", name: "Навигаторы" },
  { id: "other_psykers", name: "другие псайкеры" },
  { id: "inquisition", name: "Инквизиция" },
  { id: "chaos", name: "Хаоситы", isChaos: true },
  { id: "mechanicus", name: "Механикус" },
  { id: "dark_mechanicus", name: "Тёмные Механикус" },
];

function createDefaultFactions(): Record<string, Faction> {
  const result: Record<string, Faction> = {};
  DEFAULT_FACTIONS.forEach((faction, index) => {
    const id = index + 1;
    result[id] = {
      id,
      code: faction.id,
      name: faction.name,
      isChaos: faction.isChaos === true,
      isAdministratum: faction.isAdministratum === true,
    };
  });

  return result;
}

export function buildMap(width: number, height: number): MapState {
  const tiles: Tile[] = [];

  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      let terrainType: TerrainType = "OPEN";
      if ((q === 5 && r >= 2 && r <= 8) || (r === 5 && q >= 10 && q <= 13)) {
        terrainType = "OBSTACLE";
      } else if ((q + r) % 6 === 0) {
        terrainType = "NEBULA";
      }

      tiles.push({ q, r, terrainType, warpDisturbanceLevel: 1 });
    }
  }

  return { width, height, tiles };
}

function createPlayer(
  id: number,
  name: string,
  alignment: Player["alignment"],
  factionId: number,
): Player {
  return {
    id,
    name,
    color: defaultPlayerColor(id),
    canTakePlanetResources: false,
    resources: 100,
    alliances: [],
    wars: [],
    exploredTiles: [],
    alignment,
    factionId,
    intelFragments: {},
    manualNavigator: false,
  };
}

function createPlanet(
  id: number,
  q: number,
  r: number,
  worldType: Planet["worldType"],
  worldTags: Planet["worldTags"],
  population: number,
  infoFragments: IntelFragmentMap,
): Planet {
  const outputs = RAW_OUTPUTS_BY_WORLD_TYPE[worldType] ?? [];
  const perResource = computePopulationProduction(population);

  return {
    id,
    name: `Planet ${id}`,
    position: { q, r },
    worldType,
    worldTags,
    tags: [],
    population,
    morale: 5,
    titheLevel: "DECUMA_PRIMA",
    maxTitheLevel: "DECUMA_PRIMA",
    titheTarget: titheValue("DECUMA_PRIMA"),
    tithePaid: 0,
    titheContributions: {},
    resourceGeneration: Object.fromEntries(outputs.map((key) => [key, 1])),
    resourceProduction: perResource * outputs.length,
    influenceValue: 2,
    visionRange: 1,
    rawStock: {},
    productStorageByPlayerId: {},
    itemStorageByPlayerId: {},
    shop: createEmptyShop(),
    infoFragments,
  };
}

function createFleet(
  id: number,
  ownerPlayerId: number,
  q: number,
  r: number,
  combatPower: number,
  influence: number,
  domain: Fleet["domain"] = "SPACE",
): Fleet {
  return {
    id,
    ownerPlayerId,
    name: `${domain === "GROUND" ? "Army" : "Fleet"} ${id}`,
    position: { q, r },
    combatPower,
    health: 100,
    morale: 0,
    commanderArtifactId: null,
    formationIds: [],
    attachedArtifactIds: [],
    assignedDoctrineIds: [],
    influence,
    movementPoints: domain === "SPACE" ? 3 : 0,
    maxMovementPoints: domain === "SPACE" ? 3 : 0,
    isNavigator: false,
    warpVisibility: null,
    visionRange: 2,
    shareVisionWithAllies: false,
    capacity: 10,
    stance: "ATTACK",
    domain,
    inventory: {},
    itemInventory: createEmptyItemInventory(),
    tags: [],
  };
}

export function createInitialGameState(): GameState {
  const now = Date.now();
  return {
    gameId: "live-1",
    turnNumber: 1,
    phase: "PLANNING",
    systemSettings: { baseFleetMovementPoints: 1 },
    productConversionRates: { ...DEFAULT_PRODUCT_CONVERSION_RATES },
    map: buildMap(18, 12),
    factions: createDefaultFactions(),
    players: {
      1: createPlayer(1, "Imperial Navy", "IMPERIAL", 2),
      2: createPlayer(2, "Orcs", "NON_IMPERIAL", 4),
      3: createPlayer(3, "Necrons", "NON_IMPERIAL", 11),
    },
    planets: {
      1: createPlanet(
        1,
        2,
        2,
        "AGRI_WORLD",
        ["FOOD_PRODUCTION"],
        70,
        {
          MILITARY: 1,
          ARISTOCRACY: 1,
        },
      ),
      2: createPlanet(
        2,
        8,
        3,
        "MINING_WORLD",
        ["INDUSTRIAL_PRODUCTION", "REFINERY"],
        85,
        {
          TECH_SECRETS: 2,
          NAVAL: 1,
        },
      ),
      3: createPlanet(
        3,
        14,
        9,
        "HIVE_WORLD",
        ["RECRUITMENT_CENTER"],
        90,
        {
          MILITARY: 2,
          FORBIDDEN: 1,
        },
      ),
      4: createPlanet(
        4,
        3,
        9,
        "FEUDAL_WORLD",
        ["LABOR_CAMP"],
        55,
        {
          ARISTOCRACY: 2,
          NAVAL: 1,
        },
      ),
      5: createPlanet(
        5,
        15,
        2,
        "QUARRY_WORLD",
        ["ASSEMBLY_SHIPYARDS"],
        100,
        {
          TECH_SECRETS: 1,
          PSYKANA: 1,
        },
      ),
    },
    fleets: {
      1: createFleet(1, 1, 1, 1, 11, 4, "SPACE"),
      2: createFleet(2, 1, 2, 1, 9, 5, "GROUND"),
      3: createFleet(3, 2, 3, 1, 10, 4, "SPACE"),
      4: createFleet(4, 2, 15, 1, 12, 3, "GROUND"),
      5: createFleet(5, 3, 8, 10, 13, 4, "SPACE"),
      6: createFleet(6, 3, 9, 10, 8, 6, "SPACE"),
    },
    stations: {},
    shipwrecks: {},
    anomalies: {},
    artifacts: {},
    unitVariants: {},
    formations: {},
    itemKinds: {},
    tags: { STEALTH: { id: "STEALTH", name: "Stealth", parentTagIds: [] } },
    tagRelations: [],
    doctrines: {},
    pendingTitheChanges: [],
    pendingInformantActions: [],
    pendingArmyTransportRequests: [],
    administratumWorldReports: [],
    administratumTitheProposals: [],
    events: [],
    audit: [],
    detection: { recordsByPlayerId: {} },
    processedCommands: [],
    turnTimer: {
      durationMs: DEFAULT_TURN_DURATION_MS,
      turnStartedAt: now,
      turnEndsAt: now + DEFAULT_TURN_DURATION_MS,
    },
    nextIds: {
      player: 4,
      faction: 14,
      planet: 6,
      unit: 7,
      event: 1,
      station: 1,
      shipwreck: 1,
      anomaly: 1,
      artifact: 1,
      audit: 1,
      unitVariant: 1,
      formation: 1,
    },
  };
}

export function createInitialDocumentSnapshot(): DocumentSnapshot {
  const gameState = createInitialGameState();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameState,
    accounts: {},
    sessions: {},
    turnSnapshots: [],
  };
}
