import type { DoctrineDefinition } from "../../doctrineDomain";
import type { TagConditions, UnitEffect } from "../../effectDomain";
import type { FormationInstance } from "../../formationDomain";
import type { ItemKindDefinition, ItemType } from "../../itemDomain";
import type { TagDefinition, TagRelation } from "../../tagDomain";
import type { GameState } from "../../types";
import { normalizeWarpVisibility } from "../../navigationDomain";

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid v4 collection");
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    throw new Error(`Invalid ${field}`);
  }
  return [...new Set(value)];
}

function formationOwner(value: unknown): FormationInstance["owner"] {
  const raw = objectRecord(value);
  const positive = (entry: unknown): entry is number => Number.isInteger(entry) && Number(entry) > 0;
  switch (raw.kind) {
    case "UNIT": if (positive(raw.unitId)) return { kind: "UNIT", unitId: raw.unitId }; break;
    case "FLEET": if (positive(raw.fleetId)) return { kind: "FLEET", fleetId: raw.fleetId }; break;
    case "PLANET_STORAGE": if (positive(raw.planetId) && positive(raw.playerId))
      return { kind: "PLANET_STORAGE", planetId: raw.planetId, playerId: raw.playerId }; break;
    case "PLANET_SHOP": if (positive(raw.planetId)) return { kind: "PLANET_SHOP", planetId: raw.planetId }; break;
    case "STATION_STORAGE": if (positive(raw.stationId) && positive(raw.playerId))
      return { kind: "STATION_STORAGE", stationId: raw.stationId, playerId: raw.playerId }; break;
    case "STATION_SHOP": if (positive(raw.stationId)) return { kind: "STATION_SHOP", stationId: raw.stationId }; break;
    case "PLANET_SECRET": if (positive(raw.planetId)) return { kind: "PLANET_SECRET", planetId: raw.planetId }; break;
    case "STATION_SECRET": if (positive(raw.stationId)) return { kind: "STATION_SECRET", stationId: raw.stationId }; break;
    case "SHIPWRECK": if (positive(raw.shipwreckId)) return { kind: "SHIPWRECK", shipwreckId: raw.shipwreckId }; break;
  }
  throw new Error("Invalid Formation owner");
}

function conditions(value: unknown): TagConditions {
  const raw = objectRecord(value);
  return {
    requiresAllTags: stringArray(raw.requiresAllTags ?? [], "requiresAllTags"),
    requiresAnyTags: stringArray(raw.requiresAnyTags ?? [], "requiresAnyTags"),
    forbiddenTags: stringArray(raw.forbiddenTags ?? [], "forbiddenTags"),
  };
}

export function parseUnitEffects(value: unknown): UnitEffect[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid effects");
  return value.map((entry) => {
    const raw = objectRecord(entry);
    const base = { conditions: conditions(raw.conditions) };
    if (raw.kind === "ADD_TAG") {
      if (typeof raw.tagId !== "string" || !raw.tagId) throw new Error("Invalid ADD_TAG effect");
      return { ...base, kind: "ADD_TAG", tagId: raw.tagId };
    }
    if (raw.kind !== "ADD_COMBAT_POWER" && raw.kind !== "MULTIPLY_COMBAT_POWER" && raw.kind !== "ADD_MORALE") {
      throw new Error("Unknown unit effect");
    }
    const magnitude = objectRecord(raw.magnitude);
    if (magnitude.kind === "FIXED" && typeof magnitude.value === "number" && Number.isFinite(magnitude.value)) {
      return { ...base, kind: raw.kind, magnitude: { kind: "FIXED", value: magnitude.value } };
    }
    if (magnitude.kind === "MORALE_FACTOR" && typeof magnitude.factor === "number" && Number.isFinite(magnitude.factor)) {
      return { ...base, kind: raw.kind, magnitude: { kind: "MORALE_FACTOR", factor: magnitude.factor } };
    }
    throw new Error("Invalid unit effect magnitude");
  });
}

const ITEM_TYPES = new Set<ItemType>(["RAW", "PRODUCT", "ARTIFACT", "KNOWLEDGE"]);

export function normalizeNewModelCollections(state: GameState): void {
  const raw = state as GameState;
  const tags: Record<string, TagDefinition> = {};
  for (const [id, value] of Object.entries(objectRecord(raw.tags))) {
    const entry = objectRecord(value);
    if (entry.id !== id || typeof entry.name !== "string" || !entry.name) throw new Error(`Invalid Tag ${id}`);
    tags[id] = {
      id,
      name: entry.name,
      ...(typeof entry.description === "string" ? { description: entry.description } : {}),
      parentTagIds: stringArray(entry.parentTagIds ?? [], `Tag ${id} parents`),
    };
  }
  state.tags = tags;
  if (!Array.isArray(raw.tagRelations ?? [])) throw new Error("Invalid Tag relations");
  state.tagRelations = (raw.tagRelations ?? []).map((value): TagRelation => {
    const entry = objectRecord(value);
    if (typeof entry.tagAId !== "string" || typeof entry.tagBId !== "string"
      || (entry.relation !== "ALLY" && entry.relation !== "NEUTRAL" && entry.relation !== "HOSTILE")) {
      throw new Error("Invalid Tag relation");
    }
    return { tagAId: entry.tagAId, tagBId: entry.tagBId, relation: entry.relation };
  });
  const itemKinds: Record<string, ItemKindDefinition> = {};
  for (const [id, value] of Object.entries(objectRecord(raw.itemKinds))) {
    const entry = objectRecord(value);
    if (entry.id !== id || !ITEM_TYPES.has(entry.type as ItemType)
      || typeof entry.name !== "string" || !entry.name) throw new Error(`Invalid Item Kind ${id}`);
    itemKinds[id] = {
      id, type: entry.type as ItemType, name: entry.name,
      ...(typeof entry.description === "string" ? { description: entry.description } : {}),
      tags: stringArray(entry.tags ?? [], `Item Kind ${id} tags`),
      ...(typeof entry.baseCombatPower === "number" ? { baseCombatPower: entry.baseCombatPower } : {}),
      ...(typeof entry.maxHealth === "number" ? { maxHealth: entry.maxHealth } : {}),
      ...(entry.effects !== undefined ? { effects: parseUnitEffects(entry.effects) } : {}),
      ...(typeof entry.commanderCapable === "boolean" ? { commanderCapable: entry.commanderCapable } : {}),
      ...(typeof entry.isNavigator === "boolean" ? { isNavigator: entry.isNavigator } : {}),
      ...(entry.warpVisibility === null || typeof entry.warpVisibility === "number"
        ? { warpVisibility: normalizeWarpVisibility(entry.warpVisibility) } : {}),
      ...(entry.configuration !== undefined
        ? { configuration: objectRecord(entry.configuration) as ItemKindDefinition["configuration"] } : {}),
    };
  }
  state.itemKinds = itemKinds;
  const formations: Record<string, FormationInstance> = {};
  for (const [id, value] of Object.entries(objectRecord(raw.formations))) {
    const entry = objectRecord(value);
    if (entry.id !== id || entry.type !== "PRODUCT" || typeof entry.kind !== "string"
      || typeof entry.name !== "string" || typeof entry.baseCombatPower !== "number"
      || typeof entry.maxHealth !== "number" || typeof entry.currentHealth !== "number") {
      throw new Error(`Invalid Formation ${id}`);
    }
    formations[id] = {
      id, type: "PRODUCT", kind: entry.kind, name: entry.name,
      baseCombatPower: entry.baseCombatPower,
      maxHealth: entry.maxHealth,
      currentHealth: entry.currentHealth,
      tags: stringArray(entry.tags ?? [], `Formation ${id} tags`),
      owner: formationOwner(entry.owner),
    };
  }
  state.formations = formations;
  const doctrines: Record<string, DoctrineDefinition> = {};
  for (const [id, value] of Object.entries(objectRecord(raw.doctrines))) {
    const entry = objectRecord(value);
    if (entry.id !== id || typeof entry.name !== "string" || typeof entry.description !== "string") {
      throw new Error(`Invalid Doctrine ${id}`);
    }
    doctrines[id] = {
      id, name: entry.name, description: entry.description,
      tagRequirements: conditions(entry.tagRequirements),
      effects: parseUnitEffects(entry.effects),
    };
  }
  state.doctrines = doctrines;
}
