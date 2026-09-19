import { computePopulationProduction, isInfoCategory, isResourceKey } from "../../planetDomain";
import { Account } from "../contracts";
import { HexCoord, IntelFragmentMap, Planet, PlayerProductStorages, ResourceStore, Tile, GameState } from "../../types";
import { isFiniteNumber } from "../../utils/validation";
import {
  createPasswordVerifier,
  secretStorageAllowsArtifact,
  validateAllowedTypeKeys,
  type SecretStorage,
} from "../../secretStorageDomain";
import { isKnowledgeCode } from "../../itemDomain";

export function getTileAt(state: GameState, coord: HexCoord): Tile | null {
  return state.map.tiles.find((tile) => tile.q === coord.q && tile.r === coord.r) ?? null;
}

export function parseResourceStore(value: unknown, allowFraction = false): ResourceStore | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: ResourceStore = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isResourceKey(key) || !isFiniteNumber(raw)) {
      return null;
    }

    const amount = Math.max(0, allowFraction ? Math.round(raw * 100) / 100 : Math.trunc(raw));
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

export function parsePlayerProductStorages(
  value: unknown,
  state: GameState,
): PlayerProductStorages | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: PlayerProductStorages = {};
  for (const [playerId, rawStore] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(playerId)) || !state.players[playerId]) {
      return null;
    }
    const store = parseResourceStore(rawStore, true);
    if (store === null) {
      return null;
    }
    result[playerId] = store;
  }
  return result;
}

export function parseIntelFragments(value: unknown): IntelFragmentMap | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: IntelFragmentMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isInfoCategory(key) || !isFiniteNumber(raw)) {
      return null;
    }

    const amount = Math.max(0, Math.trunc(raw));
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

export function computePlanetResourceProduction(planet: Planet): number {
  const generatedResourceCount = Object.values(planet.resourceGeneration)
    .filter((enabled) => typeof enabled === "number" && enabled > 0).length;
  return Math.round(
    computePopulationProduction(planet.population) * generatedResourceCount * 100,
  ) / 100;
}

export function setPlanetResourceProduction(planet: Planet): void {
  planet.resourceProduction = computePlanetResourceProduction(planet);
}

export function getDefaultFactionId(state: GameState): number | null {
  const factionIds = Object.values(state.factions).map((entry) => entry.id).sort((a, b) => a - b);
  return factionIds[0] ?? null;
}

export function findPlayerAccount(
  accounts: Map<string, Account>,
  playerId: number,
): [string, Account] | null {
  for (const entry of accounts.entries()) {
    const [, account] = entry;
    if (account.playerId === playerId && account.role === "player") {
      return entry;
    }
  }

  return null;
}

export function removeAccountsForPlayer(accounts: Map<string, Account>, playerId: number): void {
  for (const [username, account] of accounts.entries()) {
    if (account.playerId === playerId && account.role === "player") {
      accounts.delete(username);
    }
  }
}

export type SecretStorageParseResult =
  | { ok: true; storage: SecretStorage | undefined }
  | { ok: false; error: string };

export function parseSecretStorageUpdate(
  state: GameState,
  value: unknown,
  current?: SecretStorage,
): SecretStorageParseResult {
  if (!value || typeof value !== "object") return { ok: false, error: "secretStorage must be an object" };
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== "boolean") return { ok: false, error: "secretStorage.enabled must be boolean" };
  if (!input.enabled && !current && input.password === undefined) {
    return { ok: true, storage: undefined };
  }
  if (input.password !== undefined && typeof input.password !== "string") {
    return { ok: false, error: "secretStorage.password must be a string" };
  }
  const allowedTypeKeys = input.allowedTypeKeys === undefined
    ? current?.allowedTypeKeys
    : validateAllowedTypeKeys(input.allowedTypeKeys);
  if (!allowedTypeKeys) return { ok: false, error: "secretStorage.allowedTypeKeys must contain 1 to 3 unique valid type keys" };
  const passwordVerifier = typeof input.password === "string"
    ? createPasswordVerifier(input.password)
    : current?.passwordVerifier;
  if (!passwordVerifier) return { ok: false, error: "secretStorage.password is required when storage is created" };
  const stackableInventory = input.stackableInventory === undefined
    ? { ...(current?.stackableInventory ?? {}) }
    : parseResourceStore(input.stackableInventory, true);
  if (stackableInventory === null) return { ok: false, error: "Invalid secretStorage.stackableInventory" };
  if (Object.keys(stackableInventory).some((key) => !allowedTypeKeys.includes(key as never))) {
    return { ok: false, error: "Secret Storage contains a forbidden resource type" };
  }
  const knowledge = input.knowledge === undefined
    ? [...(current?.itemInventory.knowledge ?? [])]
    : Array.isArray(input.knowledge) && input.knowledge.every(isKnowledgeCode)
      ? [...new Set(input.knowledge)]
      : null;
  if (!knowledge) return { ok: false, error: "Invalid secretStorage.knowledge" };
  if (knowledge.some((code) => !allowedTypeKeys.includes(`KNOWLEDGE:${code}`))) {
    return { ok: false, error: "Secret Storage contains a forbidden Knowledge type" };
  }
  const storage: SecretStorage = {
    enabled: input.enabled,
    passwordVerifier,
    allowedTypeKeys: [...allowedTypeKeys],
    stackableInventory,
    itemInventory: {
      artifactIds: [...(current?.itemInventory.artifactIds ?? [])],
      knowledge,
    },
  };
  for (const artifactId of storage.itemInventory.artifactIds) {
    const artifact = state.artifacts[artifactId];
    if (!artifact || !secretStorageAllowsArtifact(storage, artifact.definitionCode)) {
      return { ok: false, error: `Secret Storage contains forbidden Artifact ${artifactId}` };
    }
  }
  return { ok: true, storage };
}
