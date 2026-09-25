import type { GameState } from "../../types";
import type { SchemaV3Snapshot } from "./v2ToV3";

export interface SchemaV4Snapshot extends Omit<SchemaV3Snapshot, "schemaVersion"> {
  schemaVersion: 4;
}

export function migrateV3ToV4(snapshot: SchemaV3Snapshot): SchemaV4Snapshot {
  const gameState = structuredClone(snapshot.gameState) as GameState;
  gameState.formations ??= {};
  gameState.itemKinds ??= {};
  gameState.tags ??= {};
  gameState.tags.STEALTH ??= { id: "STEALTH", name: "Stealth", parentTagIds: [] };
  gameState.tagRelations ??= [];
  gameState.doctrines ??= {};
  gameState.nextIds.formation ??= 1;
  for (const unit of Object.values(gameState.fleets)) {
    unit.name ??= `${unit.domain === "GROUND" ? "Army" : "Fleet"} ${unit.id}`;
    unit.morale ??= 0;
    unit.commanderArtifactId ??= null;
    unit.formationIds ??= [];
    unit.attachedArtifactIds ??= [];
    unit.assignedDoctrineIds ??= [];
    // TODO(UNIT-VARIANT-MIGRATION): retain UnitVariant metadata, never derive
    // formation combat statistics from a legacy variant.
    // TODO(EMPTY-UNIT-001): legacy units have no inferred formations. Their
    // historic combat fields are retained solely for compatibility.
  }
  for (const planet of Object.values(gameState.planets)) {
    if (Number.isFinite(planet.morale)) {
      planet.morale = Math.max(-100, Math.min(100, planet.morale));
    }
  }
  // Stackable REGIMENTS remain in legacy inventories, without fabricated kinds.
  return { ...snapshot, schemaVersion: 4, gameState };
}
