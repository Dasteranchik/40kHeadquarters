import type { ResourceKey } from "../planetDomain";
import type { InventoryLocation, KnowledgeCode } from "../itemDomain";
import type { ShopTradePayload } from "../shopDomain";
import type { Action, GameState, HexCoord, TurnResolution } from "../types";

export interface SubmitActionMessage {
  type: "submitAction";
  action: Action;
}

export interface RemoveActionMessage {
  type: "removeAction";
  actionId: string;
}

export interface PlayerReadyMessage {
  type: "playerReady";
}

export interface EndTurnMessage {
  type: "endTurn";
  commandId: string;
}

export interface SetFleetAllyVisionMessage {
  type: "setFleetAllyVision";
  commandId: string;
  fleetId: number;
  enabled: boolean;
}

export type ResourceEndpointKind = "FLEET" | "PLANET_STORAGE";

export interface ResourceEndpointRef {
  kind: ResourceEndpointKind;
  id: number;
}

export interface ResourceTransferPayload {
  from: ResourceEndpointRef;
  to: ResourceEndpointRef;
  resourceKey: ResourceKey;
  amount: number;
}

export interface ResourceTransferMessage {
  type: "resourceTransfer";
  commandId: string;
  payload: ResourceTransferPayload;
}

export interface RequestArmyEmbarkMessage {
  type: "requestArmyEmbark";
  commandId: string;
  armyId: number;
  fleetId: number;
}

export interface RespondArmyEmbarkMessage {
  type: "respondArmyEmbark";
  commandId: string;
  requestId: string;
  accept: boolean;
}

export interface DisembarkArmyMessage {
  type: "disembarkArmy";
  commandId: string;
  armyId: number;
}

export interface ShopTradeMessage {
  type: "shopTrade";
  commandId: string;
  payload: ShopTradePayload;
}

export interface OpenSecretStorageMessage {
  type: "openSecretStorage";
  commandId: string;
  target: { kind: "PLANET" | "STATION"; id: number };
  password: string;
}

export interface ReportWorldMessage {
  type: "reportWorld";
  commandId: string;
  planetId: number;
}

export interface ProposeTitheMessage {
  type: "proposeTithe";
  commandId: string;
  planetId: number;
  titheLevel: import("../planetDomain").TitheLevel;
}

export interface ItemTransferMessage {
  type: "itemTransfer";
  commandId: string;
  item:
    | { kind: "ARTIFACT"; artifactId: string }
    | { kind: "KNOWLEDGE"; knowledge: KnowledgeCode };
  source: InventoryLocation;
  target: InventoryLocation;
}

export interface ArtifactUseMessage {
  type: "artifactUse";
  commandId: string;
  artifactId: string;
}

export interface ConvertFuelToMovementMessage {
  type: "convertFuelToMovement";
  commandId: string;
  fleetId: number;
  amount: number;
}

export type ClientMessage =
  | SubmitActionMessage
  | RemoveActionMessage
  | PlayerReadyMessage
  | EndTurnMessage
  | SetFleetAllyVisionMessage
  | ResourceTransferMessage
  | RequestArmyEmbarkMessage
  | RespondArmyEmbarkMessage
  | DisembarkArmyMessage
  | ShopTradeMessage
  | ItemTransferMessage
  | ArtifactUseMessage
  | ConvertFuelToMovementMessage
  | OpenSecretStorageMessage
  | ReportWorldMessage
  | ProposeTitheMessage;

export interface PlannedMovePreview {
  fleetId: number;
  ownerPlayerId: number;
  path: HexCoord[];
  projectedPosition: HexCoord;
}

export interface PlanningSnapshot {
  movePreviews: PlannedMovePreview[];
}

export interface StateUpdateMessage {
  type: "stateUpdate";
  state: GameState;
  planning: PlanningSnapshot;
}

export interface TurnResolvedMessage {
  type: "turnResolved";
  changes: TurnResolution;
}

export interface OperationResultMessage {
  type: "operationResult";
  ok: boolean;
  message: string;
  commandId?: string;
  duplicate?: boolean;
}

export interface SecretStorageResultMessage {
  type: "secretStorageResult";
  commandId: string;
  ok: boolean;
  message: string;
  duplicate?: boolean;
  target: { kind: "PLANET" | "STATION"; id: number };
  storage?: {
    allowedTypeKeys: import("../secretStorageDomain").SecretStorageTypeKey[];
    stackableInventory: import("../itemDomain").StackableInventory;
    itemInventory: import("../itemDomain").ItemInventory;
  };
}

export type ServerMessage =
  | StateUpdateMessage
  | TurnResolvedMessage
  | OperationResultMessage
  | SecretStorageResultMessage;
