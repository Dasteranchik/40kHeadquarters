import type { TagConditions, UnitEffect } from "./effectDomain";

export interface DoctrineDefinition {
  id: string;
  name: string;
  description: string;
  tagRequirements: TagConditions;
  effects: UnitEffect[];
}
