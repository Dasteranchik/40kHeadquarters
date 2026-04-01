import { Action, GameState } from "../types";
import {
  directedPairKey,
  linkPlayers,
  unlinkPlayers,
} from "../utils/relations";

export function clearAllianceProposalsForPair(
  pendingAllianceProposals: Set<string>,
  playerAId: string,
  playerBId: string,
): void {
  pendingAllianceProposals.delete(directedPairKey(playerAId, playerBId));
  pendingAllianceProposals.delete(directedPairKey(playerBId, playerAId));
}

export function clearAllianceProposalsForPlayer(
  pendingAllianceProposals: Set<string>,
  playerId: string,
): void {
  for (const key of [...pendingAllianceProposals]) {
    const [fromPlayerId, toPlayerId] = key.split("->");
    if (fromPlayerId === playerId || toPlayerId === playerId) {
      pendingAllianceProposals.delete(key);
    }
  }
}

export function applyImmediateDiplomacy(
  state: GameState,
  pendingAllianceProposals: Set<string>,
  action: Action,
): boolean {
  if (action.type !== "DIPLOMACY") {
    return false;
  }

  const sourcePlayerId = action.playerId;
  const targetPlayerId = action.payload.targetPlayerId;

  if (
    sourcePlayerId === targetPlayerId ||
    !state.players[sourcePlayerId] ||
    !state.players[targetPlayerId]
  ) {
    return false;
  }

  const hadAlliance =
    state.players[sourcePlayerId].alliances.includes(targetPlayerId) ||
    state.players[targetPlayerId].alliances.includes(sourcePlayerId);
  const hadWar =
    state.players[sourcePlayerId].wars.includes(targetPlayerId) ||
    state.players[targetPlayerId].wars.includes(sourcePlayerId);

  if (action.payload.action === "DECLARE_WAR") {
    linkPlayers(state.players, "wars", sourcePlayerId, targetPlayerId);
    unlinkPlayers(state.players, "alliances", sourcePlayerId, targetPlayerId);
    clearAllianceProposalsForPair(pendingAllianceProposals, sourcePlayerId, targetPlayerId);

    const hasWar =
      state.players[sourcePlayerId].wars.includes(targetPlayerId) &&
      state.players[targetPlayerId].wars.includes(sourcePlayerId);
    const hasAlliance =
      state.players[sourcePlayerId].alliances.includes(targetPlayerId) ||
      state.players[targetPlayerId].alliances.includes(sourcePlayerId);

    return !hadWar || (hadAlliance && !hasAlliance);
  }

  const proposalKey = directedPairKey(sourcePlayerId, targetPlayerId);
  const reverseKey = directedPairKey(targetPlayerId, sourcePlayerId);
  pendingAllianceProposals.add(proposalKey);

  if (!pendingAllianceProposals.has(reverseKey)) {
    return false;
  }

  linkPlayers(state.players, "alliances", sourcePlayerId, targetPlayerId);
  unlinkPlayers(state.players, "wars", sourcePlayerId, targetPlayerId);
  clearAllianceProposalsForPair(pendingAllianceProposals, sourcePlayerId, targetPlayerId);

  const hasAlliance =
    state.players[sourcePlayerId].alliances.includes(targetPlayerId) &&
    state.players[targetPlayerId].alliances.includes(sourcePlayerId);
  const hasWar =
    state.players[sourcePlayerId].wars.includes(targetPlayerId) ||
    state.players[targetPlayerId].wars.includes(sourcePlayerId);

  return !hadAlliance || (hadWar && !hasWar);
}