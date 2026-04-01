import { FleetStance } from "../types";

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{2,32}$/.test(id);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isFleetStance(value: unknown): value is FleetStance {
  return value === "ATTACK" || value === "DEFENSE";
}