import type { ClientMessage, ResourceEndpointKind } from "../../../src/api/ws";
import {
  PRODUCT_RESOURCE_KEYS,
  RAW_RESOURCE_KEYS,
  RESOURCE_KEYS,
} from "../../../src/planetDomain";
import type { Fleet, GameState, Planet } from "../../../src/types";
import { fleetsAtCoord } from "../mapScene";

type TransferMode =
  | "FLEET_TO_FLEET"
  | "FLEET_TO_PLANET_STORAGE"
  | "PLANET_STORAGE_TO_FLEET";

interface TransferModeSpec {
  value: TransferMode;
  label: string;
  fromKind: ResourceEndpointKind;
  toKind: ResourceEndpointKind;
}

interface TransferAvailability {
  key: (typeof RESOURCE_KEYS)[number];
  maxAmount: number;
}

interface TransferContext {
  mode: TransferModeSpec;
  fromId: number;
  fromStore: Fleet["inventory"];
  toId: number;
}

export interface ResourceTransferViewContext {
  state: GameState | null;
  activePlayerId: string | null;
  selectedFleet: Fleet | null;
}

export interface ResourceTransferControllerDeps {
  getContext: () => ResourceTransferViewContext;
  sendMessage: (message: ClientMessage) => boolean;
  nextCommandId: (prefix: string) => string;
  appendEvent: (message: string) => void;
  setStatus: (message: string) => void;
}

export interface ResourceTransferController {
  refresh: () => void;
}

const TRANSFER_MODES: TransferModeSpec[] = [
  {
    value: "FLEET_TO_FLEET",
    label: "Fleet -> Fleet",
    fromKind: "FLEET",
    toKind: "FLEET",
  },
  {
    value: "FLEET_TO_PLANET_STORAGE",
    label: "Fleet -> Personal Planet Storage",
    fromKind: "FLEET",
    toKind: "PLANET_STORAGE",
  },
  {
    value: "PLANET_STORAGE_TO_FLEET",
    label: "Personal Planet Storage -> Fleet",
    fromKind: "PLANET_STORAGE",
    toKind: "FLEET",
  },
];

export function createResourceTransferController(
  deps: ResourceTransferControllerDeps,
): ResourceTransferController {
  const modeSelect = document.getElementById("transferMode") as HTMLSelectElement;
  const targetFleetSelect = document.getElementById("transferTargetFleet") as HTMLSelectElement;
  const resourceSelect = document.getElementById("transferResource") as HTMLSelectElement;
  const amountInput = document.getElementById("transferAmount") as HTMLInputElement;
  const submitButton = document.getElementById("transferSubmitBtn") as HTMLButtonElement;

  function modeFromValue(value: string): TransferModeSpec {
    return TRANSFER_MODES.find((mode) => mode.value === value) ?? TRANSFER_MODES[0];
  }

  function ensureModeOptions(): void {
    if (modeSelect.options.length > 0) return;
    for (const mode of TRANSFER_MODES) {
      const option = document.createElement("option");
      option.value = mode.value;
      option.textContent = mode.label;
      modeSelect.appendChild(option);
    }
  }

  function selectedFleetPlanet(state: GameState, fleet: Fleet): Planet | null {
    return Object.values(state.planets)
      .filter((planet) =>
        planet.position.q === fleet.position.q && planet.position.r === fleet.position.r)
      .sort((a, b) => a.id - b.id)[0] ?? null;
  }

  function storeAmount(store: Fleet["inventory"], key: string): number {
    const value = store[key as keyof typeof store];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.trunc(value))
      : 0;
  }

  function fillResourceOptions(availability: TransferAvailability[]): void {
    const keep = resourceSelect.value;
    resourceSelect.replaceChildren();
    const appendGroup = (
      label: string,
      keys: readonly (typeof RESOURCE_KEYS)[number][],
    ): void => {
      const entries = keys
        .map((key) => availability.find((entry) => entry.key === key))
        .filter((entry): entry is TransferAvailability => Boolean(entry));
      if (entries.length === 0) return;
      const group = document.createElement("optgroup");
      group.label = label;
      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.key;
        option.textContent = `${entry.key} (max ${entry.maxAmount})`;
        group.appendChild(option);
      }
      resourceSelect.appendChild(group);
    };
    appendGroup("Raw Resources", RAW_RESOURCE_KEYS);
    appendGroup("Products", PRODUCT_RESOURCE_KEYS);
    if (availability.some((entry) => entry.key === keep)) resourceSelect.value = keep;
  }

  function fillTargetFleetOptions(
    state: GameState,
    selectedFleet: Fleet,
    activePlayerId: number,
    includeSelectedFleet: boolean,
  ): void {
    const previous = targetFleetSelect.value;
    targetFleetSelect.replaceChildren();
    const fleets = fleetsAtCoord(state, selectedFleet.position)
      .filter((fleet) => includeSelectedFleet || fleet.id !== selectedFleet.id)
      .filter((fleet) => fleet.ownerPlayerId === activePlayerId)
      .sort((a, b) => a.id - b.id);
    for (const fleet of fleets) {
      const option = document.createElement("option");
      option.value = String(fleet.id);
      option.textContent = `Fleet ${fleet.id} (${fleet.ownerPlayerId})`;
      targetFleetSelect.appendChild(option);
    }
    if (fleets.some((fleet) => String(fleet.id) === previous)) {
      targetFleetSelect.value = previous;
    }
  }

  function resolveContext(state: GameState, selectedFleet: Fleet): TransferContext | null {
    const mode = modeFromValue(modeSelect.value);
    const planet = selectedFleetPlanet(state, selectedFleet);
    if ((mode.fromKind !== "FLEET" || mode.toKind !== "FLEET") && !planet) return null;
    const fromId = mode.fromKind === "FLEET" ? selectedFleet.id : planet!.id;
    const fromStore = mode.fromKind === "FLEET"
      ? selectedFleet.inventory
      : (planet!.productStorageByPlayerId[String(selectedFleet.ownerPlayerId)] ?? {});
    if (mode.toKind === "FLEET") {
      const toFleet = state.fleets[targetFleetSelect.value];
      if (!toFleet) return null;
      return { mode, fromId, fromStore, toId: toFleet.id };
    }
    return { mode, fromId, fromStore, toId: planet!.id };
  }

  function buildAvailability(context: TransferContext): TransferAvailability[] {
    return RESOURCE_KEYS.flatMap((key) => {
      const maxAmount = storeAmount(context.fromStore, key);
      return maxAmount > 0 ? [{ key, maxAmount }] : [];
    });
  }

  function refresh(): void {
    ensureModeOptions();
    const { state, selectedFleet, activePlayerId: rawPlayerId } = deps.getContext();
    const activePlayerId = Number(rawPlayerId);
    const canControl = Boolean(
      state && selectedFleet && Number.isInteger(activePlayerId) && state.phase === "PLANNING",
    );
    modeSelect.disabled = !canControl;
    amountInput.disabled = true;
    resourceSelect.disabled = true;
    submitButton.disabled = true;
    if (!state || !selectedFleet || !Number.isInteger(activePlayerId) || state.phase !== "PLANNING") {
      targetFleetSelect.replaceChildren();
      targetFleetSelect.disabled = true;
      resourceSelect.replaceChildren();
      return;
    }

    const mode = modeFromValue(modeSelect.value);
    const needsPlanet = mode.fromKind !== "FLEET" || mode.toKind !== "FLEET";
    const needsTargetFleet = mode.toKind === "FLEET";
    const planet = selectedFleetPlanet(state, selectedFleet);
    if (needsTargetFleet) {
      fillTargetFleetOptions(
        state,
        selectedFleet,
        activePlayerId,
        mode.fromKind === "PLANET_STORAGE",
      );
      targetFleetSelect.disabled = targetFleetSelect.options.length === 0;
    } else {
      targetFleetSelect.replaceChildren();
      targetFleetSelect.disabled = true;
    }

    if ((needsTargetFleet && !targetFleetSelect.value) || (needsPlanet && !planet)) {
      resourceSelect.replaceChildren();
      return;
    }
    const context = resolveContext(state, selectedFleet);
    if (!context) {
      resourceSelect.replaceChildren();
      return;
    }
    const availability = buildAvailability(context);
    fillResourceOptions(availability);
    resourceSelect.disabled = availability.length === 0;
    const selected = availability.find((entry) => entry.key === resourceSelect.value);
    if (!selected) return;
    const requested = Math.trunc(Number(amountInput.value));
    const safeAmount = Number.isFinite(requested) ? requested : 1;
    amountInput.value = String(Math.max(1, Math.min(selected.maxAmount, safeAmount)));
    amountInput.min = "1";
    amountInput.max = String(selected.maxAmount);
    amountInput.disabled = false;
    submitButton.disabled = false;
  }

  function submit(): void {
    const { state, selectedFleet, activePlayerId } = deps.getContext();
    if (!state || !activePlayerId || state.phase !== "PLANNING") return;
    if (!selectedFleet) {
      deps.appendEvent("Select a controllable fleet first");
      return;
    }
    const context = resolveContext(state, selectedFleet);
    if (!context) {
      deps.appendEvent("Transfer endpoints are not available in current context");
      return;
    }
    const selected = buildAvailability(context).find((entry) => entry.key === resourceSelect.value);
    if (!selected) {
      deps.appendEvent("No transferable resources available for current source/target");
      return;
    }
    const amount = Math.trunc(Number(amountInput.value));
    if (!Number.isFinite(amount) || amount <= 0 || amount > selected.maxAmount) {
      deps.appendEvent(`Transfer amount must be within 1..${selected.maxAmount}`);
      return;
    }
    const sent = deps.sendMessage({
      type: "resourceTransfer",
      commandId: deps.nextCommandId("resource-transfer"),
      payload: {
        from: { kind: context.mode.fromKind, id: context.fromId },
        to: { kind: context.mode.toKind, id: context.toId },
        resourceKey: resourceSelect.value as (typeof RESOURCE_KEYS)[number],
        amount,
      },
    });
    if (sent) {
      deps.appendEvent(`Transfer sent: ${context.mode.label}, ${amount} ${resourceSelect.value}`);
      deps.setStatus("Transferring resources...");
    }
  }

  for (const element of [modeSelect, targetFleetSelect, resourceSelect, amountInput]) {
    element.addEventListener(element === amountInput ? "input" : "change", refresh);
  }
  submitButton.addEventListener("click", submit);
  return { refresh };
}
