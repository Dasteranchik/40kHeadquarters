export function gameStateKey(gameId: string): string {
  return `game:${gameId}:state`;
}

export function gameActionsKey(gameId: string): string {
  return `game:${gameId}:actions`;
}

export function gamePlayersKey(gameId: string): string {
  return `game:${gameId}:players`;
}

export function gameTurnHistoryKey(gameId: string, turnNumber: number): string {
  return `game:${gameId}:turn:${turnNumber}`;
}