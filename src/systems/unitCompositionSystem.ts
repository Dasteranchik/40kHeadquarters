import type { FormationInstance } from "../formationDomain";
import type { InventoryLocation, ItemInventory } from "../itemDomain";
import type { GameState } from "../types";
import { calculateUnitDerived, synchronizeUnitProjection } from "./unitEffectSystem";

function itemInventoryAt(state: GameState, location: InventoryLocation): ItemInventory | null {
  switch (location.kind) {
    case "FLEET": return state.fleets[location.fleetId]?.itemInventory ?? null;
    case "PLANET_STORAGE": return state.planets[location.planetId]?.itemStorageByPlayerId[location.playerId] ?? null;
    case "PLANET_SHOP": return state.planets[location.planetId]?.shop.items ?? null;
    case "STATION_STORAGE": return state.stations[location.stationId]?.itemStorageByPlayerId[location.playerId] ?? null;
    case "STATION_SHOP": return state.stations[location.stationId]?.shop.items ?? null;
    case "PLANET_SECRET": return state.planets[location.planetId]?.secretStorage?.itemInventory ?? null;
    case "STATION_SECRET": return state.stations[location.stationId]?.secretStorage?.itemInventory ?? null;
    case "SHIPWRECK": return state.shipwrecks[location.shipwreckId]?.inventory ?? null;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

export function attachFormation(state: GameState, unitId: number, formationId: string): void {
  const unit = state.fleets[unitId];
  const formation = state.formations?.[formationId];
  if (!unit || !formation || formation.currentHealth <= 0) throw new Error("Formation or Unit not found");
  if (formation.owner.kind === "UNIT") throw new Error("Formation is already attached");
  const source = itemInventoryAt(state, formation.owner);
  if (!source?.productIds?.includes(formationId)) throw new Error("Formation is not in source inventory");
  if ((unit.formationIds ?? []).includes(formationId)) throw new Error("Formation is already attached");
  source.productIds = source.productIds.filter((id) => id !== formationId);
  formation.owner = { kind: "UNIT", unitId };
  (unit.formationIds ??= []).push(formationId);
  synchronizeUnitProjection(state, unitId);
}

export function extractFormation(
  state: GameState,
  unitId: number,
  formationId: string,
  destination: InventoryLocation,
): void {
  const unit = state.fleets[unitId];
  const formation = state.formations?.[formationId];
  const inventory = itemInventoryAt(state, destination);
  if (!unit || !formation || !inventory || formation.owner.kind !== "UNIT"
    || formation.owner.unitId !== unitId || !(unit.formationIds ?? []).includes(formationId)) {
    throw new Error("Formation transfer is invalid");
  }
  if ((unit.formationIds ?? []).length <= 1) {
    // TODO(EMPTY-UNIT-001): no regular extraction path creates an empty Unit.
    throw new Error("Cannot extract the last Formation");
  }
  unit.formationIds = (unit.formationIds ?? []).filter((id) => id !== formationId);
  formation.owner = destination;
  (inventory.productIds ??= []).push(formationId);
  synchronizeUnitProjection(state, unitId);
}

export function attachArtifact(state: GameState, unitId: number, artifactId: string): void {
  const unit = state.fleets[unitId];
  const artifact = state.artifacts[artifactId];
  if (!unit || !artifact || artifact.owner.kind !== "FLEET" || artifact.owner.fleetId !== unitId
    || !unit.itemInventory.artifactIds.includes(artifactId) || artifact.attachedUnitId !== undefined) {
    throw new Error("Artifact cannot be attached");
  }
  artifact.attachedUnitId = unitId;
  (unit.attachedArtifactIds ??= []).push(artifactId);
  synchronizeUnitProjection(state, unitId);
}

export function detachArtifact(state: GameState, unitId: number, artifactId: string): void {
  const unit = state.fleets[unitId];
  const artifact = state.artifacts[artifactId];
  if (!unit || !artifact || artifact.attachedUnitId !== unitId) throw new Error("Artifact is not attached");
  if (unit.commanderArtifactId === artifactId) throw new Error("Commander cannot be detached");
  unit.attachedArtifactIds = (unit.attachedArtifactIds ?? []).filter((id) => id !== artifactId);
  delete artifact.attachedUnitId;
  synchronizeUnitProjection(state, unitId);
}

export function replaceCommander(state: GameState, unitId: number, newArtifactId: string): void {
  const unit = state.fleets[unitId];
  const next = state.artifacts[newArtifactId];
  if (!unit || !next || next.owner.kind !== "FLEET" || next.owner.fleetId !== unitId
    || !unit.itemInventory.artifactIds.includes(newArtifactId)
    || state.itemKinds?.[next.kind ?? next.definitionCode]?.commanderCapable !== true
    || (next.attachedUnitId !== undefined && next.attachedUnitId !== unitId)) {
    throw new Error("Replacement Commander is invalid");
  }
  const oldId = unit.commanderArtifactId;
  if (oldId && oldId !== newArtifactId) {
    const old = state.artifacts[oldId];
    if (!old || old.attachedUnitId !== unitId) throw new Error("Current Commander is invalid");
    delete old.attachedUnitId;
  }
  unit.attachedArtifactIds = [...new Set([
    ...(unit.attachedArtifactIds ?? []).filter((id) => id !== oldId), newArtifactId,
  ])];
  next.attachedUnitId = unitId;
  unit.commanderArtifactId = newArtifactId;
  synchronizeUnitProjection(state, unitId);
}

export interface FormationDamageResult {
  actualLostHealth: number;
  destroyedFormationIds: string[];
  healthAfter: number;
}

function distributeShares(damage: number, count: number): number[] {
  // TODO(DAMAGE-REMAINDER-001): this stable ID-order remainder allocator is a
  // replaceable technical strategy, not a settled gameplay priority.
  if (!Number.isInteger(damage)) return Array.from({ length: count }, () => damage / count);
  const whole = Math.floor(damage / count);
  const remainder = damage - whole * count;
  return Array.from({ length: count }, (_, index) => whole + (index < remainder ? 1 : 0));
}

export function applyFormationDamage(
  state: GameState,
  unitId: number,
  incomingDamage: number,
): FormationDamageResult {
  const unit = state.fleets[unitId];
  if (!unit || !Number.isInteger(incomingDamage) || incomingDamage < 0) {
    throw new Error("Invalid Unit damage");
  }
  const before = calculateUnitDerived(state, unitId);
  if (!before) throw new Error("Unit not found");
  let remaining = incomingDamage;
  let actualLostHealth = 0;
  const destroyedFormationIds: string[] = [];
  while (remaining > 0) {
    const living = (unit.formationIds ?? [])
      .map((id) => state.formations?.[id])
      .filter((formation): formation is FormationInstance => Boolean(formation && formation.currentHealth > 0))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (living.length === 0) break;
    const shares = distributeShares(remaining, living.length);
    let applied = 0;
    for (let index = 0; index < living.length; index += 1) {
      const formation = living[index];
      const lost = Math.min(formation.currentHealth, shares[index]);
      formation.currentHealth -= lost;
      applied += lost;
      if (formation.currentHealth <= 0) {
        destroyedFormationIds.push(formation.id);
        unit.formationIds = (unit.formationIds ?? []).filter((id) => id !== formation.id);
        delete state.formations?.[formation.id];
      }
    }
    if (applied <= 0) break;
    actualLostHealth += applied;
    remaining -= applied;
  }
  if (before.maxHealth > 0 && actualLostHealth > 0) {
    // TODO(MORALE-PRECISION-001): retain fractional morale; no rounding.
    unit.morale = Math.max(-100, (unit.morale ?? 0) - actualLostHealth / before.maxHealth * 10);
  }
  synchronizeUnitProjection(state, unitId);
  const after = calculateUnitDerived(state, unitId);
  if ((unit.formationIds ?? []).length === 0) {
    unit.health = 0;
    unit.combatPower = 0;
  }
  return { actualLostHealth, destroyedFormationIds, healthAfter: after?.currentHealth ?? 0 };
}
