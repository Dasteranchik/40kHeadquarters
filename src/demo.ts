import { createInitialGameState } from "./server/seed";
import { resolveTurn } from "./turn/resolveTurn";
import { Action, GameState } from "./types";

const state: GameState = createInitialGameState();
state.gameId = "demo-1";
state.phase = "LOCKED";

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
