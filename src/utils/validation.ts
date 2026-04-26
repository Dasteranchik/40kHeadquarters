import { isPlanetTag, isPlanetWorldType } from "../planetDomain";
import { FleetDomain, FleetStance, PlayerAlignment } from "../types";

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{2,32}$/.test(id);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFleetStance(value: unknown): value is FleetStance {
  return value === "ATTACK" || value === "DEFENSE";
}

export function isFleetDomain(value: unknown): value is FleetDomain {
  return value === "SPACE" || value === "GROUND";
}

export function isPlayerAlignment(value: unknown): value is PlayerAlignment {
  return value === "IMPERIAL" || value === "NON_IMPERIAL";
}

export function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }

  return value;
}

export function parsePlanetTags(value: unknown): string[] | null {
  const values = parseStringArray(value);
  if (!values) {
    return null;
  }

  if (values.some((entry) => !isPlanetTag(entry))) {
    return null;
  }

  return values;
}

export function isPlanetWorldTypeValue(value: unknown): boolean {
  return isPlanetWorldType(value);
}
