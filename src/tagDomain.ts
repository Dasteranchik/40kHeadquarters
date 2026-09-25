export interface TagDefinition {
  id: string;
  name: string;
  description?: string;
  parentTagIds: string[];
}

export type TagRelationKind = "ALLY" | "NEUTRAL" | "HOSTILE";

/** The relation is stored, not resolved. TODO(TAG-RELATION-PRECEDENCE-001). */
export interface TagRelation {
  tagAId: string;
  tagBId: string;
  relation: TagRelationKind;
}

export type EffectiveTagSourceType =
  | "FORMATION"
  | "COMMANDER"
  | "ARTIFACT"
  | "DOCTRINE"
  | "TEMPORARY_EFFECT";

export interface EffectiveTag {
  tagId: string;
  sourceType: EffectiveTagSourceType;
  sourceId: string;
}
