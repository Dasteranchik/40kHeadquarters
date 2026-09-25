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

function createShipwreckForBatch(
  state: GameState,
  position: HexCoord,
  sourceUnitIds: number[],
  inventory: ItemInventory,
): Shipwreck | null {
  if (inventory.artifactIds.length === 0 && inventory.knowledge.length === 0) return null;
  const shipwreck: Shipwreck = {
    id: state.nextIds.shipwreck++,
    position: { ...position },
    inventory,
    createdOnTurn: state.turnNumber,
    sourceUnitIds: [...new Set(sourceUnitIds)].sort((a, b) => a - b),
  };
  state.shipwrecks[shipwreck.id] = shipwreck;
  return shipwreck;
}

export function salvageDestroyedUnit(state: GameState, unit: Fleet): Shipwreck | null {
  return salvageDestroyedUnits(state, [unit])[0] ?? null;
}

export function salvageDestroyedUnits(state: GameState, units: Fleet[]): Shipwreck[] {
  const byHex = new Map<string, Fleet[]>();
  for (const unit of units) {
    const key = `${unit.position.q},${unit.position.r}`;
    const list = byHex.get(key) ?? [];
    list.push(unit);
    byHex.set(key, list);
  }
  const wrecks: Shipwreck[] = [];
  for (const groupedUnits of byHex.values()) {
    const first = groupedUnits[0];
    if (!first) continue;
    const inventory = createEmptyItemInventory();
    inventory.artifactIds = [...new Set(groupedUnits.flatMap((unit) => unit.itemInventory.artifactIds))];
    inventory.knowledge = [...new Set(groupedUnits.flatMap((unit) => unit.itemInventory.knowledge))];
    const shipwreck = createShipwreckForBatch(
      state,
      first.position,
      groupedUnits.map((unit) => unit.id),
      inventory,
    );
    for (const unit of groupedUnits) {
      // Formations do not survive Unit destruction. This also covers an army
      // destroyed together with its carrier before its own HP were depleted.
      for (const formationId of [...(unit.formationIds ?? []), ...(unit.itemInventory.productIds ?? [])]) {
        delete state.formations?.[formationId];
      }
      unit.formationIds = [];
      unit.itemInventory.productIds = [];
      unit.itemInventory.artifactIds = [];
      unit.itemInventory.knowledge = [];
      unit.attachedArtifactIds = [];
      unit.commanderArtifactId = null;
    }
    if (!shipwreck) continue;
    for (const artifactId of inventory.artifactIds) {
      const artifact = state.artifacts[artifactId];
      if (artifact) {
        artifact.owner = { kind: "SHIPWRECK", shipwreckId: shipwreck.id };
        delete artifact.attachedUnitId;
      }
    }
    wrecks.push(shipwreck);
  }
  return wrecks;
}
