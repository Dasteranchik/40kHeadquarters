import type { DetectionObjectKind } from "../../detectionDomain";
import { appendAudit } from "../../systems/auditSystem";
import type { GameState, TurnResolution } from "../../types";

export interface UnitResolutionContext {
  ownerByFleetId: Map<number, number>;
  fleetNameById: Map<number, string>;
}

function detectionKindLabel(kind: DetectionObjectKind): string {
  switch (kind) {
    case "PLANET": return "планета";
    case "FLEET": return "флот";
    case "STATION": return "станция";
    case "SHIPWRECK": return "кораблекрушение";
    case "ANOMALY": return "аномалия";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function captureUnitResolutionContext(state: GameState): UnitResolutionContext {
  const ownerByFleetId = new Map<number, number>();
  const fleetNameById = new Map<number, string>();

  for (const fleet of Object.values(state.fleets)) {
    ownerByFleetId.set(fleet.id, fleet.ownerPlayerId);
    fleetNameById.set(
      fleet.id,
      `${fleet.domain === "GROUND" ? "Армия" : "Флот"} ${fleet.id}`,
    );
  }

  return { ownerByFleetId, fleetNameById };
}

export function appendTurnResolutionEvents(
  state: GameState,
  resolution: TurnResolution,
  context: UnitResolutionContext,
): void {
  const { ownerByFleetId, fleetNameById } = context;

  for (const movement of resolution.movement.executed) {
    const ownerId = ownerByFleetId.get(movement.fleetId);
    if (!ownerId) continue;
    state.events.push({
      id: state.nextIds.event++,
      turnNumber: resolution.turnNumber,
      kind: "MOVEMENT",
      message: `${fleetNameById.get(movement.fleetId) ?? `Юнит ${movement.fleetId}`} перемещён [${movement.from.q},${movement.from.r}] → [${movement.to.q},${movement.to.r}]`,
      playerIds: [ownerId],
    });
  }

  for (const combat of resolution.combat.damageEvents) {
    const targetOwnerId = ownerByFleetId.get(combat.fleetId);
    const attackerOwnerIds = combat.attackerFleetIds
      .map((fleetId) => ownerByFleetId.get(fleetId))
      .filter((ownerId): ownerId is number => ownerId !== undefined);
    const playerIds = [
      ...new Set([...(targetOwnerId ? [targetOwnerId] : []), ...attackerOwnerIds]),
    ];
    if (playerIds.length === 0) continue;
    const destroyed = resolution.combat.destroyedFleetIds.includes(combat.fleetId);
    state.events.push({
      id: state.nextIds.event++,
      turnNumber: resolution.turnNumber,
      kind: "COMBAT",
      message: `${fleetNameById.get(combat.fleetId) ?? `Юнит ${combat.fleetId}`} получил ${combat.damage} урона${destroyed ? " и был уничтожен" : `; ОЗ ${combat.healthAfter}`}`,
      playerIds,
    });
  }

  for (const relation of resolution.diplomacy.declaredWars) {
    state.events.push({
      id: state.nextIds.event++,
      turnNumber: resolution.turnNumber,
      kind: "DIPLOMACY",
      message: `Игроки ${relation.playerAId} и ${relation.playerBId} теперь находятся в состоянии войны`,
      playerIds: [relation.playerAId, relation.playerBId],
    });
  }

  for (const relation of resolution.diplomacy.formedAlliances) {
    state.events.push({
      id: state.nextIds.event++,
      turnNumber: resolution.turnNumber,
      kind: "DIPLOMACY",
      message: `Игроки ${relation.playerAId} и ${relation.playerBId} заключили союз`,
      playerIds: [relation.playerAId, relation.playerBId],
    });
  }

  for (const detection of resolution.detection) {
    for (const record of detection.detected) {
      state.events.push({
        id: state.nextIds.event++,
        turnNumber: resolution.turnNumber,
        kind: "DETECTION",
        message: `Обнаружен объект: ${detectionKindLabel(record.objectKind)} ${record.objectId} (${record.confidence === "EXACT" ? "точно" : "оценочно"})`,
        playerIds: [record.playerId],
      });
    }
  }

  for (const shipwreckId of resolution.combat.createdShipwreckIds) {
    const wreck = state.shipwrecks[shipwreckId];
    if (!wreck) continue;
    const playerIds = wreck.sourceUnitIds
      .map((unitId) => ownerByFleetId.get(unitId))
      .filter((id): id is number => id !== undefined);
    state.events.push({
      id: state.nextIds.event++,
      turnNumber: resolution.turnNumber,
      kind: "SHIPWRECK",
      message: `Кораблекрушение ${shipwreckId} образовалось в [${wreck.position.q},${wreck.position.r}]`,
      playerIds: [...new Set(playerIds)],
    });
    appendAudit(state, {
      actor: { kind: "SYSTEM", id: "combat-resolution" },
      operation: "CREATE_SHIPWRECK",
      entityType: "SHIPWRECK",
      entityId: shipwreckId,
      after: wreck,
    });
  }

  for (const change of resolution.administratum) {
    state.events.push({
      id: state.nextIds.event++,
      turnNumber: resolution.turnNumber,
      kind: "ADMINISTRATUM",
      message: `Администратум изменил десятину мира ${change.planetId}: ${change.titheLevel}`,
      playerIds: change.notifiedPlayerIds,
    });
    appendAudit(state, {
      actor: { kind: "SYSTEM", id: "administratum-resolution" },
      operation: "APPLY_TITHE_PROPOSAL",
      entityType: "PLANET",
      entityId: change.planetId,
      after: { titheLevel: change.titheLevel },
    });
  }
}
