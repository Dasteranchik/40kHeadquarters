import { isPasswordHash } from "../auth/password";
import { CURRENT_SCHEMA_VERSION, type DocumentSnapshot } from "../storage/snapshot";
import { coordKey } from "../hex";
import { calculateUnitDerived } from "../systems/unitEffectSystem";
import { expandEffectiveTags } from "../systems/tagSystem";
import { resolveItemInventory } from "../systems/itemSystem";
import type { TagConditions, UnitEffect } from "../effectDomain";

export class StateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateValidationError";
  }
}

export function validateDocumentSnapshot(snapshot: DocumentSnapshot): void {
  if (snapshot.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new StateValidationError("Candidate has an unsupported schema version");
  }
  if (!Number.isInteger(snapshot.gameState.turnNumber) || snapshot.gameState.turnNumber < 0) {
    throw new StateValidationError("Candidate has an invalid turn number");
  }
  if (!(["PLANNING", "RESOLUTION", "UPDATE"] as const).includes(snapshot.gameState.phase)) {
    throw new StateValidationError("Candidate has an invalid game phase");
  }
  const state = snapshot.gameState;
  function validateTagConditions(conditions: TagConditions, label: string): void {
    if ([...conditions.requiresAllTags, ...conditions.requiresAnyTags, ...conditions.forbiddenTags]
      .some((tagId) => !state.tags?.[tagId])) {
      throw new StateValidationError(`${label} references an unknown Tag`);
    }
  }
  function validateEffects(effects: UnitEffect[] | undefined, label: string): void {
    for (const effect of effects ?? []) {
      validateTagConditions(effect.conditions, label);
      if (effect.kind === "ADD_TAG" && !state.tags?.[effect.tagId]) {
        throw new StateValidationError(`${label} grants an unknown Tag`);
      }
    }
  }
  const validHexes = new Set(state.map.tiles.map(coordKey));
  for (const planet of Object.values(state.planets)) {
    if (!Number.isFinite(planet.morale) || planet.morale < -100 || planet.morale > 100) {
      throw new StateValidationError(`Planet ${planet.id} has invalid morale`);
    }
    if ((planet.tags ?? []).some((tagId) => !state.tags?.[tagId])) {
      throw new StateValidationError(`Planet ${planet.id} has an unknown Tag`);
    }
  }
  for (const anomaly of Object.values(state.anomalies)) {
    if (!Number.isFinite(anomaly.moraleLoss ?? 0) || (anomaly.moraleLoss ?? 0) < 0) {
      throw new StateValidationError(`Anomaly ${anomaly.id} has invalid moraleLoss`);
    }
  }
  for (const [id, tag] of Object.entries(state.tags ?? {})) {
    if (tag.id !== id || tag.parentTagIds.some((parent) => !state.tags?.[parent])) {
      throw new StateValidationError(`Tag ${id} has invalid parent references`);
    }
  }
  try {
    expandEffectiveTags(state.tags ?? {}, Object.keys(state.tags ?? {}).map((tagId) => ({
      tagId, sourceType: "TEMPORARY_EFFECT" as const, sourceId: "validation",
    })));
  } catch (error) {
    throw new StateValidationError(`Invalid Tag inheritance: ${(error as Error).message}`);
  }
  for (const relation of state.tagRelations ?? []) {
    if (!state.tags?.[relation.tagAId] || !state.tags?.[relation.tagBId]) {
      throw new StateValidationError("Tag relation has unknown Tag");
    }
  }
  for (const [id, kind] of Object.entries(state.itemKinds ?? {})) {
    if (kind.id !== id || !["RAW", "PRODUCT", "ARTIFACT", "KNOWLEDGE"].includes(kind.type)
      || kind.tags.some((tagId) => !state.tags?.[tagId])
      || (kind.type === "PRODUCT" && (
        (kind.baseCombatPower !== undefined && (!Number.isFinite(kind.baseCombatPower) || kind.baseCombatPower < 0))
        || (kind.maxHealth !== undefined && (!Number.isInteger(kind.maxHealth) || kind.maxHealth <= 0))
      ))) {
      throw new StateValidationError(`Item Kind ${id} is invalid`);
    }
    validateEffects(kind.effects, `Item Kind ${id}`);
  }
  for (const [id, doctrine] of Object.entries(state.doctrines ?? {})) {
    if (doctrine.id !== id) throw new StateValidationError(`Doctrine ${id} has an invalid id`);
    validateTagConditions(doctrine.tagRequirements, `Doctrine ${id}`);
    validateEffects(doctrine.effects, `Doctrine ${id}`);
  }
  for (const [id, formation] of Object.entries(state.formations ?? {})) {
    if (formation.id !== id || formation.type !== "PRODUCT"
      || !Number.isInteger(formation.maxHealth) || formation.maxHealth <= 0
      || !Number.isInteger(formation.currentHealth) || formation.currentHealth < 0
      || formation.currentHealth > formation.maxHealth
      || !Number.isFinite(formation.baseCombatPower) || formation.baseCombatPower < 0) {
      throw new StateValidationError(`Formation ${id} has invalid combat fields`);
    }
    if (state.itemKinds?.[formation.kind]?.type !== "PRODUCT"
      || formation.tags.some((tagId) => !state.tags?.[tagId])) {
      throw new StateValidationError(`Formation ${id} has an unknown Tag`);
    }
  }
  const formationOwners = new Set<string>();
  const attachedArtifacts = new Set<string>();
  for (const unit of Object.values(state.fleets)) {
    if (!Number.isFinite(unit.morale ?? 0) || (unit.morale ?? 0) < -100 || (unit.morale ?? 0) > 100) {
      throw new StateValidationError(`Unit ${unit.id} has invalid morale`);
    }
    const doctrineIds = unit.assignedDoctrineIds ?? [];
    if (new Set(doctrineIds).size !== doctrineIds.length
      || doctrineIds.some((id) => !state.doctrines?.[id])) {
      throw new StateValidationError(`Unit ${unit.id} has duplicate Doctrines`);
    }
    if (new Set(unit.formationIds ?? []).size !== (unit.formationIds ?? []).length) {
      throw new StateValidationError(`Unit ${unit.id} has duplicate Formations`);
    }
    for (const formationId of unit.formationIds ?? []) {
      const formation = state.formations?.[formationId];
      if (!formation || formation.owner.kind !== "UNIT" || formation.owner.unitId !== unit.id
        || formationOwners.has(formationId)) {
        throw new StateValidationError(`Unit ${unit.id} has invalid Formation ${formationId}`);
      }
      formationOwners.add(formationId);
    }
    for (const artifactId of unit.attachedArtifactIds ?? []) {
      const artifact = state.artifacts[artifactId];
      if (!artifact || artifact.attachedUnitId !== unit.id || artifact.owner.kind !== "FLEET"
        || artifact.owner.fleetId !== unit.id || attachedArtifacts.has(artifactId)) {
        throw new StateValidationError(`Unit ${unit.id} has invalid attached Artifact ${artifactId}`);
      }
      attachedArtifacts.add(artifactId);
    }
    if ((unit.formationIds ?? []).length > 0) {
      const commanderId = unit.commanderArtifactId;
      const commander = commanderId ? state.artifacts[commanderId] : undefined;
      if (!commander || !unit.attachedArtifactIds?.includes(commanderId!)
        || !unit.itemInventory.artifactIds.includes(commanderId!)
        || state.itemKinds?.[commander.kind ?? commander.definitionCode]?.commanderCapable !== true) {
        throw new StateValidationError(`Unit ${unit.id} lacks a valid Commander`);
      }
      const derived = calculateUnitDerived(state, unit.id);
      if (!derived || unit.health !== derived.currentHealth || unit.combatPower !== derived.combatPower) {
        throw new StateValidationError(`Unit ${unit.id} has stale derived combat values`);
      }
    }
  }
  for (const formation of Object.values(state.formations ?? {})) {
    if (formation.owner.kind === "UNIT" && !formationOwners.has(formation.id)) {
      throw new StateValidationError(`Formation ${formation.id} has no owning Unit`);
    }
    if (formation.owner.kind !== "UNIT") {
      const inventory = resolveItemInventory(state, formation.owner);
      if (!inventory?.productIds?.includes(formation.id)) {
        throw new StateValidationError(`Formation ${formation.id} has no owning inventory`);
      }
    }
  }
  for (const artifact of Object.values(state.artifacts)) {
    if (state.itemKinds?.[artifact.kind ?? artifact.definitionCode]
      && (artifact.tags ?? []).some((tagId) => !state.tags?.[tagId])) {
      throw new StateValidationError(`Artifact ${artifact.id} has an unknown Tag`);
    }
    validateEffects(artifact.effects, `Artifact ${artifact.id}`);
    if (artifact.attachedUnitId !== undefined && !attachedArtifacts.has(artifact.id)) {
      throw new StateValidationError(`Artifact ${artifact.id} has no attachment owner`);
    }
    if (artifact.attachedUnitId !== undefined && !state.fleets[artifact.attachedUnitId]?.itemInventory.artifactIds.includes(artifact.id)) {
      throw new StateValidationError(`Artifact ${artifact.id} is missing from Unit inventory`);
    }
  }
  for (const records of Object.values(state.detection.recordsByPlayerId)) {
    for (const record of Object.values(records)) {
      if (record.detectedHex && !validHexes.has(coordKey(record.detectedHex))) {
        throw new StateValidationError("Detection record has invalid detectedHex");
      }
    }
  }
  for (const [username, account] of Object.entries(snapshot.accounts)) {
    if (username !== account.username || !username) {
      throw new StateValidationError(`Candidate has an invalid account key: ${username}`);
    }
    if (account.role !== "admin" && account.role !== "player") {
      throw new StateValidationError(`Candidate has an invalid account role: ${username}`);
    }
    if (!isPasswordHash(account.passwordHash)) {
      throw new StateValidationError(`Candidate contains a non-hashed password: ${username}`);
    }
    if (
      account.role === "player"
      && (!account.playerId || !snapshot.gameState.players[account.playerId])
    ) {
      throw new StateValidationError(`Candidate account references an unknown player: ${username}`);
    }
  }
  for (const [token, session] of Object.entries(snapshot.sessions ?? {})) {
    const account = snapshot.accounts[session.username];
    if (
      token !== session.token
      || !account
      || account.role !== session.role
      || account.playerId !== session.playerId
    ) {
      throw new StateValidationError(`Candidate contains an invalid session: ${token}`);
    }
  }
}
