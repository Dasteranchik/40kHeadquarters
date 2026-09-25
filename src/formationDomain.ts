import type { InventoryLocation } from "./itemDomain";

/** An individual PRODUCT item, whether stored or assigned to a Unit. */
export interface FormationInstance {
  id: string;
  type: "PRODUCT";
  kind: string;
  name: string;
  baseCombatPower: number;
  maxHealth: number;
  currentHealth: number;
  tags: string[];
  owner: InventoryLocation | { kind: "UNIT"; unitId: number };
}

export function formationCombatPower(formation: FormationInstance): number {
  if (formation.currentHealth <= 0 || formation.maxHealth <= 0) return 0;
  return formation.baseCombatPower * formation.currentHealth / formation.maxHealth;
}

export function isCombatCapable(formation: FormationInstance): boolean {
  return formation.currentHealth > 0
    && formation.currentHealth >= formation.maxHealth * 0.30;
}
