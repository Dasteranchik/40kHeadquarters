import {
  Action,
  CombatReport,
  GameState,
  SetFleetStanceAction,
  TurnResolution,
} from "../types";
import { validateActions } from "../systems/actionValidator";
import { executeMovement } from "../systems/movementSystem";
import { applyDiplomacy } from "../systems/diplomacySystem";
import { resolveCombat } from "../systems/combatSystem";
import { applyEconomy } from "../systems/economySystem";
import { recalcVisibility } from "../systems/fogOfWarSystem";

const DEFAULT_ACTION_POINTS = 3;

function resetActionPoints(state: GameState): void {
  for (const fleet of Object.values(state.fleets)) {
    fleet.actionPoints = DEFAULT_ACTION_POINTS;
  }
}

function applyFleetStances(
  state: GameState,
  stanceActions: SetFleetStanceAction[],
): void {
  for (const action of stanceActions) {
    const fleet = state.fleets[action.payload.fleetId];
    if (!fleet) {
      continue;
    }

    fleet.stance = action.payload.stance;
  }
}

function mergeCombatReports(reports: CombatReport[]): CombatReport {
  return {
    damageEvents: reports.flatMap((report) => report.damageEvents),
    destroyedFleetIds: reports.flatMap((report) => report.destroyedFleetIds),
  };
}

export function resolveTurn(state: GameState, actions: Action[]): TurnResolution {
  state.phase = "RESOLUTION";

  const validated = validateActions(state, actions);

  const movement = executeMovement(state, validated.moveActions);
  applyFleetStances(state, validated.stanceActions);

  // Diplomacy is applied before combat so DECLARE_WAR / mutual agreements
  // can affect both combat rounds in the same turn.
  const diplomacy = applyDiplomacy(state, validated.diplomacyActions);

  // Combat resolves twice per turn: opening clash and end-of-turn clash.
  const combatStart = resolveCombat(state);
  const combatEnd = resolveCombat(state);
  const combat = mergeCombatReports([combatStart, combatEnd]);

  const economy = applyEconomy(state);
  const visibility = recalcVisibility(state);

  state.phase = "UPDATE";
  state.turnNumber += 1;
  resetActionPoints(state);
  state.phase = "PLANNING";

  return {
    turnNumber: state.turnNumber,
    validationErrors: validated.errors,
    movement,
    diplomacy,
    combat,
    economy,
    visibility,
  };
}