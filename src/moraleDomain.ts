export const MIN_MORALE = -100;
export const MAX_MORALE = 100;

export function clampMorale(value: number): number {
  return Math.max(MIN_MORALE, Math.min(MAX_MORALE, value));
}

export function moraleCoefficient(morale: number): number {
  if (morale === 100) return 1.5;
  if (morale >= 90) return 1.4;
  if (morale >= 80) return 1.3;
  if (morale >= 70) return 1.2;
  if (morale >= 60) return 1.1;
  // The stored value is never rounded (MORALE-PRECISION-001).
  if (morale > -60) return 1;
  if (morale > -70) return 0.9;
  if (morale > -80) return 0.8;
  if (morale > -90) return 0.7;
  if (morale > -100) return 0.6;
  return 0.5;
}
