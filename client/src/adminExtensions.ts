import type { AuditEntry } from "../../src/auditDomain";
import type { ShopOwnerRef } from "../../src/shopDomain";
import type { GameState } from "../../src/types";
import {
  STATION_CAPABILITIES,
  type Station,
  type StationCapability,
} from "../../src/worldObjectDomain";

interface SnapshotMetadata {
  id: string;
  turnNumber: number;
  point: "START" | "END";
  timestamp: number;
  phase: GameState["phase"];
}

const params = new URLSearchParams(window.location.search);
const apiBase = params.get("api") ?? "http://" + window.location.hostname + ":8080";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing admin extension element: " + id);
  return element as T;
}

const extensionPanels = Array.from(
  document.querySelectorAll<HTMLElement>(".admin-extension"),
);
const statusLine = byId<HTMLParagraphElement>("extStatusLine");
const stationName = byId<HTMLInputElement>("extStationName");
const stationQ = byId<HTMLInputElement>("extStationQ");
const stationR = byId<HTMLInputElement>("extStationR");
const stationOverview = byId<HTMLInputElement>("extStationOverview");
const stationFleetPower = byId<HTMLInputElement>("extStationFleetPower");
const stationArmyPower = byId<HTMLInputElement>("extStationArmyPower");
const stationGeneration = byId<HTMLInputElement>("extStationGeneration");
const stationRawStock = byId<HTMLInputElement>("extStationRawStock");
const stationInfo = byId<HTMLInputElement>("extStationInfo");
const stationStealth = byId<HTMLInputElement>("extStationStealth");
const stationCapabilities = byId<HTMLDivElement>("extStationCapabilities");
const saveStationBtn = byId<HTMLButtonElement>("extSaveStationBtn");
const cancelStationEditBtn = byId<HTMLButtonElement>("extCancelStationEditBtn");
const stationsList = byId<HTMLDivElement>("extStationsList");
const shopOwner = byId<HTMLSelectElement>("extShopOwner");
const shopResources = byId<HTMLInputElement>("extShopResources");
const shopDisappearing = byId<HTMLInputElement>("extShopDisappearing");
const shopKnowledge = byId<HTMLInputElement>("extShopKnowledge");
const saveShopBtn = byId<HTMLButtonElement>("extSaveShopBtn");
const itemTarget = byId<HTMLInputElement>("extItemTarget");
const itemKind = byId<HTMLSelectElement>("extItemKind");
const itemCode = byId<HTMLInputElement>("extItemCode");
const itemName = byId<HTMLInputElement>("extItemName");
const itemUseEffect = byId<HTMLInputElement>("extItemUseEffect");
const itemConsumable = byId<HTMLInputElement>("extItemConsumable");
const navigatorRange = byId<HTMLInputElement>("extNavigatorRange");
const navigatorOrigin = byId<HTMLSelectElement>("extNavigatorOrigin");
const baseFleetMovementPoints = byId<HTMLInputElement>("extBaseFleetMovementPoints");
const saveSystemSettingsBtn = byId<HTMLButtonElement>("extSaveSystemSettingsBtn");
const randomizeWarpBtn = byId<HTMLButtonElement>("extRandomizeWarpBtn");
const addItemBtn = byId<HTMLButtonElement>("extAddItemBtn");
const artifactsList = byId<HTMLDivElement>("extArtifactsList");
const anomalyQ = byId<HTMLInputElement>("extAnomalyQ");
const anomalyR = byId<HTMLInputElement>("extAnomalyR");
const anomalyInfo = byId<HTMLInputElement>("extAnomalyInfo");
const anomalyStealth = byId<HTMLInputElement>("extAnomalyStealth");
const addAnomalyBtn = byId<HTMLButtonElement>("extAddAnomalyBtn");
const anomaliesList = byId<HTMLPreElement>("extAnomaliesList");
const shipwrecksList = byId<HTMLPreElement>("extShipwrecksList");
const shipwreckQ = byId<HTMLInputElement>("extShipwreckQ");
const shipwreckR = byId<HTMLInputElement>("extShipwreckR");
const shipwreckSourceUnits = byId<HTMLInputElement>("extShipwreckSourceUnits");
const addShipwreckBtn = byId<HTMLButtonElement>("extAddShipwreckBtn");
const timerLine = byId<HTMLParagraphElement>("extTimerLine");
const endTurnBtn = byId<HTMLButtonElement>("extEndTurnBtn");
const reloadBtn = byId<HTMLButtonElement>("extReloadBtn");
const snapshotsList = byId<HTMLDivElement>("extSnapshotsList");
const auditList = byId<HTMLPreElement>("extAuditList");

let state: GameState | null = null;
let snapshots: SnapshotMetadata[] = [];
let editingStationId: number | null = null;
let loading = false;

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBase + path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
  return body;
}

function parseJson(value: string, fallback?: unknown): unknown {
  const trimmed = value.trim();
  if (!trimmed && fallback !== undefined) return fallback;
  return JSON.parse(trimmed);
}

function numeric(input: HTMLInputElement): number {
  return Math.max(0, Math.trunc(Number(input.value) || 0));
}

function selectedCapabilities(): StationCapability[] {
  return Array.from(
    stationCapabilities.querySelectorAll<HTMLInputElement>("input:checked"),
  ).map((input) => input.value as StationCapability);
}

function renderCapabilityInputs(): void {
  stationCapabilities.innerHTML = "";
  for (const capability of STATION_CAPABILITIES) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = capability;
    label.append(input, document.createTextNode(" " + capability));
    stationCapabilities.append(label);
  }
}

function stationPayload(): Record<string, unknown> {
  const capabilities = selectedCapabilities();
  const tags = stationStealth.checked ? ["STEALTH"] : [];
  if (tags.length > 0 && !capabilities.includes("TAGS")) {
    throw new Error("STEALTH requires the TAGS capability");
  }
  return {
    name: stationName.value.trim(),
    q: Math.trunc(Number(stationQ.value)),
    r: Math.trunc(Number(stationR.value)),
    capabilities,
    tags,
    overviewRange: numeric(stationOverview),
    fleetCombatPower: numeric(stationFleetPower),
    armyCombatPower: numeric(stationArmyPower),
    ...(capabilities.includes("RESOURCE_GENERATION")
      ? { resourceGeneration: parseJson(stationGeneration.value, {}) }
      : {}),
    ...(capabilities.includes("RAW_STOCK")
      ? { rawStock: parseJson(stationRawStock.value, {}) }
      : {}),
    ...(capabilities.includes("INFO_FRAGMENTS")
      ? { infoFragments: parseJson(stationInfo.value, {}) }
      : {}),
  };
}

function resetStationForm(): void {
  editingStationId = null;
  stationName.value = "";
  stationQ.value = "";
  stationR.value = "";
  stationOverview.value = "0";
  stationFleetPower.value = "0";
  stationArmyPower.value = "0";
  stationGeneration.value = "{}";
  stationRawStock.value = "{}";
  stationInfo.value = "{}";
  stationStealth.checked = false;
  for (const input of Array.from(
    stationCapabilities.querySelectorAll<HTMLInputElement>("input"),
  )) {
    input.checked = false;
  }
  saveStationBtn.textContent = "Create Station";
}

function loadStationForEdit(station: Station): void {
  editingStationId = station.id;
  stationName.value = station.name;
  stationQ.value = String(station.position.q);
  stationR.value = String(station.position.r);
  stationOverview.value = String(station.overviewRange);
  stationFleetPower.value = String(station.fleetCombatPower);
  stationArmyPower.value = String(station.armyCombatPower);
  stationGeneration.value = JSON.stringify(station.resourceGeneration);
  stationRawStock.value = JSON.stringify(station.rawStock);
  stationInfo.value = JSON.stringify(station.infoFragments);
  stationStealth.checked = station.tags.includes("STEALTH");
  for (const input of Array.from(
    stationCapabilities.querySelectorAll<HTMLInputElement>("input"),
  )) {
    input.checked = station.capabilities.includes(input.value as StationCapability);
  }
  saveStationBtn.textContent = "Save Station #" + station.id;
}

function actionButton(label: string, action: () => void, danger = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  if (danger) button.className = "danger";
  button.addEventListener("click", action);
  return button;
}

function renderStations(): void {
  stationsList.innerHTML = "";
  if (!state) return;
  for (const station of Object.values(state.stations).sort((a, b) => a.id - b.id)) {
    const row = document.createElement("div");
    row.className = "list-row";
    const text = document.createElement("span");
    text.textContent =
      "#" + station.id + " " + station.name + " [" + station.position.q + "," + station.position.r
      + "] " + station.capabilities.join(",");
    row.append(
      text,
      actionButton("Edit", () => loadStationForEdit(station)),
      actionButton("Delete", () => {
        if (!window.confirm("Delete Station #" + station.id + "?")) return;
        void mutate("/api/admin/stations/" + station.id, { method: "DELETE" });
      }, true),
    );
    stationsList.append(row);
  }
}

function shopRefFromValue(value: string): ShopOwnerRef | null {
  const [kind, idValue] = value.split(":");
  const id = Number(idValue);
  if (!Number.isInteger(id) || (kind !== "PLANET" && kind !== "STATION")) return null;
  return { kind, id };
}

function selectedShop() {
  const ref = shopRefFromValue(shopOwner.value);
  if (!state || !ref) return null;
  return ref.kind === "PLANET"
    ? state.planets[ref.id]?.shop ?? null
    : state.stations[ref.id]?.shop ?? null;
}

function syncShopFields(): void {
  const shop = selectedShop();
  shopResources.value = JSON.stringify(shop?.resources ?? {});
  shopDisappearing.value = JSON.stringify(shop?.disappearingItems ?? []);
  shopKnowledge.value = JSON.stringify(shop?.items.knowledge ?? []);
}

function renderShops(): void {
  const keep = shopOwner.value;
  shopOwner.innerHTML = "";
  if (!state) return;
  for (const planet of Object.values(state.planets)) {
    const option = document.createElement("option");
    option.value = "PLANET:" + planet.id;
    option.textContent = "Planet " + planet.name + " (#" + planet.id + ")";
    shopOwner.append(option);
  }
  for (const station of Object.values(state.stations)) {
    if (!station.capabilities.includes("SHOP")) continue;
    const option = document.createElement("option");
    option.value = "STATION:" + station.id;
    option.textContent = "Station " + station.name + " (#" + station.id + ")";
    shopOwner.append(option);
  }
  if (Array.from(shopOwner.options).some((option) => option.value === keep)) {
    shopOwner.value = keep;
  }
  syncShopFields();
}

function renderWorldObjects(): void {
  if (!state) return;
  anomaliesList.textContent = JSON.stringify(Object.values(state.anomalies), null, 2);
  shipwrecksList.textContent = JSON.stringify(Object.values(state.shipwrecks), null, 2);
  artifactsList.innerHTML = "";
  for (const artifact of Object.values(state.artifacts)) {
    const row = document.createElement("div");
    row.className = "list-row";
    const text = document.createElement("span");
    text.textContent = artifact.id + " " + artifact.name + " @ " + JSON.stringify(artifact.owner);
    row.append(text, actionButton("Delete", () => {
      if (!window.confirm("Delete " + artifact.id + "?")) return;
      void mutate("/api/admin/artifacts/" + encodeURIComponent(artifact.id), { method: "DELETE" });
    }, true));
    artifactsList.append(row);
  }
}
function renderNavigatorOrigins(): void {
  const keep = navigatorOrigin.value;
  navigatorOrigin.innerHTML = "";
  if (!state) return;
  for (const player of Object.values(state.players).sort((a, b) => a.id - b.id)) {
    const faction = state.factions[player.factionId];
    if (!faction?.isNavigator) continue;
    const option = document.createElement("option");
    option.value = String(player.id);
    option.textContent = player.name + " (#" + player.id + ")";
    navigatorOrigin.append(option);
  }
  if (Array.from(navigatorOrigin.options).some((option) => option.value === keep)) {
    navigatorOrigin.value = keep;
  }
}


function renderSnapshots(): void {
  snapshotsList.innerHTML = "";
  for (const snapshot of [...snapshots].sort((a, b) => b.timestamp - a.timestamp)) {
    const row = document.createElement("div");
    row.className = "list-row";
    const text = document.createElement("span");
    text.textContent =
      "Turn " + snapshot.turnNumber + " " + snapshot.point + " · "
      + new Date(snapshot.timestamp).toLocaleString();
    const rollback = actionButton("Rollback", () => {
      if (!window.confirm("Rollback to " + snapshot.id + "? Current live state will be replaced.")) return;
      void mutate(
        "/api/admin/turn-snapshots/" + encodeURIComponent(snapshot.id) + "/rollback",
        { method: "POST" },
      );
    }, true);
    rollback.disabled = snapshot.phase !== "PLANNING";
    row.append(text, rollback);
    snapshotsList.append(row);
  }
}

function refreshTimer(): void {
  if (!state || state.phase !== "PLANNING") {
    timerLine.textContent = "Timer: -";
    return;
  }
  const remaining = Math.max(0, state.turnTimer.turnEndsAt - Date.now());
  timerLine.textContent =
    "Turn " + state.turnNumber + " deadline "
    + new Date(state.turnTimer.turnEndsAt).toLocaleString() + " · "
    + Math.ceil(remaining / 1000) + "s remaining";
}

async function loadAll(): Promise<void> {
  if (loading || document.body.dataset.adminAuthenticated !== "true") return;
  loading = true;
  try {
    const [stateResponse, auditResponse, snapshotResponse] = await Promise.all([
      apiRequest<{ state: GameState }>("/api/state"),
      apiRequest<{ audit: AuditEntry[] }>("/api/admin/audit"),
      apiRequest<{ snapshots: SnapshotMetadata[] }>("/api/admin/turn-snapshots"),
    ]);
    state = stateResponse.state;
    baseFleetMovementPoints.value = String(state.systemSettings.baseFleetMovementPoints);
    renderNavigatorOrigins();
    snapshots = snapshotResponse.snapshots;
    auditList.textContent = JSON.stringify(auditResponse.audit.slice(-200).reverse(), null, 2);
    renderStations();
    renderShops();
    renderWorldObjects();
    renderSnapshots();
    refreshTimer();
    statusLine.textContent = "Extension data loaded";
  } catch (error) {
    statusLine.textContent = "Extension load failed: " + (error as Error).message;
  } finally {
    loading = false;
  }
}

async function mutate(path: string, init: RequestInit): Promise<boolean> {
  try {
    await apiRequest(path, init);
    statusLine.textContent = "Saved";
    await loadAll();
    return true;
  } catch (error) {
    statusLine.textContent = "Operation failed: " + (error as Error).message;
    return false;
  }
}

saveStationBtn.addEventListener("click", () => {
  try {
    const id = editingStationId;
    void mutate(id === null ? "/api/admin/stations" : "/api/admin/stations/" + id, {
      method: id === null ? "POST" : "PUT",
      body: JSON.stringify(stationPayload()),
    }).then((saved) => { if (saved) resetStationForm(); });
  } catch (error) {
    statusLine.textContent = (error as Error).message;
  }
});
cancelStationEditBtn.addEventListener("click", resetStationForm);
shopOwner.addEventListener("change", syncShopFields);
saveShopBtn.addEventListener("click", () => {
  const ref = shopRefFromValue(shopOwner.value);
  if (!ref) return;
  try {
    void mutate("/api/admin/shops/" + ref.kind + "/" + ref.id, {
      method: "PUT",
      body: JSON.stringify({
        resources: parseJson(shopResources.value, {}),
        disappearingItems: parseJson(shopDisappearing.value, []),
        knowledge: parseJson(shopKnowledge.value, []),
      }),
    });
  } catch (error) {
    statusLine.textContent = (error as Error).message;
  }
});
addItemBtn.addEventListener("click", () => {
  try {
    const target = parseJson(itemTarget.value);
    const definitionCode = itemCode.value.trim().toUpperCase();
    const isNavigator = itemKind.value === "ARTIFACT" && definitionCode === "NAVIGATOR";
    if (isNavigator && !navigatorOrigin.value) throw new Error("Выберите первоначального игрока-Навигатора");
    const payload = itemKind.value === "KNOWLEDGE"
      ? { kind: "KNOWLEDGE", code: itemCode.value.trim(), target }
      : {
          kind: "ARTIFACT",
          definitionCode,
          name: itemName.value.trim(),
          consumable: itemConsumable.checked,
          target,
          ...(isNavigator ? {
            navigatorRange: Math.max(1, Math.trunc(Number(navigatorRange.value))),
            navigatorOriginPlayerId: Number(navigatorOrigin.value),
          } : {}),
          ...(itemUseEffect.value.trim()
            ? { useEffect: parseJson(itemUseEffect.value) }
            : {}),
        };
    void mutate("/api/admin/items", { method: "POST", body: JSON.stringify(payload) });
  } catch (error) {
    statusLine.textContent = (error as Error).message;
  }
});
addAnomalyBtn.addEventListener("click", () => {
  void mutate("/api/admin/anomalies", {
    method: "POST",
    body: JSON.stringify({
      q: Math.trunc(Number(anomalyQ.value)),
      r: Math.trunc(Number(anomalyR.value)),
      tags: anomalyStealth.checked ? ["STEALTH"] : [],
      informationRef: anomalyInfo.value.trim(),
    }),
  });
});
addShipwreckBtn.addEventListener("click", () => {
  try {
    const sourceUnitIds = shipwreckSourceUnits.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number);
    if (sourceUnitIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error("Source unit IDs must be positive integers");
    }
    void mutate("/api/admin/shipwrecks", {
      method: "POST",
      body: JSON.stringify({
        q: Math.trunc(Number(shipwreckQ.value)),
        r: Math.trunc(Number(shipwreckR.value)),
        sourceUnitIds: [...new Set(sourceUnitIds)],
      }),
    });
  } catch (error) {
    statusLine.textContent = (error as Error).message;
  }
});
endTurnBtn.addEventListener("click", () => {
  if (!window.confirm("Завершить ход принудительно?")) return;
  void mutate("/api/admin/end-turn", { method: "POST" });
});

saveSystemSettingsBtn.addEventListener("click", () => {
  const value = Math.trunc(Number(baseFleetMovementPoints.value));
  void mutate("/api/admin/system-settings", {
    method: "PUT",
    body: JSON.stringify({ baseFleetMovementPoints: value }),
  });
});
randomizeWarpBtn.addEventListener("click", () => {
  if (!window.confirm("Сгенерировать новые значения ШВВ для всех гексов?")) return;
  void mutate("/api/admin/warp-disturbance/randomize", { method: "POST" });
});

reloadBtn.addEventListener("click", () => void loadAll());

function syncVisibility(): void {
  const visible = document.body.dataset.adminAuthenticated === "true";
  for (const panel of extensionPanels) panel.classList.toggle("hidden", !visible);
  if (visible) void loadAll();
}

renderCapabilityInputs();
resetStationForm();
new MutationObserver(syncVisibility).observe(document.body, {
  attributes: true,
  attributeFilter: ["data-admin-authenticated"],
});
syncVisibility();
window.setInterval(refreshTimer, 1000);
