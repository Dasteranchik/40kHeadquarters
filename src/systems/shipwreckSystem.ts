import { createEmptyItemInventory, type ItemInventory } from "../itemDomain";
import type { Fleet, GameState, HexCoord } from "../types";
import type { Shipwreck } from "../worldObjectDomain";

export interface ShipwreckItemResult {
  ok: boolean;
  message: string;
}

export function addArtifactToShipwreck(
  shipwreck: Shipwreck,
  artifactId: string,
): ShipwreckItemResult {
  if (shipwreck.inventory.artifactIds.includes(artifactId)) {
    return { ok: false, message: "Shipwreck already contains artifact" };
  }
  shipwreck.inventory.artifactIds.push(artifactId);
  return { ok: true, message: "Artifact added to shipwreck" };
}

export function addKnowledgeToShipwreck(
  shipwreck: Shipwreck,
  knowledge: string,
): ShipwreckItemResult {
  if (!shipwreck.inventory.knowledge.includes(knowledge)) {
    shipwreck.inventory.knowledge.push(knowledge);
  }
  return { ok: true, message: "Knowledge added to shipwreck" };
}

export function addStackableResourceToShipwreck(): ShipwreckItemResult {
  return { ok: false, message: "Shipwrecks cannot contain RAW or PRODUCT resources" };
}

function createOrMergeShipwreck(
  state: GameState,
  position: HexCoord,
  sourceUnitId: number,
  inventory: ItemInventory,
): Shipwreck | null {
  if (inventory.artifactIds.length === 0 && inventory.knowledge.length === 0) return null;
  // TODO(DEC-018): aggregation for simultaneous destruction is undecided.
  // The provisional strategy is isolated here and creates one wreck per source unit.
  const shipwreck: Shipwreck = {
    id: state.nextIds.shipwreck++,
    position: { ...position },
    inventory,
    createdOnTurn: state.turnNumber,
    sourceUnitIds: [sourceUnitId],
  };
  state.shipwrecks[shipwreck.id] = shipwreck;
  return shipwreck;
}

export function salvageDestroyedUnit(state: GameState, unit: Fleet): Shipwreck | null {
  const inventory = createEmptyItemInventory();
  inventory.artifactIds = [...unit.itemInventory.artifactIds];
  inventory.knowledge = [...new Set(unit.itemInventory.knowledge)];
  const shipwreck = createOrMergeShipwreck(state, unit.position, unit.id, inventory);
  if (!shipwreck) return null;
  for (const artifactId of inventory.artifactIds) {
    const artifact = state.artifacts[artifactId];
    if (artifact) artifact.owner = { kind: "SHIPWRECK", shipwreckId: shipwreck.id };
  }
  unit.itemInventory.artifactIds = [];
  unit.itemInventory.knowledge = [];
  return shipwreck;
}
