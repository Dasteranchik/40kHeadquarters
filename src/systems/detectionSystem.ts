import {
  detectionObjectKey,
  type DetectionConfidence,
  type DetectionRecord,
  type DetectionResult,
} from "../detectionDomain";
import { SYSTEM_KNOWLEDGE } from "../itemDomain";
import type { Fleet, GameState } from "../types";
import { hasUnitTag } from "../unitDomain";
import { getObjectsAtHex, type WorldObject } from "../worldObjectDomain";

export type DetectionRng = () => number;

function objectHasStealth(object: WorldObject): boolean {
  switch (object.kind) {
    case "FLEET":
    case "STATION":
    case "ANOMALY":
      return hasUnitTag(object.value, "STEALTH");
    case "PLANET":
    case "SHIPWRECK":
      return false;
    default: {
      const exhaustive: never = object;
      return Boolean(exhaustive);
    }
  }
}

function isAutomaticDetection(observer: Fleet, object: WorldObject): boolean {
  if (objectHasStealth(object)) return false;
  switch (object.kind) {
    case "PLANET":
      return true;
    case "FLEET":
      return object.id !== observer.id && object.value.ownerPlayerId !== observer.ownerPlayerId;
    case "STATION":
    case "SHIPWRECK":
    case "ANOMALY":
      return false;
    default: {
      const exhaustive: never = object;
      return Boolean(exhaustive);
    }
  }
}

function rollDie(size: number, rng: DetectionRng): number {
  const sample = rng();
  const normalized = Number.isFinite(sample)
    ? Math.min(0.999999999999, Math.max(0, sample))
    : 0;
  return Math.floor(normalized * size) + 1;
}

export function classifyDetectionTier(
  _roll: number,
  _dieSize: number,
): null {
  // TODO(DEC-009): X/4 and X/2 rounding is a game decision. Do not silently
  // choose floor/ceil/round here. Automatic detection remains usable.
  return null;
}

function detectionConfidence(observer: Fleet): DetectionConfidence {
  return observer.itemInventory.knowledge.includes(SYSTEM_KNOWLEDGE.EXACT_AUSPEX)
    ? "EXACT"
    : "ESTIMATED";
}

function rememberDetection(
  state: GameState,
  observer: Fleet,
  object: WorldObject,
): DetectionRecord {
  const record: DetectionRecord = {
    playerId: observer.ownerPlayerId,
    detectedByUnitId: observer.id,
    objectKind: object.kind,
    objectId: object.id,
    detectedAtTurn: state.turnNumber,
    confidence: detectionConfidence(observer),
  };
  const playerRecords = state.detection.recordsByPlayerId[String(observer.ownerPlayerId)] ??= {};
  playerRecords[detectionObjectKey(record.objectKind, record.objectId)] = record;
  return record;
}

export function detectObjectsForFleetAtCurrentHex(
  state: GameState,
  fleetId: number,
  rng: DetectionRng = Math.random,
): DetectionResult | null {
  const observer = state.fleets[fleetId];
  if (!observer) return null;
  const dieSize = 4;
  const roll = rollDie(dieSize, rng);
  const detected: DetectionRecord[] = [];
  const unresolvedStealthObjectKeys: string[] = [];
  for (const object of getObjectsAtHex(state, observer.position)) {
    if (object.kind === "FLEET" && object.id === observer.id) continue;
    if (isAutomaticDetection(observer, object)) {
      detected.push(rememberDetection(state, observer, object));
      continue;
    }
    if (object.kind === "FLEET" && object.value.ownerPlayerId === observer.ownerPlayerId) {
      continue;
    }
    unresolvedStealthObjectKeys.push(detectionObjectKey(object.kind, object.id));
  }
  classifyDetectionTier(roll, dieSize);
  return {
    observerFleetId: observer.id,
    playerId: observer.ownerPlayerId,
    roll,
    dieSize,
    detected,
    unresolvedStealthObjectKeys,
  };
}

export function hasDetectedObject(
  state: GameState,
  playerId: number,
  kind: DetectionRecord["objectKind"],
  objectId: number,
): boolean {
  return Boolean(
    state.detection.recordsByPlayerId[String(playerId)]?.[
      detectionObjectKey(kind, objectId)
    ],
  );
}

export function getDetectionRecord(
  state: GameState,
  playerId: number,
  kind: DetectionRecord["objectKind"],
  objectId: number,
): DetectionRecord | undefined {
  return state.detection.recordsByPlayerId[String(playerId)]?.[
    detectionObjectKey(kind, objectId)
  ];
}
