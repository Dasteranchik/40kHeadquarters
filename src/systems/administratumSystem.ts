import { calculateTitheProgress, isTitheLevel, titheValue, type TitheLevel } from "../planetDomain";
import { clampMorale } from "../moraleDomain";
import type {
  AdministratumTitheProposal,
  AdministratumWorldReport,
  GameState,
} from "../types";

export interface AdministratumResult {
  ok: boolean;
  message: string;
}

export interface AppliedTitheProposal {
  planetId: number;
  titheLevel: TitheLevel;
  notifiedPlayerIds: number[];
}

export function playerIsAdministratum(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return Boolean(player && state.factions[player.factionId]?.isAdministratum);
}

export function reportWorld(
  state: GameState,
  playerId: number,
  planetId: number,
): AdministratumResult {
  if (!state.players[playerId]) return { ok: false, message: "Игрок не найден" };
  if (!state.planets[planetId]) return { ok: false, message: "Планета не найдена" };
  if (state.administratumWorldReports.some((entry) => entry.planetId === planetId)) {
    return { ok: true, message: "Мир уже зарегистрирован в Администратуме" };
  }
  const sequence = state.administratumWorldReports.reduce(
    (max, entry) => Math.max(max, entry.sequence),
    0,
  ) + 1;
  const report: AdministratumWorldReport = {
    planetId,
    reportedAtTurn: state.turnNumber,
    sequence,
  };
  state.administratumWorldReports.push(report);
  return { ok: true, message: "Мир зарегистрирован в Администратуме" };
}

export function proposeTithe(
  state: GameState,
  playerId: number,
  planetId: number,
  titheLevel: unknown,
): AdministratumResult {
  if (!playerIsAdministratum(state, playerId)) {
    return { ok: false, message: "Предлагать десятину может только Администратум" };
  }
  if (!state.administratumWorldReports.some((entry) => entry.planetId === planetId)) {
    return { ok: false, message: "Мир ещё не зарегистрирован в Администратуме" };
  }
  if (!isTitheLevel(titheLevel)) {
    return { ok: false, message: "Недопустимый уровень десятины" };
  }
  const proposal: AdministratumTitheProposal = {
    planetId,
    playerId,
    requestedOnTurn: state.turnNumber,
    titheLevel,
  };
  const existingIndex = state.administratumTitheProposals.findIndex(
    (entry) => entry.planetId === planetId
      && entry.playerId === playerId
      && entry.requestedOnTurn === state.turnNumber,
  );
  if (existingIndex >= 0) state.administratumTitheProposals[existingIndex] = proposal;
  else state.administratumTitheProposals.push(proposal);
  return { ok: true, message: "Предложение по десятине сохранено" };
}

export function resolveAdministratumTitheProposals(state: GameState): AppliedTitheProposal[] {
  const resolvingTurn = state.turnNumber;
  const current = state.administratumTitheProposals.filter(
    (entry) => entry.requestedOnTurn === resolvingTurn
      && playerIsAdministratum(state, entry.playerId)
      && Boolean(state.planets[entry.planetId]),
  );
  const byPlanet = new Map<number, AdministratumTitheProposal[]>();
  for (const proposal of current) {
    const list = byPlanet.get(proposal.planetId) ?? [];
    list.push(proposal);
    byPlanet.set(proposal.planetId, list);
  }
  const applied: AppliedTitheProposal[] = [];
  for (const [planetId, proposals] of byPlanet) {
    const levels = new Set(proposals.map((entry) => entry.titheLevel));
    if (levels.size !== 1) continue;
    const titheLevel = proposals[0]?.titheLevel;
    const planet = state.planets[planetId];
    if (!planet || !titheLevel) continue;
    const increase = Math.max(0, titheValue(titheLevel) - titheValue(planet.maxTitheLevel));
    planet.maxTitheLevel = titheLevel;
    if (increase > 0) planet.morale = clampMorale(planet.morale - increase);
    const progress = calculateTitheProgress(titheLevel, planet.titheContributions);
    planet.titheLevel = progress.currentLevel;
    planet.tithePaid = progress.paid;
    planet.titheTarget = progress.target;
    const notifiedPlayerIds = [...new Set(
      Object.values(state.fleets)
        .filter((unit) => unit.position.q === planet.position.q && unit.position.r === planet.position.r)
        .map((unit) => Number(unit.ownerPlayerId)),
    )].filter((id) => Number.isInteger(id) && Boolean(state.players[id]));
    applied.push({ planetId, titheLevel, notifiedPlayerIds });
  }
  state.administratumTitheProposals = state.administratumTitheProposals.filter(
    (entry) => entry.requestedOnTurn > resolvingTurn,
  );
  return applied.sort((a, b) => a.planetId - b.planetId);
}
