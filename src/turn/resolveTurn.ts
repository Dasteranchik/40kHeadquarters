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
import { applyPlanetSystems } from "../systems/planetSystem";
import { detectObjectsForFleetAtCurrentHex } from "../systems/detectionSystem";
import type { DetectionResult } from "../detectionDomain";
import { applyStationGeneration } from "../systems/stationSystem";
import { resolveAdministratumTitheProposals } from "../systems/administratumSystem";
import { applyAnomalyMoraleLoss } from "../systems/moraleSystem";

function restoreMovementPoints(state: GameState): void {
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.domain !== "SPACE") continue;
    fleet.movementPoints = Math.min(
      fleet.maxMovementPoints,
      Math.max(fleet.movementPoints, state.systemSettings.baseFleetMovementPoints),
    );
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
    createdShipwreckIds: reports.flatMap((report) => report.createdShipwreckIds),
  };
}

export function resolveTurn(state: GameState, actions: Action[]): TurnResolution {
  state.phase = "RESOLUTION";

  const validated = validateActions(state, actions);

  applyFleetStances(state, validated.stanceActions);

  // Diplomacy is applied before combat so DECLARE_WAR / mutual agreements
  // can affect both combat rounds in the same turn.
  const diplomacy = applyDiplomacy(state, validated.diplomacyActions);

  const planet = applyPlanetSystems(state, validated.planetActions);
  applyStationGeneration(state);

  // Fleets already sharing a hex fight before any planned movement. Destroyed
  // fleets are consequently unable to execute their movement orders.
  const combatStart = resolveCombat(state);

  const detection: DetectionResult[] = [];
  const movedFleetIds = new Set<number>();
  const movement = executeMovement(state, validated.moveActions, (fleetId) => {
    movedFleetIds.add(fleetId);
    const result = detectObjectsForFleetAtCurrentHex(state, fleetId);
    if (result) detection.push(result);
  });
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.domain !== "SPACE" || movedFleetIds.has(fleet.id)) continue;
    const result = detectObjectsForFleetAtCurrentHex(state, fleet.id);
    if (result) detection.push(result);
  }

  // Movement can bring hostile fleets together, causing a second clash.
  const combatEnd = resolveCombat(state);
  const combat = mergeCombatReports([combatStart, combatEnd]);

  const administratum = resolveAdministratumTitheProposals(state);

  const economy = applyEconomy(state);

  state.phase = "UPDATE";
  applyAnomalyMoraleLoss(state);
  const visibility = recalcVisibility(state);
  state.turnNumber += 1;
  restoreMovementPoints(state);
  state.phase = "PLANNING";

  return {
    turnNumber: state.turnNumber,
    validationErrors: validated.errors,
    movement,
    diplomacy,
    combat,
    economy,
    planet,
    detection,
    administratum,
    visibility,
  };
}
