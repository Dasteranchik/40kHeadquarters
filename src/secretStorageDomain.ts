import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import {
  isResourceKey,
  type ResourceKey,
} from "./planetDomain";
import {
  createEmptyItemInventory,
  isKnowledgeCode,
  type ItemInventory,
  type StackableInventory,
} from "./itemDomain";

export type SecretStorageTypeKey =
  | ResourceKey
  | `ARTIFACT:${string}`
  | `KNOWLEDGE:${string}`;

export interface PasswordVerifier {
  algorithm: "SCRYPT";
  salt: string;
  digest: string;
}

export interface SecretStorage {
  enabled: boolean;
  passwordVerifier: PasswordVerifier;
  allowedTypeKeys: SecretStorageTypeKey[];
  stackableInventory: StackableInventory;
  itemInventory: ItemInventory;
}

export function isSecretStorageTypeKey(value: unknown): value is SecretStorageTypeKey {
  if (isResourceKey(value)) return true;
  if (typeof value !== "string") return false;
  if (value.startsWith("ARTIFACT:")) return value.slice("ARTIFACT:".length).trim().length > 0;
  if (value.startsWith("KNOWLEDGE:")) return isKnowledgeCode(value.slice("KNOWLEDGE:".length));
  return false;
}

export function validateAllowedTypeKeys(value: unknown): SecretStorageTypeKey[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;
  if (value.some((entry) => !isSecretStorageTypeKey(entry))) return null;
  const unique = [...new Set(value as SecretStorageTypeKey[])];
  return unique.length === value.length ? unique : null;
}

export function createPasswordVerifier(password: string): PasswordVerifier {
  const salt = randomBytes(16).toString("hex");
  return {
    algorithm: "SCRYPT",
    salt,
    digest: scryptSync(password, salt, 32).toString("hex"),
  };
}

export function verifyPassword(password: string, verifier: PasswordVerifier): boolean {
  try {
    const expected = Buffer.from(verifier.digest, "hex");
    const actual = scryptSync(password, verifier.salt, expected.length);
    return expected.length > 0 && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function emptySecretStorage(password: string, allowedTypeKeys: SecretStorageTypeKey[]): SecretStorage {
  return {
    enabled: true,
    passwordVerifier: createPasswordVerifier(password),
    allowedTypeKeys: [...allowedTypeKeys],
    stackableInventory: {},
    itemInventory: createEmptyItemInventory(),
  };
}

export function secretStorageAllowsArtifact(storage: SecretStorage, definitionCode: string): boolean {
  return storage.allowedTypeKeys.includes(`ARTIFACT:${definitionCode}`);
}

export function secretStorageAllowsKnowledge(storage: SecretStorage, knowledge: string): boolean {
  return storage.allowedTypeKeys.includes(`KNOWLEDGE:${knowledge}`);
}

