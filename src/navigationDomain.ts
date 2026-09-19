export type WarpVisibility = null | 0 | 1 | 2 | 3;

export function isWarpVisibility(value: unknown): value is WarpVisibility {
  return value === null
    || value === 0
    || value === 1
    || value === 2
    || value === 3;
}

export function normalizeWarpVisibility(value: unknown): WarpVisibility {
  return isWarpVisibility(value) ? value : null;
}

