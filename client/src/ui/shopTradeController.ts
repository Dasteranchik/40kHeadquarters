import type { ClientMessage } from "../../../src/api/ws";
import { RESOURCE_KEYS, type ResourceKey } from "../../../src/planetDomain";
import type { Fleet, GameState, ResourceStore } from "../../../src/types";
import { selectedShop, shopOwnerKey, shopsAtFleet } from "../game/shopLocations";

export interface ShopTradeViewContext {
  state: GameState | null;
  selectedFleet: Fleet | null;
}

export interface ShopTradeControllerDeps {
  getContext: () => ShopTradeViewContext;
  sendMessage: (message: ClientMessage) => boolean;
  nextCommandId: (prefix: string) => string;
  appendEvent: (message: string) => void;
  onShopChanged: () => void;
}

export interface ShopTradeController {
  refresh: () => void;
}

export function createShopTradeController(
  deps: ShopTradeControllerDeps,
): ShopTradeController {
  const ownerSelect = document.getElementById("shopOwner") as HTMLSelectElement;
  const receiveResourceSelect = document.getElementById(
    "shopReceiveResource",
  ) as HTMLSelectElement;
  const receiveAmountInput = document.getElementById("shopReceiveAmount") as HTMLInputElement;
  const paymentList = document.getElementById("shopPaymentList") as HTMLDivElement;
  const tradeButton = document.getElementById("shopTradeBtn") as HTMLButtonElement;
  let paymentDraftFleetId: string | null = null;

  function renderPaymentOptions(fleet: Fleet, enabled: boolean): void {
    const preserveDraft = paymentDraftFleetId === fleet.id;
    const previousAmounts = new Map<string, string>();
    for (const input of paymentList.querySelectorAll<HTMLInputElement>(
      "input[data-resource-key]",
    )) {
      const key = input.dataset.resourceKey;
      if (key && preserveDraft) previousAmounts.set(key, input.value);
    }
    paymentList.replaceChildren();
    paymentDraftFleetId = fleet.id;

    let hasResources = false;
    for (const key of RESOURCE_KEYS) {
      const available = Math.floor(fleet.inventory[key] ?? 0);
      if (available <= 0) continue;
      hasResources = true;
      const row = document.createElement("label");
      row.className = "shop-payment-row";
      const name = document.createElement("span");
      name.textContent = `${key}: ${available}`;
      const amount = document.createElement("input");
      amount.type = "number";
      amount.min = "0";
      amount.max = String(available);
      amount.step = "1";
      amount.dataset.resourceKey = key;
      amount.disabled = !enabled;
      const previous = Math.trunc(Number(previousAmounts.get(key) ?? "0"));
      amount.value = String(
        Number.isFinite(previous) ? Math.max(0, Math.min(previous, available)) : 0,
      );
      row.append(name, amount);
      paymentList.append(row);
    }
    if (!hasResources) {
      paymentList.textContent = "No resources available for payment";
    }
  }

  function selectedPayment(): ResourceStore {
    const payment: ResourceStore = {};
    for (const input of paymentList.querySelectorAll<HTMLInputElement>(
      "input[data-resource-key]",
    )) {
      const key = input.dataset.resourceKey;
      const value = Number(input.value);
      if (
        !key
        || !RESOURCE_KEYS.includes(key as ResourceKey)
        || !Number.isFinite(value)
        || !Number.isInteger(value)
        || value < 0
        || value > Number(input.max)
      ) {
        throw new Error("Payment contains an invalid resource or amount");
      }
      if (value === 0) continue;
      payment[key as ResourceKey] = value;
    }
    if (Object.keys(payment).length === 0) {
      throw new Error("Select at least one payment resource");
    }
    return payment;
  }

  function refresh(): void {
    const { state, selectedFleet } = deps.getContext();
    const currentShop = ownerSelect.value;
    const currentResource = receiveResourceSelect.value;
    ownerSelect.innerHTML = "";
    receiveResourceSelect.innerHTML = "";
    ownerSelect.disabled = true;
    receiveResourceSelect.disabled = true;
    receiveAmountInput.disabled = true;
    tradeButton.disabled = true;

    if (!state || !selectedFleet) {
      paymentDraftFleetId = null;
      paymentList.replaceChildren();
      paymentList.textContent = "No resources available for payment";
      return;
    }

    const shops = shopsAtFleet(state, selectedFleet);
    for (const entry of shops) {
      const option = document.createElement("option");
      option.value = shopOwnerKey(entry.owner);
      option.textContent = entry.label;
      ownerSelect.append(option);
    }
    if (shops.some((entry) => shopOwnerKey(entry.owner) === currentShop)) {
      ownerSelect.value = currentShop;
    }

    const selected = selectedShop(state, selectedFleet, ownerSelect.value);
    if (!selected) {
      paymentDraftFleetId = null;
      paymentList.replaceChildren();
      return;
    }
    for (const key of RESOURCE_KEYS) {
      const available = selected.shop.resources[key] ?? 0;
      if (available <= 0) continue;
      const option = document.createElement("option");
      option.value = key;
      option.textContent = `${key} (available ${available})`;
      receiveResourceSelect.append(option);
    }
    if (RESOURCE_KEYS.some((key) => key === currentResource)) {
      receiveResourceSelect.value = currentResource;
    }
    const canTrade = state.phase === "PLANNING" && receiveResourceSelect.options.length > 0;
    ownerSelect.disabled = state.phase !== "PLANNING";
    receiveResourceSelect.disabled = !canTrade;
    receiveAmountInput.disabled = !canTrade;
    renderPaymentOptions(selectedFleet, canTrade);
    tradeButton.disabled = !canTrade;
  }

  function submitTrade(): void {
    const { state, selectedFleet } = deps.getContext();
    if (!state || !selectedFleet || state.phase !== "PLANNING") return;
    const selected = selectedShop(state, selectedFleet, ownerSelect.value);
    const amount = Math.trunc(Number(receiveAmountInput.value));
    if (!selected || !Number.isFinite(amount) || amount <= 0) return;
    try {
      deps.sendMessage({
        type: "shopTrade",
        commandId: deps.nextCommandId("shop"),
        payload: {
          shop: selected.owner,
          fleetId: selectedFleet.id,
          receive: {
            resourceKey: receiveResourceSelect.value as ResourceKey,
            amount,
          },
          payment: selectedPayment(),
        },
      });
    } catch (error) {
      deps.appendEvent(`Shop trade rejected locally: ${(error as Error).message}`);
    }
  }

  ownerSelect.addEventListener("change", deps.onShopChanged);
  tradeButton.addEventListener("click", submitTrade);

  return { refresh };
}
