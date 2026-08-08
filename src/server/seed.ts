import {
  computePopulationProduction,
  RAW_OUTPUTS_BY_WORLD_TYPE,
  titheValue,
} from "../planetDomain";
import { DocumentSnapshot } from "../storage/documentDb";
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
import { Account } from "./contracts";
import { defaultPlayerColor } from "../utils/playerColor";

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

function createDefaultFactions(): Record<string, Faction> {
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

      tiles.push({ q, r, terrainType });
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
    overviewRange: 1,
    rawStock: {},
    productStorageByPlayerId: {},
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
    position: { q, r },
    combatPower,
    health: 100,
    influence,
    actionPoints: 3,
    visionRange: 2,
    shareVisionWithAllies: false,
    capacity: 10,
    stance: "ATTACK",
    domain,
    inventory: {},
  };
}

export function createInitialGameState(): GameState {
  return {
    gameId: "live-1",
    turnNumber: 1,
    phase: "PLANNING",
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
    pendingTitheChanges: [],
    pendingInformantActions: [],
    pendingArmyTransportRequests: [],
    events: [],
    nextIds: { player: 4, faction: 14, planet: 6, unit: 7, event: 1 },
  };
}

export function createInitialAccounts(gameState: GameState): Record<string, Account> {
  const result: Record<string, Account> = {
    admin: {
      username: "admin",
      password: "admin123",
      role: "admin",
      playerId: 1,
    },
  };

  for (const player of Object.values(gameState.players)) {
    const username = `p${player.id}`;
    result[username] = {
      username,
      password: username,
      role: "player",
      playerId: player.id,
    };
  }

  return result;
}

export function createInitialDocumentSnapshot(): DocumentSnapshot {
  const gameState = createInitialGameState();
  return {
    gameState,
    accounts: createInitialAccounts(gameState),
    sessions: {},
  };
}
