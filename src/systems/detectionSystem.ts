import {
  detectionObjectKey,
  type DetectionConfidence,
  type DetectionObjectKind,
  type DetectionRecord,
  type DetectionResult,
} from "../detectionDomain";
import { SYSTEM_KNOWLEDGE } from "../itemDomain";
import type { Fleet, GameState, HexCoord } from "../types";
import { getObjectsAtHex, type WorldObject } from "../worldObjectDomain";
import { calculateUnitDerived } from "./unitEffectSystem";

export type DetectionRng = () => number;
export type DetectionTier = 1 | 2 | 3;

function objectHasStealth(state: GameState, object: WorldObject): boolean {
  if (object.kind !== "FLEET") return (object.value.tags ?? []).includes("STEALTH");
  const unit = object.value;
  if ((unit.formationIds ?? []).length === 0) return unit.tags.includes("STEALTH");
  return calculateUnitDerived(state, unit.id)?.effectiveTags.some((tag) => tag.tagId === "STEALTH") ?? false;
}

function rollDie(size: number, rng: DetectionRng): number {
  const sample = rng();
  const normalized = Number.isFinite(sample)
    ? Math.min(0.999999999999, Math.max(0, sample)) : 0;
  return Math.floor(normalized * size) + 1;
}

export function classifyDetectionTier(roll: number, dieSize: number): DetectionTier | null {
  if (!Number.isInteger(roll) || !Number.isInteger(dieSize)
    || dieSize <= 0 || roll < 1 || roll > dieSize) return null;
  if (roll <= Math.ceil(dieSize / 4)) return 1;
  if (roll <= Math.ceil(dieSize / 2)) return 2;
  return 3;
}

function tierDetects(tier: DetectionTier, object: WorldObject, stealth: boolean): boolean {
  if (tier === 1) return true;
  if (stealth) return false;
  if (tier === 2) return true;
  return object.kind === "FLEET" || object.kind === "PLANET";
}

function detectionConfidence(observer: Fleet): DetectionConfidence {
  return observer.itemInventory.knowledge.includes(SYSTEM_KNOWLEDGE.EXACT_AUSPEX)
    ? "EXACT" : "ESTIMATED";
}

function rememberDetection(state: GameState, observer: Fleet, object: WorldObject): DetectionRecord {
  const playerRecords = state.detection.recordsByPlayerId[String(observer.ownerPlayerId)] ??= {};
  const key = detectionObjectKey(object.kind, object.id);
  const previous = playerRecords[key];
  const record: DetectionRecord = {
    playerId: observer.ownerPlayerId,
    detectedByUnitId: observer.id,
    objectKind: object.kind,
    objectId: object.id,
    detectedHex: { ...object.value.position },
    detectedAtTurn: state.turnNumber,
    confidence: previous?.confidence === "EXACT" ? "EXACT" : detectionConfidence(observer),
  };
  playerRecords[key] = record;
  return record;
}

export function detectObjectsForFleetAtCurrentHex(
  state: GameState,
  fleetId: number,
  rng: DetectionRng = Math.random,
): DetectionResult | null {
  const observer = state.fleets[fleetId];
  if (!observer || observer.domain !== "SPACE") return null;
  const dieSize = (observer.formationIds ?? []).length > 0
    ? calculateUnitDerived(state, fleetId)?.currentHealth ?? 0
    : observer.health; // TODO(UNIT-VARIANT-MIGRATION): legacy Unit compatibility.
  if (!Number.isInteger(dieSize) || dieSize <= 0) return null;
  const roll = rollDie(dieSize, rng);
  const tier = classifyDetectionTier(roll, dieSize);
  if (!tier) return null;
  const detected: DetectionRecord[] = [];
  const unresolvedStealthObjectKeys: string[] = [];
  for (const object of getObjectsAtHex(state, observer.position)) {
    if (object.kind === "FLEET" && object.value.ownerPlayerId === observer.ownerPlayerId) continue;
    if (tierDetects(tier, object, objectHasStealth(state, object))) {
      detected.push(rememberDetection(state, observer, object));
    } else {
      unresolvedStealthObjectKeys.push(detectionObjectKey(object.kind, object.id));
    }
  }
  return { observerFleetId: observer.id, playerId: observer.ownerPlayerId, roll, dieSize,
    detected, unresolvedStealthObjectKeys };
}

export function getDetectionRecord(
  state: GameState,
  playerId: number,
  kind: DetectionObjectKind,
  objectId: number,
): DetectionRecord | undefined {
  return state.detection.recordsByPlayerId[String(playerId)]?.[detectionObjectKey(kind, objectId)];
}

export function detectionMatchesPosition(record: DetectionRecord | undefined, position: HexCoord): boolean {
  return Boolean(record?.detectedHex
    && record.detectedHex.q === position.q && record.detectedHex.r === position.r);
}

export function hasDetectedObject(
  state: GameState,
  playerId: number,
  kind: DetectionObjectKind,
  objectId: number,
): boolean {
  const position = kind === "PLANET" ? state.planets[objectId]?.position
    : kind === "FLEET" ? state.fleets[objectId]?.position
    : kind === "STATION" ? state.stations[objectId]?.position
    : kind === "SHIPWRECK" ? state.shipwrecks[objectId]?.position
    : state.anomalies[objectId]?.position;
  return Boolean(position && detectionMatchesPosition(getDetectionRecord(state, playerId, kind, objectId), position));
}
