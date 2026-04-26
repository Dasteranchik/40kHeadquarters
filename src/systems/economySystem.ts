import { EconomyReport, GameState } from "../types";

export function applyEconomy(state: GameState): EconomyReport {
  const playerIncome: Record<string, number> = {};
  for (const player of Object.values(state.players)) {
    playerIncome[player.id] = 0;
  }

  return {
    globalIncome: 0,
    playerIncome,
  };
}
