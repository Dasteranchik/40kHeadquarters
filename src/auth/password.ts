import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const HASH_PREFIX = "scrypt";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return [
    HASH_PREFIX,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64"),
    digest.toString("base64"),
  ].join("$");
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return "Password must contain at least 12 characters";
  if (password.length > 256) return "Password must contain at most 256 characters";
  return null;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const [prefix, rawCost, rawBlockSize, rawParallelization, rawSalt, rawDigest] =
    encodedHash.split("$");
  if (
    prefix !== HASH_PREFIX
    || !rawCost
    || !rawBlockSize
    || !rawParallelization
    || !rawSalt
    || !rawDigest
  ) {
    return false;
  }

  const cost = Number(rawCost);
  const blockSize = Number(rawBlockSize);
  const parallelization = Number(rawParallelization);
  if (
    cost !== SCRYPT_COST
    || blockSize !== SCRYPT_BLOCK_SIZE
    || parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(rawSalt, "base64");
    const expected = Buffer.from(rawDigest, "base64");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isPasswordHash(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${HASH_PREFIX}$`);
}
