import type { SchemaV2Snapshot } from "./v1ToV2";

export interface SchemaV3Snapshot extends Omit<SchemaV2Snapshot, "schemaVersion"> {
  schemaVersion: 3;
}

export function migrateV2ToV3(snapshot: SchemaV2Snapshot): SchemaV3Snapshot {
  return {
    ...snapshot,
    schemaVersion: 3,
    sessions: snapshot.sessions ?? {},
    turnSnapshots: snapshot.turnSnapshots ?? [],
  };
}
