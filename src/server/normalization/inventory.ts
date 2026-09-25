import {
  DEFAULT_PRODUCT_CONVERSION_RATES,
  isResourceKey,
  PRODUCT_RECIPES,
  PRODUCT_RESOURCE_KEYS,
  roundConversionRate,
  type ProductConversionRates,
} from "../../planetDomain";
import {
  createEmptyItemInventory,
  isKnowledgeCode,
  type ItemInventory,
  type PlayerItemInventories,
} from "../../itemDomain";
import { createEmptyShop, type DisappearingItemRef, type Shop } from "../../shopDomain";
import { isUnitTag, type UnitTag } from "../../unitDomain";
import type { PlayerProductStorages, ResourceStore } from "../../types";

export function normalizeResourceStore(value: unknown, allowFraction = false): ResourceStore {
  if (!value || typeof value !== "object") return {};
  const result: ResourceStore = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isResourceKey(key)) continue;
    const amount = typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(0, allowFraction ? Math.round(raw * 100) / 100 : Math.trunc(raw))
      : 0;
    if (amount > 0) result[key] = amount;
  }
  return result;
}

export function normalizeItemInventory(value: unknown): ItemInventory {
  if (!value || typeof value !== "object") return createEmptyItemInventory();
  const candidate = value as Partial<ItemInventory>;
  const artifactIds = Array.isArray(candidate.artifactIds)
    ? candidate.artifactIds.filter((entry): entry is string =>
        typeof entry === "string" && entry.length > 0)
    : [];
  const knowledge = Array.isArray(candidate.knowledge)
    ? candidate.knowledge.filter(isKnowledgeCode)
    : [];
  const productIds = Array.isArray(candidate.productIds)
    ? candidate.productIds.filter((entry): entry is string =>
        typeof entry === "string" && entry.length > 0)
    : [];
  return {
    artifactIds: [...new Set(artifactIds)],
    knowledge: [...new Set(knowledge)],
    productIds: [...new Set(productIds)],
  };
}

export function normalizePlayerItemInventories(value: unknown): PlayerItemInventories {
  if (!value || typeof value !== "object") return {};
  const result: PlayerItemInventories = {};
  for (const [playerId, inventory] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(playerId)) || Number(playerId) <= 0) continue;
    result[playerId] = normalizeItemInventory(inventory);
  }
  return result;
}

function normalizeDisappearingItems(value: unknown): DisappearingItemRef[] {
  if (!Array.isArray(value)) return [];
  const result: DisappearingItemRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { kind?: unknown; code?: unknown };
    if (candidate.kind === "RESOURCE" && isResourceKey(candidate.code)) {
      result.push({ kind: "RESOURCE", code: candidate.code });
    } else if (
      candidate.kind === "ARTIFACT_DEFINITION"
      && typeof candidate.code === "string"
      && candidate.code.length > 0
    ) {
      result.push({ kind: "ARTIFACT_DEFINITION", code: candidate.code });
    } else if (candidate.kind === "KNOWLEDGE" && isKnowledgeCode(candidate.code)) {
      result.push({ kind: "KNOWLEDGE", code: candidate.code });
    }
  }
  const seen = new Set<string>();
  return result.filter((entry) => {
    const key = `${entry.kind}:${entry.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeShop(value: unknown): Shop {
  if (!value || typeof value !== "object") return createEmptyShop();
  const candidate = value as Partial<Shop>;
  return {
    resources: normalizeResourceStore(candidate.resources, true),
    items: normalizeItemInventory(candidate.items),
    disappearingItems: normalizeDisappearingItems(candidate.disappearingItems),
  };
}

export function normalizeUnitTags(value: unknown): UnitTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isUnitTag))];
}

export function normalizeProductConversionRates(
  value: unknown,
  legacyValue: unknown,
): ProductConversionRates {
  const source = value && typeof value === "object"
    ? value as Partial<Record<string, unknown>>
    : {};
  const legacySource = legacyValue && typeof legacyValue === "object"
    ? legacyValue as Partial<Record<string, unknown>>
    : {};
  return Object.fromEntries(PRODUCT_RESOURCE_KEYS.map((key) => {
    const rate = source[key] ?? legacySource[PRODUCT_RECIPES[key].input];
    const roundedRate = typeof rate === "number" && Number.isFinite(rate)
      ? roundConversionRate(rate)
      : 0;
    return [key, roundedRate > 0 ? roundedRate : DEFAULT_PRODUCT_CONVERSION_RATES[key]];
  })) as ProductConversionRates;
}

export function normalizePlayerProductStorages(value: unknown): PlayerProductStorages {
  if (!value || typeof value !== "object") return {};
  const result: PlayerProductStorages = {};
  for (const [playerId, store] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(Number(playerId)) || Number(playerId) <= 0) continue;
    result[playerId] = normalizeResourceStore(store, true);
  }
  return result;
}
