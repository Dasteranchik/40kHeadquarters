import { EconomyReport, GameState } from "../types";

export function applyEconomy(state: GameState): EconomyReport {
  const globalIncome = Object.values(state.planets).reduce(
    (sum, planet) => sum + planet.resourceProduction,
    0,
  );

  const playerIncome: Record<string, number> = {};
  for (const player of Object.values(state.players)) {
    player.resources += globalIncome;
    playerIncome[player.id] = globalIncome;
  }

  return {
    globalIncome,
    playerIncome,
  };
}