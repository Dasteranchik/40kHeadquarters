export const UNIT_TAGS = ["STEALTH"] as const;

export type UnitTag = (typeof UNIT_TAGS)[number];

const UNIT_TAG_SET = new Set<string>(UNIT_TAGS);

export function isUnitTag(value: unknown): value is UnitTag {
  return typeof value === "string" && UNIT_TAG_SET.has(value);
}

export function hasUnitTag(
  value: { tags: readonly UnitTag[] },
  tag: UnitTag,
): boolean {
  return value.tags.includes(tag);
}
