import type { GameState } from "../types";

export interface MovementPointResult {
  ok: boolean;
  message: string;
}

/** Converts FUEL held by one owned SPACE fleet directly into movement points. */
export function convertFuelToMovement(
  state: GameState,
  playerId: number,
  fleetId: number,
  amount: unknown,
): MovementPointResult {
  if (state.phase !== "PLANNING") {
    return { ok: false, message: "Конвертация топлива доступна только в фазе планирования" };
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Количество топлива должно быть положительным целым числом" };
  }
  const fleet = state.fleets[fleetId];
  if (!fleet || fleet.ownerPlayerId !== playerId || fleet.domain !== "SPACE") {
    return { ok: false, message: "Флот не принадлежит игроку" };
  }
  const fuel = fleet.inventory.FUEL ?? 0;
  if (fuel < amount) {
    return { ok: false, message: "Во флоте недостаточно FUEL" };
  }
  if (fleet.movementPoints + amount > fleet.maxMovementPoints) {
    return { ok: false, message: "Конвертация превысит максимальное количество ОД" };
  }

  fleet.inventory.FUEL = fuel - amount;
  if (fleet.inventory.FUEL <= 0) delete fleet.inventory.FUEL;
  fleet.movementPoints += amount;
  return { ok: true, message: `${amount} FUEL преобразовано в Очки движения` };
}
