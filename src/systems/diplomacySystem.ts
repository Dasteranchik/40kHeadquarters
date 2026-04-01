import { DiplomacyAction, DiplomacyReport, GameState } from "../types";
import {
  directedPairKey,
  linkPlayers,
  undirectedPairKey,
  unlinkPlayers,
} from "../utils/relations";

function ordered(actions: DiplomacyAction[]): DiplomacyAction[] {
  return [...actions].sort((a, b) => a.id.localeCompare(b.id));
}

export function applyDiplomacy(
  state: GameState,
  actions: DiplomacyAction[],
): DiplomacyReport {
  const players = state.players;

  const declaredWarPairs = new Set<string>();
  const allianceProposals = new Set<string>();

  for (const action of ordered(actions)) {
    const a = action.playerId;
    const b = action.payload.targetPlayerId;

    if (action.payload.action === "DECLARE_WAR") {
      declaredWarPairs.add(undirectedPairKey(a, b));
      continue;
    }

    allianceProposals.add(directedPairKey(a, b));
  }

  const report: DiplomacyReport = {
    declaredWars: [],
    formedAlliances: [],
  };

  for (const pair of declaredWarPairs) {
    const [a, b] = pair.split("|");
    linkPlayers(players, "wars", a, b);
    unlinkPlayers(players, "alliances", a, b);
    report.declaredWars.push({ playerAId: a, playerBId: b });
  }

  const processedAlliancePairs = new Set<string>();
  for (const proposal of allianceProposals) {
    const [a, b] = proposal.split("->");
    const reverse = directedPairKey(b, a);
    const pair = undirectedPairKey(a, b);

    if (
      !allianceProposals.has(reverse) ||
      declaredWarPairs.has(pair) ||
      processedAlliancePairs.has(pair)
    ) {
      continue;
    }

    linkPlayers(players, "alliances", a, b);
    unlinkPlayers(players, "wars", a, b);
    processedAlliancePairs.add(pair);
    report.formedAlliances.push({ playerAId: a, playerBId: b });
  }

  return report;
}