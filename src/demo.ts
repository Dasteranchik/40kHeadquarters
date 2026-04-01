import { resolveTurn } from "./turn/resolveTurn";
import { Action, GameState, MapState, TerrainType, Tile } from "./types";

function buildMap(width: number, height: number): MapState {
  const tiles: Tile[] = [];

  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      let terrainType: TerrainType = "OPEN";
      if (q === 2 && r === 2) {
        terrainType = "OBSTACLE";
      }

      tiles.push({ q, r, terrainType });
    }
  }

  return {
    width,
    height,
    tiles,
  };
}

const state: GameState = {
  gameId: "demo-1",
  turnNumber: 1,
  phase: "LOCKED",
  map: buildMap(5, 5),
  players: {
    p1: {
      id: "p1",
      name: "Alpha",
      resources: 0,
      alliances: [],
        wars: [],
        exploredTiles: [],
    },
    p2: {
      id: "p2",
      name: "Beta",
      resources: 0,
      alliances: [],
        wars: [],
        exploredTiles: [],
    },
  },
  fleets: {
    f1: {
      id: "f1",
      ownerPlayerId: "p1",
      position: { q: 1, r: 1 },
      combatPower: 10,
      health: 100,
      influence: 5,
      actionPoints: 3,
      visionRange: 2,
      capacity: 10,
      stance: "ATTACK",
    },
    f2: {
      id: "f2",
      ownerPlayerId: "p2",
      position: { q: 3, r: 1 },
      combatPower: 9,
      health: 100,
      influence: 4,
      actionPoints: 3,
      visionRange: 2,
      capacity: 10,
      stance: "ATTACK",
    },
  },
  planets: {
    pl1: {
      id: "pl1",
      position: { q: 0, r: 0 },
      resourceProduction: 4,
      influenceValue: 2,
      visionRange: 1,
    },
    pl2: {
      id: "pl2",
      position: { q: 4, r: 4 },
      resourceProduction: 6,
      influenceValue: 3,
      visionRange: 1,
    },
  },
};

const actions: Action[] = [
  {
    id: "a-001",
    playerId: "p1",
    type: "DIPLOMACY",
    payload: {
      targetPlayerId: "p2",
      action: "DECLARE_WAR",
    },
  },
  {
    id: "a-002",
    playerId: "p1",
    type: "MOVE_FLEET",
    payload: {
      fleetId: "f1",
      path: [
        { q: 2, r: 1 },
        { q: 3, r: 1 },
      ],
    },
  },
];

const result = resolveTurn(state, actions);
console.log(JSON.stringify(result, null, 2));