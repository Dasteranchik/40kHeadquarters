import type { ClientMessage } from "../../../src/api/ws";
import type { Action, Fleet, FleetStance, GameState, HexCoord } from "../../../src/types";

type Nullable<T> = T | null;

export interface OrdersRuntimeState {
  gameState: GameState | null;
  plannedPath: HexCoord[];
  pendingFleetStances: Record<string, FleetStance>;
}

export interface OrderActionsDeps {
  runtime: OrdersRuntimeState;
  getActivePlayerId: () => string | null;
  getSelectedFleet: (state: GameState) => Nullable<Fleet>;
  getTargetPlayerId: () => string;
  nextActionId: (prefix: string) => string;
  sendMessage: (message: ClientMessage) => boolean;
  appendEvent: (message: string) => void;
  refreshHud: () => void;
  renderScene: () => void;
}

export function createOrderActions(deps: OrderActionsDeps) {
  function submitMove(): void {
    const state = deps.runtime.gameState;
    const playerId = deps.getActivePlayerId();
    if (!state || !playerId) {
      return;
    }

    const selected = deps.getSelectedFleet(state);
    if (!selected || deps.runtime.plannedPath.length === 0) {
      return;
    }

    const action: Action = {
      id: deps.nextActionId("move"),
      playerId,
      type: "MOVE_FLEET",
      payload: {
        fleetId: selected.id,
        path: deps.runtime.plannedPath,
      },
    };

    deps.sendMessage({ type: "submitAction", action });
    deps.appendEvent(
      `MOVE_FLEET submitted for ${selected.id} (${deps.runtime.plannedPath.length} steps)`,
    );
  }

  function submitStance(stance: FleetStance): void {
    const state = deps.runtime.gameState;
    const playerId = deps.getActivePlayerId();
    if (!state || !playerId) {
      return;
    }

    const selected = deps.getSelectedFleet(state);
    if (!selected) {
      return;
    }

    const action: Action = {
      id: deps.nextActionId("stance"),
      playerId,
      type: "SET_FLEET_STANCE",
      payload: {
        fleetId: selected.id,
        stance,
      },
    };

    if (!deps.sendMessage({ type: "submitAction", action })) {
      return;
    }

    deps.runtime.pendingFleetStances[selected.id] = stance;
    deps.refreshHud();
    deps.appendEvent(`SET_FLEET_STANCE submitted for ${selected.id} -> ${stance}`);
  }

  function submitDiplomacy(kind: "DECLARE_WAR" | "PROPOSE_ALLIANCE"): void {
    const playerId = deps.getActivePlayerId();
    const targetPlayerId = deps.getTargetPlayerId();
    if (!playerId || !targetPlayerId) {
      return;
    }

    const action: Action = {
      id: deps.nextActionId("dip"),
      playerId,
      type: "DIPLOMACY",
      payload: {
        targetPlayerId,
        action: kind,
      },
    };

    deps.sendMessage({ type: "submitAction", action });
    deps.appendEvent(`${kind} submitted -> ${targetPlayerId}`);
  }

  function clearPath(): void {
    deps.runtime.plannedPath = [];
    deps.refreshHud();
    deps.renderScene();
  }

  return {
    submitMove,
    submitStance,
    submitDiplomacy,
    clearPath,
  };
}
