import type { UnitEffect, EffectMagnitude } from "../effectDomain";
import { clampMorale, moraleCoefficient } from "../moraleDomain";
import { formationCombatPower, isCombatCapable } from "../formationDomain";
import type { FormationInstance } from "../formationDomain";
import type { GameState } from "../types";
import type { EffectiveTag } from "../tagDomain";
import { effectiveUnitTags, expandEffectiveTags, matchesTagConditions } from "./tagSystem";

export interface UnitDerivedState {
  currentHealth: number;
  maxHealth: number;
  combatPower: number;
  effectiveMorale: number;
  effectiveTags: EffectiveTag[];
  availableDoctrineIds: string[];
  doctrineSlots: number;
  doctrineSelectionInvalid: boolean;
}

function magnitudeValue(magnitude: EffectMagnitude, morale: number): number {
  switch (magnitude.kind) {
    case "FIXED": return magnitude.value;
    case "MORALE_FACTOR": return morale * magnitude.factor;
    default: {
      const exhaustive: never = magnitude;
      return exhaustive;
    }
  }
}

export function calculateUnitDerived(state: GameState, unitId: number): UnitDerivedState | null {
  const unit = state.fleets[unitId];
  if (!unit) return null;
  const formations = (unit.formationIds ?? [])
    .map((id) => state.formations?.[id])
    .filter((formation): formation is FormationInstance =>
      formation !== undefined && formation.currentHealth > 0);
  const capable = formations.filter(isCombatCapable);
  const currentHealth = formations.reduce((sum, formation) => sum + formation.currentHealth, 0);
  const maxHealth = formations.reduce((sum, formation) => sum + formation.maxHealth, 0);
  const base = formations.reduce((sum, formation) => sum + formationCombatPower(formation), 0);
  const baseTags = effectiveUnitTags(state, unitId);
  const tagIds = new Set(baseTags.map((entry) => entry.tagId));
  const availableDoctrineIds = Object.values(state.doctrines ?? {})
    .filter((doctrine) => matchesTagConditions(tagIds, doctrine.tagRequirements))
    .map((doctrine) => doctrine.id)
    .sort();
  const assigned = unit.assignedDoctrineIds ?? [];
  const doctrineSelectionInvalid = assigned.length > capable.length
    || assigned.some((id) => !availableDoctrineIds.includes(id));
  const activeDoctrines = doctrineSelectionInvalid ? [] : assigned
    .map((id) => state.doctrines?.[id])
    .filter((doctrine) => doctrine !== undefined);
  // TODO(DOCTRINE-OVERFLOW-001): no arbitrary winner is chosen. Invalid
  // selections grant no effects until an explicit selection is made.
  const effects: UnitEffect[] = [];
  for (const artifactId of unit.attachedArtifactIds ?? []) {
    const artifact = state.artifacts[artifactId];
    if (artifact?.attachedUnitId === unitId) effects.push(...(artifact.effects ?? []));
  }
  for (const doctrine of activeDoctrines) effects.push(...doctrine.effects);
  const applied = effects.filter((effect) => matchesTagConditions(tagIds, effect.conditions));
  const moraleBonus = applied.reduce((sum, effect) =>
    effect.kind === "ADD_MORALE" ? sum + magnitudeValue(effect.magnitude, unit.morale ?? 0) : sum, 0);
  const effectiveMorale = clampMorale((unit.morale ?? 0) + moraleBonus);
  const bonusTotal = applied.reduce((sum, effect) =>
    effect.kind === "ADD_COMBAT_POWER" ? sum + magnitudeValue(effect.magnitude, effectiveMorale) : sum, 0);
  const multiplierTotal = applied.reduce((product, effect) =>
    effect.kind === "MULTIPLY_COMBAT_POWER"
      ? product * magnitudeValue(effect.magnitude, effectiveMorale) : product, 1);
  const doctrineTags: EffectiveTag[] = [];
  for (const doctrine of activeDoctrines) {
    for (const effect of doctrine.effects) {
      if (effect.kind === "ADD_TAG" && matchesTagConditions(tagIds, effect.conditions)) {
        doctrineTags.push({ tagId: effect.tagId, sourceType: "DOCTRINE", sourceId: doctrine.id });
      }
    }
  }
  for (const artifactId of unit.attachedArtifactIds ?? []) {
    const artifact = state.artifacts[artifactId];
    if (!artifact || artifact.attachedUnitId !== unitId) continue;
    for (const effect of artifact.effects ?? []) {
      if (effect.kind === "ADD_TAG" && matchesTagConditions(tagIds, effect.conditions)) {
        doctrineTags.push({
          tagId: effect.tagId,
          sourceType: artifactId === unit.commanderArtifactId ? "COMMANDER" : "ARTIFACT",
          sourceId: artifactId,
        });
      }
    }
  }
  return {
    currentHealth,
    maxHealth,
    combatPower: Math.floor((base * moraleCoefficient(effectiveMorale) + bonusTotal) * multiplierTotal),
    effectiveMorale,
    effectiveTags: expandEffectiveTags(state.tags ?? {}, [...baseTags, ...doctrineTags]),
    availableDoctrineIds,
    doctrineSlots: capable.length,
    doctrineSelectionInvalid,
  };
}

/** Compatibility projection; formations are the source of truth when present. */
export function synchronizeUnitProjection(state: GameState, unitId: number): void {
  const unit = state.fleets[unitId];
  if (!unit || (unit.formationIds ?? []).length === 0) return;
  const derived = calculateUnitDerived(state, unitId);
  if (!derived) return;
  unit.health = derived.currentHealth;
  unit.combatPower = derived.combatPower;
}
