import { Player } from "../types";

export type RelationField = keyof Pick<Player, "alliances" | "wars">;

export interface RelationPair {
  playerAId: string;
  playerBId: string;
}

export function directedPairKey(fromPlayerId: string, toPlayerId: string): string {
  return `${fromPlayerId}->${toPlayerId}`;
}

export function undirectedPairKey(playerAId: string, playerBId: string): string {
  return playerAId < playerBId
    ? `${playerAId}|${playerBId}`
    : `${playerBId}|${playerAId}`;
}

export function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function removeFromArray(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index >= 0) {
    values.splice(index, 1);
  }
}

export function linkPlayers(
  players: Record<string, Player>,
  field: RelationField,
  playerAId: string,
  playerBId: string,
): void {
  const playerA = players[playerAId];
  const playerB = players[playerBId];
  if (!playerA || !playerB || playerAId === playerBId) {
    return;
  }

  addUnique(playerA[field], playerBId);
  addUnique(playerB[field], playerAId);
}

export function unlinkPlayers(
  players: Record<string, Player>,
  field: RelationField,
  playerAId: string,
  playerBId: string,
): void {
  const playerA = players[playerAId];
  const playerB = players[playerBId];
  if (!playerA || !playerB || playerAId === playerBId) {
    return;
  }

  removeFromArray(playerA[field], playerBId);
  removeFromArray(playerB[field], playerAId);
}

export function collectRelationPairs(
  players: Record<string, Player>,
  relationType: RelationField,
): RelationPair[] {
  const seen = new Set<string>();
  const result: RelationPair[] = [];

  for (const player of Object.values(players)) {
    for (const otherId of player[relationType]) {
      if (!players[otherId]) {
        continue;
      }

      const key = undirectedPairKey(player.id, otherId);
      if (seen.has(key)) {
        continue;
      }

      const [playerAId, playerBId] = key.split("|");
      seen.add(key);
      result.push({ playerAId, playerBId });
    }
  }

  result.sort((left, right) =>
    `${left.playerAId}|${left.playerBId}`.localeCompare(
      `${right.playerAId}|${right.playerBId}`,
    ),
  );
  return result;
}

export function areMutualAllies(
  players: Record<string, Player>,
  playerAId: string,
  playerBId: string,
): boolean {
  const playerA = players[playerAId];
  const playerB = players[playerBId];
  if (!playerA || !playerB) {
    return false;
  }

  return (
    playerA.alliances.includes(playerBId) && playerB.alliances.includes(playerAId)
  );
}