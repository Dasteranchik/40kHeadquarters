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

const DEFAULT_FACTIONS: Array<{ id: string; name: string }> = [
  { id: "astra_militarum", name: "Астра Милитарум" },
  { id: "battle_fleet", name: "Боевой Флот" },
  { id: "fleet", name: "Флот" },
  { id: "pirates", name: "Пираты" },
  { id: "rogue_traders", name: "Вольные Торговцы" },
  { id: "navis_nobilite", name: "Навис Нобилите" },
  { id: "other_psykers", name: "другие псайкеры" },
  { id: "inquisition", name: "Инквизиция" },
  { id: "chaos", name: "Хаоситы" },
  { id: "mechanicus", name: "Механикус" },
  { id: "dark_mechanicus", name: "Тёмные Механикус" },
];

function createDefaultFactions(): Record<string, Faction> {
  const result: Record<string, Faction> = {};
  for (const faction of DEFAULT_FACTIONS) {
    result[faction.id] = {
      id: faction.id,
      name: faction.name,
    };
  }

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
  id: string,
  name: string,
  alignment: Player["alignment"],
  factionId: string,
): Player {
  return {
    id,
    name,
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
  id: string,
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
    position: { q, r },
    worldType,
    worldTags,
    population,
    morale: 5,
    titheLevel: "DECUMA_PRIMA",
    titheTarget: titheValue("DECUMA_PRIMA"),
    tithePaid: 0,
    resourceProduction: perResource * outputs.length,
    influenceValue: 2,
    visionRange: 1,
    overviewRange: 1,
    rawStock: {},
    productStorage: {},
    infoFragments,
  };
}

function createFleet(
  id: string,
  ownerPlayerId: string,
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
      p1: createPlayer("p1", "Imperial Navy", "IMPERIAL", "battle_fleet"),
      p2: createPlayer("p2", "Orcs", "NON_IMPERIAL", "pirates"),
      p3: createPlayer("p3", "Necrons", "NON_IMPERIAL", "chaos"),
    },
    planets: {
      pl1: createPlanet(
        "pl1",
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
      pl2: createPlanet(
        "pl2",
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
      pl3: createPlanet(
        "pl3",
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
      pl4: createPlanet(
        "pl4",
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
      pl5: createPlanet(
        "pl5",
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
      f1: createFleet("f1", "p1", 1, 1, 11, 4, "SPACE"),
      f2: createFleet("f2", "p1", 2, 1, 9, 5, "GROUND"),
      f3: createFleet("f3", "p2", 3, 1, 10, 4, "SPACE"),
      f4: createFleet("f4", "p2", 15, 1, 12, 3, "GROUND"),
      f5: createFleet("f5", "p3", 8, 10, 13, 4, "SPACE"),
      f6: createFleet("f6", "p3", 9, 10, 8, 6, "SPACE"),
    },
    pendingTitheChanges: [],
    pendingInformantActions: [],
  };
}

export function createInitialAccounts(gameState: GameState): Record<string, Account> {
  const result: Record<string, Account> = {
    admin: {
      username: "admin",
      password: "admin123",
      role: "admin",
      playerId: "p1",
    },
  };

  for (const player of Object.values(gameState.players)) {
    result[player.id] = {
      username: player.id,
      password: player.id,
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
  };
}
