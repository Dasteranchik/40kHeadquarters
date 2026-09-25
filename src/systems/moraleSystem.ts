import { clampMorale } from "../moraleDomain";
import type { GameState } from "../types";
import { synchronizeUnitProjection } from "./unitEffectSystem";

/** Server-side UPDATE effect; each configured anomaly applies once per turn. */
export function applyAnomalyMoraleLoss(state: GameState): void {
  for (const anomaly of Object.values(state.anomalies).sort((a, b) => a.id - b.id)) {
    const loss = anomaly.moraleLoss ?? 0;
    if (loss <= 0) continue;
    for (const unit of Object.values(state.fleets)) {
      if (unit.position.q === anomaly.position.q && unit.position.r === anomaly.position.r) {
        unit.morale = clampMorale((unit.morale ?? 0) - loss);
        synchronizeUnitProjection(state, unit.id);
      }
    }
    for (const planet of Object.values(state.planets)) {
      if (planet.position.q === anomaly.position.q && planet.position.r === anomaly.position.r) {
        planet.morale = clampMorale(planet.morale - loss);
      }
    }
  }
}
