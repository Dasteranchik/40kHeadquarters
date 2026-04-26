export const PLANET_WORLD_TYPES = [
  "AGRI_WORLD",
  "MINING_WORLD",
  "HIVE_WORLD",
  "FERAL_WORLD",
  "FEUDAL_WORLD",
  "QUARRY_WORLD",
  "FORGE_WORLD",
  "SHRINE_WORLD",
  "INDUSTRIAL_WORLD",
  "DEATH_WORLD",
  "FORTRESS_WORLD",
  "GARDEN_WORLD",
  "PENAL_COLONY",
] as const;

export type PlanetWorldType = (typeof PLANET_WORLD_TYPES)[number];

export const PLANET_TAGS = [
  "FOOD_PRODUCTION",
  "INDUSTRIAL_PRODUCTION",
  "REFINERY",
  "ASSEMBLY_SHIPYARDS",
  "LABOR_CAMP",
  "RECRUITMENT_CENTER",
] as const;

export type PlanetTag = (typeof PLANET_TAGS)[number];

export const INFO_CATEGORIES = [
  "MILITARY",
  "NAVAL",
  "ARISTOCRACY",
  "PSYKANA",
  "FORBIDDEN",
  "TECH_SECRETS",
] as const;

export type InfoCategory = (typeof INFO_CATEGORIES)[number];

export const RAW_RESOURCE_KEYS = [
  "FOOD_RAW",
  "ORE",
  "PROMETHIUM",
  "PEOPLE",
  "BLACK_STONE",
] as const;

export type RawResourceKey = (typeof RAW_RESOURCE_KEYS)[number];

export const PRODUCT_RESOURCE_KEYS = [
  "PROVISIONS",
  "PARTS",
  "FUEL",
  "SHIPS",
  "WORKERS",
  "REGIMENTS",
] as const;

export type ProductResourceKey = (typeof PRODUCT_RESOURCE_KEYS)[number];

export const RESOURCE_KEYS = [...RAW_RESOURCE_KEYS, ...PRODUCT_RESOURCE_KEYS] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export type TitheLevel =
  | "EXACTIS_EXTREMIS"
  | "EXACTIS_PARTICULAR"
  | "EXACTIS_MEDIAN"
  | "EXACTIS_PRIMA"
  | "EXACTIS_SECUNDUS"
  | "EXACTIS_TERTIUS"
  | "DECUMA_EXTREMIS"
  | "DECUMA_PARTICULAR"
  | "DECUMA_PRIMA"
  | "DECUMA_SECUNDUS"
  | "DECUMA_TERTIUS"
  | "SOLUTIO_EXTREMIS"
  | "SOLUTIO_PARTICULAR"
  | "SOLUTIO_PRIMA"
  | "SOLUTIO_SECUNDUS"
  | "SOLUTIO_TERTIUS"
  | "ADEPTUS_NON";

export const TITHE_LEVEL_ORDER: TitheLevel[] = [
  "EXACTIS_EXTREMIS",
  "EXACTIS_PARTICULAR",
  "EXACTIS_MEDIAN",
  "EXACTIS_PRIMA",
  "EXACTIS_SECUNDUS",
  "EXACTIS_TERTIUS",
  "DECUMA_EXTREMIS",
  "DECUMA_PARTICULAR",
  "DECUMA_PRIMA",
  "DECUMA_SECUNDUS",
  "DECUMA_TERTIUS",
  "SOLUTIO_EXTREMIS",
  "SOLUTIO_PARTICULAR",
  "SOLUTIO_PRIMA",
  "SOLUTIO_SECUNDUS",
  "SOLUTIO_TERTIUS",
  "ADEPTUS_NON",
];

export const TITHE_VALUE_BY_LEVEL: Record<TitheLevel, number> = {
  EXACTIS_EXTREMIS: 16,
  EXACTIS_PARTICULAR: 15,
  EXACTIS_MEDIAN: 14,
  EXACTIS_PRIMA: 13,
  EXACTIS_SECUNDUS: 12,
  EXACTIS_TERTIUS: 11,
  DECUMA_EXTREMIS: 10,
  DECUMA_PARTICULAR: 9,
  DECUMA_PRIMA: 8,
  DECUMA_SECUNDUS: 7,
  DECUMA_TERTIUS: 6,
  SOLUTIO_EXTREMIS: 5,
  SOLUTIO_PARTICULAR: 4,
  SOLUTIO_PRIMA: 3,
  SOLUTIO_SECUNDUS: 2,
  SOLUTIO_TERTIUS: 1,
  ADEPTUS_NON: 0,
};

export interface ProductRecipe {
  product: ProductResourceKey;
  input: RawResourceKey;
  requiredTag: PlanetTag;
}

export const PRODUCT_RECIPES: Record<ProductResourceKey, ProductRecipe> = {
  PROVISIONS: {
    product: "PROVISIONS",
    input: "FOOD_RAW",
    requiredTag: "FOOD_PRODUCTION",
  },
  PARTS: {
    product: "PARTS",
    input: "ORE",
    requiredTag: "INDUSTRIAL_PRODUCTION",
  },
  FUEL: {
    product: "FUEL",
    input: "PROMETHIUM",
    requiredTag: "REFINERY",
  },
  SHIPS: {
    product: "SHIPS",
    input: "ORE",
    requiredTag: "ASSEMBLY_SHIPYARDS",
  },
  WORKERS: {
    product: "WORKERS",
    input: "PEOPLE",
    requiredTag: "LABOR_CAMP",
  },
  REGIMENTS: {
    product: "REGIMENTS",
    input: "PEOPLE",
    requiredTag: "RECRUITMENT_CENTER",
  },
};

export const RAW_OUTPUTS_BY_WORLD_TYPE: Record<PlanetWorldType, RawResourceKey[]> = {
  AGRI_WORLD: ["FOOD_RAW"],
  MINING_WORLD: ["ORE", "PROMETHIUM"],
  HIVE_WORLD: ["PEOPLE"],
  FERAL_WORLD: ["PEOPLE"],
  FEUDAL_WORLD: ["PEOPLE"],
  QUARRY_WORLD: ["BLACK_STONE"],
  FORGE_WORLD: [],
  SHRINE_WORLD: [],
  INDUSTRIAL_WORLD: [],
  DEATH_WORLD: [],
  FORTRESS_WORLD: [],
  GARDEN_WORLD: [],
  PENAL_COLONY: [],
};

const PLANET_WORLD_TYPE_SET = new Set<string>(PLANET_WORLD_TYPES);
const PLANET_TAG_SET = new Set<string>(PLANET_TAGS);
const INFO_CATEGORY_SET = new Set<string>(INFO_CATEGORIES);
const RESOURCE_KEY_SET = new Set<string>(RESOURCE_KEYS);
const RAW_RESOURCE_SET = new Set<string>(RAW_RESOURCE_KEYS);
const PRODUCT_RESOURCE_SET = new Set<string>(PRODUCT_RESOURCE_KEYS);
const TITHE_LEVEL_SET = new Set<string>(TITHE_LEVEL_ORDER);

export function isPlanetWorldType(value: unknown): value is PlanetWorldType {
  return typeof value === "string" && PLANET_WORLD_TYPE_SET.has(value);
}

export function isPlanetTag(value: unknown): value is PlanetTag {
  return typeof value === "string" && PLANET_TAG_SET.has(value);
}

export function isInfoCategory(value: unknown): value is InfoCategory {
  return typeof value === "string" && INFO_CATEGORY_SET.has(value);
}

export function isResourceKey(value: unknown): value is ResourceKey {
  return typeof value === "string" && RESOURCE_KEY_SET.has(value);
}

export function isRawResourceKey(value: unknown): value is RawResourceKey {
  return typeof value === "string" && RAW_RESOURCE_SET.has(value);
}

export function isProductResourceKey(value: unknown): value is ProductResourceKey {
  return typeof value === "string" && PRODUCT_RESOURCE_SET.has(value);
}

export function isTitheLevel(value: unknown): value is TitheLevel {
  return typeof value === "string" && TITHE_LEVEL_SET.has(value);
}

export function titheCategoryRank(level: TitheLevel): number {
  return TITHE_LEVEL_ORDER.indexOf(level);
}

export function titheValue(level: TitheLevel): number {
  return TITHE_VALUE_BY_LEVEL[level];
}

export function computePopulationProduction(population: number): number {
  return Math.max(0, Math.floor(population / 10));
}
