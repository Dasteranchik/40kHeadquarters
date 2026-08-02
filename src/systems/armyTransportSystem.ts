import type { Action, ArmyTransportRequest, GameState } from "../types";
import { areMutualAllies } from "../utils/relations";

export interface TransportResult { ok: boolean; message: string }

function sameHex(a: { position: { q: number; r: number } }, b: { position: { q: number; r: number } }): boolean {
  return a.position.q === b.position.q && a.position.r === b.position.r;
}

function effectiveArmyPosition(state: GameState, army: GameState["fleets"][number]) {
  return army.carrierFleetId
    ? state.fleets[army.carrierFleetId]?.position ?? army.position
    : army.position;
}

function hasMoveOrder(actions: Iterable<Action>, unitId: number): boolean {
  for (const action of actions) {
    if (action.type === "MOVE_FLEET" && action.payload.fleetId === unitId) return true;
  }
  return false;
}

export function requestArmyEmbark(
  state: GameState,
  actions: Iterable<Action>,
  playerId: number,
  armyId: number,
  fleetId: number,
): TransportResult {
  const army = state.fleets[armyId];
  const fleet = state.fleets[fleetId];
  if (!army || army.domain !== "GROUND" || army.ownerPlayerId !== playerId) {
    return { ok: false, message: "Army does not belong to player" };
  }
  if (!fleet || fleet.domain !== "SPACE") return { ok: false, message: "Carrier fleet does not exist" };
  if (army.carrierFleetId === fleet.id) return { ok: false, message: "Army is already embarked on this fleet" };
  if (!sameHex({ position: effectiveArmyPosition(state, army) }, fleet)) {
    return { ok: false, message: "Army and fleet must be in the same hex" };
  }
  if (fleet.ownerPlayerId !== playerId && !areMutualAllies(state.players, playerId, fleet.ownerPlayerId)) {
    return { ok: false, message: "Carrier fleet must be owned by player or a mutual ally" };
  }
  if (hasMoveOrder(actions, fleetId) || (army.carrierFleetId && hasMoveOrder(actions, army.carrierFleetId))) {
    return { ok: false, message: "Embarkation is available only before movement is planned" };
  }
  state.pendingArmyTransportRequests = state.pendingArmyTransportRequests.filter((r) => r.armyId !== armyId);
  const request: ArmyTransportRequest = {
    id: `embark-${state.turnNumber}-${armyId}-${fleetId}`,
    armyId, fleetId, requestedByPlayerId: playerId, requestedOnTurn: state.turnNumber,
  };
  state.pendingArmyTransportRequests.push(request);
  return { ok: true, message: "Embarkation request sent" };
}

export function respondArmyEmbark(
  state: GameState,
  actions: Iterable<Action>,
  playerId: number,
  requestId: string,
  accept: boolean,
): TransportResult {
  const index = state.pendingArmyTransportRequests.findIndex((r) => r.id === requestId);
  if (index < 0) return { ok: false, message: "Embarkation request not found" };
  const request = state.pendingArmyTransportRequests[index];
  const army = state.fleets[request.armyId];
  const fleet = state.fleets[request.fleetId];
  if (!fleet || fleet.ownerPlayerId !== playerId) return { ok: false, message: "Only carrier owner can respond" };
  state.pendingArmyTransportRequests.splice(index, 1);
  if (!accept) return { ok: true, message: "Embarkation request declined" };
  if (!army || army.domain !== "GROUND" || fleet.domain !== "SPACE" || army.carrierFleetId === fleet.id ||
      !sameHex({ position: effectiveArmyPosition(state, army) }, fleet)) {
    return { ok: true, message: "Embarkation request expired: army and fleet are no longer eligible" };
  }
  if (request.requestedOnTurn !== state.turnNumber || hasMoveOrder(actions, fleet.id) ||
      (army.carrierFleetId && hasMoveOrder(actions, army.carrierFleetId))) {
    return { ok: true, message: "Embarkation request expired: operation is available only at the start of the turn" };
  }
  army.carrierFleetId = fleet.id;
  army.position = { ...fleet.position };
  return { ok: true, message: "Army embarked" };
}

export function disembarkArmy(
  state: GameState,
  actions: Iterable<Action>,
  playerId: number,
  armyId: number,
): TransportResult {
  const army = state.fleets[armyId];
  if (!army || army.domain !== "GROUND" || !army.carrierFleetId) return { ok: false, message: "Army is not embarked" };
  const carrier = state.fleets[army.carrierFleetId];
  if (!carrier) return { ok: false, message: "Carrier fleet does not exist" };
  if (army.ownerPlayerId !== playerId && carrier.ownerPlayerId !== playerId) return { ok: false, message: "Only army or carrier owner can disembark" };
  if (hasMoveOrder(actions, carrier.id)) return { ok: false, message: "Disembarkation is available only before movement is planned" };
  const planet = Object.values(state.planets).find((p) => sameHex(p, carrier));
  if (!planet) return { ok: false, message: "Army can disembark only onto a planet" };
  army.position = { ...planet.position };
  delete army.carrierFleetId;
  state.pendingArmyTransportRequests = state.pendingArmyTransportRequests.filter((r) => r.armyId !== army.id);
  return { ok: true, message: `Army disembarked on ${planet.id}` };
}
