import { DocumentSnapshot } from "../storage/documentDb";
import { GameState, MapState, TerrainType, Tile } from "../types";
import { Account } from "./contracts";

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

export function createInitialGameState(): GameState {
  return {
    gameId: "live-1",
    turnNumber: 1,
    phase: "PLANNING",
    map: buildMap(18, 12),
    players: {
      p1: {
        id: "p1",
        name: "Imperial Navy",
        resources: 100,
        alliances: [],
        wars: [],
        exploredTiles: [],
      },
      p2: {
        id: "p2",
        name: "Orcs",
        resources: 100,
        alliances: [],
        wars: [],
        exploredTiles: [],
      },
      p3: {
        id: "p3",
        name: "Necrons",
        resources: 100,
        alliances: [],
        wars: [],
        exploredTiles: [],
      },
    },
    planets: {
      pl1: {
        id: "pl1",
        position: { q: 2, r: 2 },
        resourceProduction: 6,
        influenceValue: 2,
        visionRange: 1,
      },
      pl2: {
        id: "pl2",
        position: { q: 8, r: 3 },
        resourceProduction: 8,
        influenceValue: 3,
        visionRange: 1,
      },
      pl3: {
        id: "pl3",
        position: { q: 14, r: 9 },
        resourceProduction: 7,
        influenceValue: 3,
        visionRange: 1,
      },
      pl4: {
        id: "pl4",
        position: { q: 3, r: 9 },
        resourceProduction: 5,
        influenceValue: 2,
        visionRange: 1,
      },
      pl5: {
        id: "pl5",
        position: { q: 15, r: 2 },
        resourceProduction: 9,
        influenceValue: 4,
        visionRange: 1,
      },
    },
    fleets: {
      f1: {
        id: "f1",
        ownerPlayerId: "p1",
        position: { q: 1, r: 1 },
        combatPower: 11,
        health: 100,
        influence: 4,
        actionPoints: 3,
        visionRange: 2,
        capacity: 10,
        stance: "ATTACK",
      },
      f2: {
        id: "f2",
        ownerPlayerId: "p1",
        position: { q: 2, r: 1 },
        combatPower: 9,
        health: 100,
        influence: 5,
        actionPoints: 3,
        visionRange: 2,
        capacity: 10,
        stance: "ATTACK",
      },
      f3: {
        id: "f3",
        ownerPlayerId: "p2",
        position: { q: 3, r: 1 },
        combatPower: 10,
        health: 100,
        influence: 4,
        actionPoints: 3,
        visionRange: 2,
        capacity: 10,
        stance: "ATTACK",
      },
      f4: {
        id: "f4",
        ownerPlayerId: "p2",
        position: { q: 15, r: 1 },
        combatPower: 12,
        health: 100,
        influence: 3,
        actionPoints: 3,
        visionRange: 2,
        capacity: 10,
        stance: "ATTACK",
      },
      f5: {
        id: "f5",
        ownerPlayerId: "p3",
        position: { q: 8, r: 10 },
        combatPower: 13,
        health: 100,
        influence: 4,
        actionPoints: 3,
        visionRange: 2,
        capacity: 10,
        stance: "ATTACK",
      },
      f6: {
        id: "f6",
        ownerPlayerId: "p3",
        position: { q: 9, r: 10 },
        combatPower: 8,
        health: 100,
        influence: 6,
        actionPoints: 3,
        visionRange: 2,
        capacity: 10,
        stance: "ATTACK",
      },
    },
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