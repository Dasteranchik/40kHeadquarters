import type { GameState } from "../types";
import type { EffectiveTag, EffectiveTagSourceType, TagDefinition } from "../tagDomain";
import type { TagConditions } from "../effectDomain";
import { isCombatCapable } from "../formationDomain";

function addExpandedTag(
  tags: Record<string, TagDefinition>,
  tagId: string,
  sourceType: EffectiveTagSourceType,
  sourceId: string,
  result: EffectiveTag[],
  active: Set<string>,
): void {
  if (active.has(tagId)) throw new Error(`Tag inheritance cycle at ${tagId}`);
  result.push({ tagId, sourceType, sourceId });
  const definition = tags[tagId];
  if (!definition) return;
  active.add(tagId);
  for (const parentId of definition.parentTagIds) {
    addExpandedTag(tags, parentId, sourceType, sourceId, result, active);
  }
  active.delete(tagId);
}

export function expandEffectiveTags(
  tags: Record<string, TagDefinition>,
  sources: EffectiveTag[],
): EffectiveTag[] {
  const expanded: EffectiveTag[] = [];
  for (const source of sources) {
    addExpandedTag(tags, source.tagId, source.sourceType, source.sourceId, expanded, new Set());
  }
  const seen = new Set<string>();
  return expanded.filter((entry) => {
    const key = `${entry.tagId}:${entry.sourceType}:${entry.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchesTagConditions(tags: ReadonlySet<string>, conditions: TagConditions): boolean {
  return conditions.requiresAllTags.every((tag) => tags.has(tag))
    && (conditions.requiresAnyTags.length === 0
      || conditions.requiresAnyTags.some((tag) => tags.has(tag)))
    && conditions.forbiddenTags.every((tag) => !tags.has(tag));
}

export function collectUnitTagSources(state: GameState, unitId: number): EffectiveTag[] {
  const unit = state.fleets[unitId];
  if (!unit) return [];
  const sources: EffectiveTag[] = [];
  for (const formationId of unit.formationIds ?? []) {
    const formation = state.formations?.[formationId];
    if (!formation || !isCombatCapable(formation)) continue;
    for (const tagId of formation.tags) {
      sources.push({ tagId, sourceType: "FORMATION", sourceId: formation.id });
    }
  }
  for (const artifactId of unit.attachedArtifactIds ?? []) {
    const artifact = state.artifacts[artifactId];
    if (!artifact || artifact.attachedUnitId !== unitId) continue;
    for (const tagId of artifact.tags ?? []) {
      sources.push({ tagId, sourceType: artifactId === unit.commanderArtifactId ? "COMMANDER" : "ARTIFACT", sourceId: artifactId });
    }
  }
  return sources;
}

export function effectiveUnitTags(state: GameState, unitId: number): EffectiveTag[] {
  return expandEffectiveTags(state.tags ?? {}, collectUnitTagSources(state, unitId));
}
