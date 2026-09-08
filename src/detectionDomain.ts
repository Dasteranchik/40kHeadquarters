export type DetectionObjectKind =
  | "PLANET"
  | "FLEET"
  | "STATION"
  | "SHIPWRECK"
  | "ANOMALY";

export type DetectionConfidence = "EXACT" | "ESTIMATED";

export interface DetectionRecord {
  playerId: number;
  detectedByUnitId: number;
  objectKind: DetectionObjectKind;
  objectId: number;
  detectedAtTurn: number;
  confidence: DetectionConfidence;
}

export interface DetectionState {
  recordsByPlayerId: Record<string, Record<string, DetectionRecord>>;
}

export interface DetectionResult {
  observerFleetId: number;
  playerId: number;
  roll: number;
  dieSize: number;
  detected: DetectionRecord[];
  unresolvedStealthObjectKeys: string[];
}

export function detectionObjectKey(kind: DetectionObjectKind, id: number): string {
  return `${kind}:${id}`;
}
