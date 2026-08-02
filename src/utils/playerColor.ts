const PLAYER_COLORS = [
  "#63d6ff", "#ff9a63", "#c7ff67", "#c58cff",
  "#ff6fae", "#67e0b5", "#ffd166", "#8fa8ff",
] as const;

export function defaultPlayerColor(playerId: number): string {
  return PLAYER_COLORS[Math.abs(playerId - 1) % PLAYER_COLORS.length];
}

export function isPlayerColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function playerColorToNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}
