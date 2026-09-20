import { CURRENT_SCHEMA_VERSION, type DocumentSnapshot } from "../snapshot";
import { migrateV1ToV2, type SchemaV1Snapshot, type SchemaV2Snapshot } from "./v1ToV2";
import { migrateV2ToV3 } from "./v2ToV3";

function isBaseSnapshot(value: unknown): value is SchemaV1Snapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Boolean(candidate.gameState && candidate.accounts && typeof candidate.accounts === "object");
}

export function migrateDocumentSnapshot(input: unknown): DocumentSnapshot {
  if (!isBaseSnapshot(input)) throw new Error("Invalid document snapshot");

  const rawVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  const version = rawVersion === undefined ? 1 : rawVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error("Invalid snapshot schemaVersion");
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Snapshot schema v${version} is newer than supported v${CURRENT_SCHEMA_VERSION}`,
    );
  }

  let current: unknown = input;
  let currentVersion = version;
  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    switch (currentVersion) {
      case 1:
        current = migrateV1ToV2(current as SchemaV1Snapshot);
        currentVersion = 2;
        break;
      case 2:
        current = migrateV2ToV3(current as SchemaV2Snapshot);
        currentVersion = 3;
        break;
      default: {
        const exhaustive: never = currentVersion as never;
        throw new Error(`No migration registered for schema v${exhaustive}`);
      }
    }
  }

  return structuredClone(current) as DocumentSnapshot;
}
