export const UNIT_TAGS = ["STEALTH"] as const;

/** Tag codes are administered; STEALTH is only the built-in compatibility tag. */
export type UnitTag = string;

export function isUnitTag(value: unknown): value is UnitTag {
  return typeof value === "string" && /^[A-Z][A-Z0-9_:-]{1,79}$/.test(value);
}

export function hasUnitTag(
  value: { tags: readonly UnitTag[] },
  tag: UnitTag,
): boolean {
  return value.tags.includes(tag);
}
