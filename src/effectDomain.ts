export interface TagConditions {
  requiresAllTags: string[];
  requiresAnyTags: string[];
  forbiddenTags: string[];
}

export type EffectMagnitude =
  | { kind: "FIXED"; value: number }
  | { kind: "MORALE_FACTOR"; factor: number };

export type UnitEffect =
  | { kind: "ADD_COMBAT_POWER"; magnitude: EffectMagnitude; conditions: TagConditions }
  | { kind: "MULTIPLY_COMBAT_POWER"; magnitude: EffectMagnitude; conditions: TagConditions }
  | { kind: "ADD_MORALE"; magnitude: EffectMagnitude; conditions: TagConditions }
  | { kind: "ADD_TAG"; tagId: string; conditions: TagConditions };

export const EMPTY_TAG_CONDITIONS: TagConditions = {
  requiresAllTags: [],
  requiresAnyTags: [],
  forbiddenTags: [],
};
