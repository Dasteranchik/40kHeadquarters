import type { ItemInventory, StackableInventory } from "../itemDomain";
import type { SecretStorage, SecretStorageTypeKey } from "../secretStorageDomain";
import { verifyPassword } from "../secretStorageDomain";
import type { GameState } from "../types";

export type SecretStorageTarget = { kind: "PLANET" | "STATION"; id: number };

export interface SecretStorageContents {
  allowedTypeKeys: SecretStorageTypeKey[];
  stackableInventory: StackableInventory;
  itemInventory: ItemInventory;
}

export interface SecretStorageOpenResult {
  ok: boolean;
  message: string;
  contents?: SecretStorageContents;
}

export function getSecretStorage(
  state: GameState,
  target: SecretStorageTarget,
): SecretStorage | undefined {
  return target.kind === "PLANET"
    ? state.planets[target.id]?.secretStorage
    : state.stations[target.id]?.secretStorage;
}

export function openSecretStorage(
  state: GameState,
  target: SecretStorageTarget,
  password: string,
): SecretStorageOpenResult {
  const storage = getSecretStorage(state, target);
  if (!storage?.enabled) return { ok: false, message: "Секретное хранилище отключено" };
  if (!verifyPassword(password, storage.passwordVerifier)) {
    return { ok: false, message: "Неверный пароль секретного хранилища" };
  }
  return {
    ok: true,
    message: "Секретное хранилище открыто",
    contents: {
      allowedTypeKeys: [...storage.allowedTypeKeys],
      stackableInventory: { ...storage.stackableInventory },
      itemInventory: {
        artifactIds: [...storage.itemInventory.artifactIds],
        knowledge: [...storage.itemInventory.knowledge],
      },
    },
  };
}

