import "./style.css";

import { Application, Container } from "pixi.js";
import { initLocalization } from "./i18n";

import type {
  ClientMessage,
} from "../../src/api/ws";
import { areNeighbors, coordKey } from "../../src/hex";
import {
  INFO_CATEGORIES,
  PRODUCT_RECIPES,
  PRODUCT_RESOURCE_KEYS,
  RAW_RESOURCE_KEYS,
  TITHE_LEVEL_ORDER,
} from "../../src/planetDomain";
import { getObjectsAtHex } from "../../src/worldObjectDomain";
import {
  clearMapLayers,
  fleetsAtCoord,
  getTile,
  isInsideMap,
  ownFleetAtCoord as ownFleetAtCoordByPlayer,
  ownFleetsAtCoord as ownFleetsAtCoordByPlayer,
  renderMapScene,
  toHex,
  toPixel,
  type MapLayers,
} from "./mapScene";
import {
  buildAdminCreateFleetPayload,
  buildAdminCreatePlanetPayload,
  buildAdminCreatePlayerPayload,
  createAdminActions,
} from "./admin/actions";
import { bindMainEvents } from "./bootstrap/wiring";
import { createOrderActions } from "./game/orders";
import {
  activePlayerId,
  effectiveFleetStance,
  getPlayerResources,
  getSelectedFleet,
  isAdmin,
  reconcilePendingFleetStances,
} from "./game/selectors";
import { areMutualAllies } from "../../src/utils/relations";
import { createCanvasController } from "./input/canvasController";
import { createMapCameraController, createPanGestureState } from "./map/camera";
import { createNetworkSessionController } from "./network/session";
import type { SessionInfo } from "./session";
import {
  buildSelectedFleetDetails,
  formatStore,
  refreshAdminFleetOwnerOptions,
  refreshTargetOptions,
  renderAdminLists,
  updateAuthView,
  updateRelationsWindow,
  updateStanceButtons,
  type HudElements,
} from "./ui/hud";
import { createHexContextMenuController } from "./ui/contextMenu";
import { createResourceTransferController } from "./ui/resourceTransferController";
import { createShopTradeController } from "./ui/shopTradeController";
import type {
  Fleet,
  FleetStance,
  GameState,
  HexCoord,
  Planet,
  PlanetAction,
  PlanetActionKind,
} from "../../src/types";

type Nullable<T> = T | null;

const DEFAULT_MAP_ZOOM = 1;
const MIN_MAP_ZOOM = 0.6;
const MAX_MAP_ZOOM = 2.5;
const TACTICAL_HEX_SCALE = 10;
const BUTTON_ZOOM_STEP = 0.15;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const PAN_DRAG_THRESHOLD_PX = 5;
const RENDER_RESOLUTION = Math.max(1, window.devicePixelRatio || 1);
const MAP_TEXT_MAX_RESOLUTION = 4;

initLocalization();

const params = new URLSearchParams(window.location.search);
const apiBase = params.get("api") ?? `http://${window.location.hostname}:8080`;
const wsBase = params.get("ws") ?? `ws://${window.location.hostname}:8080`;

const statusLine = document.getElementById("statusLine") as HTMLParagraphElement;
const userValueEl = document.getElementById("userValue") as HTMLElement;
const turnNumberEl = document.getElementById("turnNumber") as HTMLElement;
const phaseValueEl = document.getElementById("phaseValue") as HTMLElement;
const turnCountdownEl = document.getElementById("turnCountdown") as HTMLElement;
const resourceValueEl = document.getElementById("resourceValue") as HTMLElement;
const playerInfoEl = document.getElementById("playerInfo") as HTMLParagraphElement;
const authStateEl = document.getElementById("authState") as HTMLParagraphElement;
const selectedFleetLine = document.getElementById("selectedFleetLine") as HTMLParagraphElement;
const selectedFleetDetailsEl = document.getElementById("selectedFleetDetails") as HTMLPreElement;
const pathLine = document.getElementById("pathLine") as HTMLParagraphElement;
const targetSelect = document.getElementById("targetSelect") as HTMLSelectElement;
const eventsLog = document.getElementById("eventsLog") as HTMLPreElement;
const mapViewBtn = document.getElementById("mapViewBtn") as HTMLButtonElement;
const eventsViewBtn = document.getElementById("eventsViewBtn") as HTMLButtonElement;
const stageZoneEl = document.querySelector(".stage-zone") as HTMLElement;
const playerEventsViewEl = document.getElementById("playerEventsView") as HTMLElement;
const playerEventsListEl = document.getElementById("playerEventsList") as HTMLDivElement;
const adminSection = document.getElementById("adminSection") as HTMLElement;

const loginUserInput = document.getElementById("loginUser") as HTMLInputElement;
const loginPassInput = document.getElementById("loginPass") as HTMLInputElement;
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;

const clearPathBtn = document.getElementById("clearPathBtn") as HTMLButtonElement;
const fuelToMovementAmountInput = document.getElementById("fuelToMovementAmount") as HTMLInputElement;
const fuelToMovementBtn = document.getElementById("fuelToMovementBtn") as HTMLButtonElement;
const armyTransportTargetSelect = document.getElementById("armyTransportTarget") as HTMLSelectElement;
const armyEmbarkBtn = document.getElementById("armyEmbarkBtn") as HTMLButtonElement;
const armyDisembarkBtn = document.getElementById("armyDisembarkBtn") as HTMLButtonElement;
const armyTransportRequestsEl = document.getElementById("armyTransportRequests") as HTMLDivElement;
const setAttackBtn = document.getElementById("setAttackBtn") as HTMLButtonElement;
const setDefenseBtn = document.getElementById("setDefenseBtn") as HTMLButtonElement;
const shareAllyVisionBtn = document.getElementById("shareAllyVisionBtn") as HTMLButtonElement;
const warBtn = document.getElementById("warBtn") as HTMLButtonElement;
const allyBtn = document.getElementById("allyBtn") as HTMLButtonElement;
const readyBtn = document.getElementById("readyBtn") as HTMLButtonElement;
const endTurnBtn = document.getElementById("endTurnBtn") as HTMLButtonElement;
const fleetArtifactSelect = document.getElementById("fleetArtifact") as HTMLSelectElement;
const artifactUseBtn = document.getElementById("artifactUseBtn") as HTMLButtonElement;
const detectedObjectsEl = document.getElementById("detectedObjects") as HTMLPreElement;
const selectedPlanetLine = document.getElementById("selectedPlanetLine") as HTMLParagraphElement;
const selectedPlanetDetailsEl = document.getElementById(
  "selectedPlanetDetails",
) as HTMLPreElement;
const planetRawResourceSelect = document.getElementById(
  "planetRawResource",
) as HTMLSelectElement;
const planetRawAmountInput = document.getElementById(
  "planetRawAmount",
) as HTMLInputElement;
const planetTakeStockBtn = document.getElementById(
  "planetTakeStockBtn",
) as HTMLButtonElement;
const planetProductSelect = document.getElementById("planetProduct") as HTMLSelectElement;
const planetProductAmountInput = document.getElementById(
  "planetProductAmount",
) as HTMLInputElement;
const planetCreateProductBtn = document.getElementById(
  "planetCreateProductBtn",
) as HTMLButtonElement;
const planetRaiseMoraleBtn = document.getElementById(
  "planetRaiseMoraleBtn",
) as HTMLButtonElement;
const planetDeployInformantBtn = document.getElementById(
  "planetDeployInformantBtn",
) as HTMLButtonElement;
const planetInfoCategorySelect = document.getElementById(
  "planetInfoCategory",
) as HTMLSelectElement;
const planetTitheLevelSelect = document.getElementById(
  "planetTitheLevel",
) as HTMLSelectElement;
const planetSetTitheBtn = document.getElementById("planetSetTitheBtn") as HTMLButtonElement;
const planetReportWorldBtn = document.getElementById("planetReportWorldBtn") as HTMLButtonElement;
const secretStorageTargetSelect = document.getElementById("secretStorageTarget") as HTMLSelectElement;
const secretStoragePasswordInput = document.getElementById("secretStoragePassword") as HTMLInputElement;
const secretStorageOpenBtn = document.getElementById("secretStorageOpenBtn") as HTMLButtonElement;
const secretStorageContentsEl = document.getElementById("secretStorageContents") as HTMLPreElement;
const administratumPanel = document.getElementById("administratumPanel") as HTMLElement;
const administratumRegistryEl = document.getElementById("administratumRegistry") as HTMLDivElement;

const adminPlayerIdInput = document.getElementById("adminPlayerId") as HTMLInputElement;
const adminPlayerNameInput = document.getElementById("adminPlayerName") as HTMLInputElement;
const adminPlayerUsernameInput = document.getElementById("adminPlayerUsername") as HTMLInputElement;
const adminPlayerPasswordInput = document.getElementById("adminPlayerPassword") as HTMLInputElement;
const adminAddPlayerBtn = document.getElementById("adminAddPlayerBtn") as HTMLButtonElement;
const adminPlayerList = document.getElementById("adminPlayerList") as HTMLElement;

const adminPlanetIdInput = document.getElementById("adminPlanetId") as HTMLInputElement;
const adminPlanetQInput = document.getElementById("adminPlanetQ") as HTMLInputElement;
const adminPlanetRInput = document.getElementById("adminPlanetR") as HTMLInputElement;
const adminPlanetResInput = document.getElementById("adminPlanetRes") as HTMLInputElement;
const adminPlanetInfInput = document.getElementById("adminPlanetInf") as HTMLInputElement;
const adminAddPlanetBtn = document.getElementById("adminAddPlanetBtn") as HTMLButtonElement;
const adminPlanetList = document.getElementById("adminPlanetList") as HTMLElement;

const adminFleetIdInput = document.getElementById("adminFleetId") as HTMLInputElement;
const adminFleetOwnerSelect = document.getElementById("adminFleetOwner") as HTMLSelectElement;
const adminFleetQInput = document.getElementById("adminFleetQ") as HTMLInputElement;
const adminFleetRInput = document.getElementById("adminFleetR") as HTMLInputElement;
const adminFleetPowerInput = document.getElementById("adminFleetPower") as HTMLInputElement;
const adminFleetHealthInput = document.getElementById("adminFleetHealth") as HTMLInputElement;
const adminFleetInfluenceInput = document.getElementById("adminFleetInfluence") as HTMLInputElement;
const adminFleetVisionInput = document.getElementById("adminFleetVision") as HTMLInputElement;
const adminFleetCapacityInput = document.getElementById("adminFleetCapacity") as HTMLInputElement;
const adminAddFleetBtn = document.getElementById("adminAddFleetBtn") as HTMLButtonElement;
const adminFleetList = document.getElementById("adminFleetList") as HTMLElement;

const stageEl = document.getElementById("stage") as HTMLDivElement;
const hoverHexInfoEl = document.getElementById("hoverHexInfo") as HTMLDivElement;
const alliancesListEl = document.getElementById("alliancesList") as HTMLUListElement;
const warsListEl = document.getElementById("warsList") as HTMLUListElement;
const hexContextMenuEl = document.getElementById("hexContextMenu") as HTMLDivElement;
const hexContextTitleEl = document.getElementById("hexContextTitle") as HTMLElement;
const hexContextBodyEl = document.getElementById("hexContextBody") as HTMLDivElement;
const hexContextCloseBtn = document.getElementById("hexContextCloseBtn") as HTMLButtonElement;
const mapZoomOutBtn = document.getElementById("mapZoomOutBtn") as HTMLButtonElement;
const mapZoomInBtn = document.getElementById("mapZoomInBtn") as HTMLButtonElement;
const mapZoomResetBtn = document.getElementById("mapZoomResetBtn") as HTMLButtonElement;
const mapZoomValueEl = document.getElementById("mapZoomValue") as HTMLSpanElement;
const tacticalMapBtn = document.getElementById("tacticalMapBtn") as HTMLButtonElement;
const strategicMapBtn = document.getElementById("strategicMapBtn") as HTMLButtonElement;
const navigatorMapBtn = document.getElementById("navigatorMapBtn") as HTMLButtonElement;
const resetFocusBtn = document.getElementById("resetFocusBtn") as HTMLButtonElement;
const resetRouteBtn = document.getElementById("resetRouteBtn") as HTMLButtonElement;
const hudElements: HudElements = {
  userValueEl,
  authStateEl,
  playerInfoEl,
  adminSection,
  turnNumberEl,
  phaseValueEl,
  resourceValueEl,
  selectedFleetLine,
  selectedFleetDetailsEl,
  pathLine,
  clearPathBtn,
  setAttackBtn,
  setDefenseBtn,
  shareAllyVisionBtn,
  warBtn,
  allyBtn,
  readyBtn,
  endTurnBtn,
  targetSelect,
  adminFleetOwnerSelect,
  adminPlayerList,
  adminPlanetList,
  adminFleetList,
  alliancesListEl,
  warsListEl,
};

const app = new Application({
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: RENDER_RESOLUTION,
  resizeTo: stageEl,
});
const canvasEl = app.view as HTMLCanvasElement;
stageEl.appendChild(canvasEl);

const terrainLayer = new Container();
const warpLayer = new Container();
const planetLayer = new Container();
const fleetLayer = new Container();
const effectLayer = new Container();
const fogLayer = new Container();
const uiLayer = new Container();
const mapLayers: MapLayers = {
  terrainLayer,
  warpLayer,
  planetLayer,
  fleetLayer,
  effectLayer,
  fogLayer,
  uiLayer,
};

app.stage.addChild(terrainLayer);
app.stage.addChild(warpLayer);
app.stage.addChild(planetLayer);
app.stage.addChild(fleetLayer);
app.stage.addChild(effectLayer);
app.stage.addChild(fogLayer);
app.stage.addChild(uiLayer);

interface RuntimeState {
  session: Nullable<SessionInfo>;
  socket: Nullable<WebSocket>;
  gameState: Nullable<GameState>;
  selectedFleetId: Nullable<string>;
  plannedPath: HexCoord[];
  plannedMovePathsByFleetId: Record<string, HexCoord[]>;
  reconnectTimer: Nullable<number>;
  pendingFleetStances: Record<string, FleetStance>;
  mapZoom: number;
  strategicMapZoom: number;
  mapMode: "STRATEGIC" | "TACTICAL";
  tacticalCenter: HexCoord | null;
  selectedStrategicHex: HexCoord | null;
  navigatorLayerEnabled: boolean;
  focusedUnitId: number | null;
}

const runtime: RuntimeState = {
  session: null,
  socket: null,
  gameState: null,
  selectedFleetId: null,
  plannedPath: [],
  plannedMovePathsByFleetId: {},
  reconnectTimer: null,
  pendingFleetStances: {},
  mapZoom: DEFAULT_MAP_ZOOM,
  strategicMapZoom: DEFAULT_MAP_ZOOM,
  mapMode: "STRATEGIC",
  tacticalCenter: null,
  selectedStrategicHex: null,
  navigatorLayerEnabled: false,
  focusedUnitId: null,
};

const resourceTransferController = createResourceTransferController({
  getContext: () => ({
    state: runtime.gameState,
    activePlayerId: activePlayerId(runtime),
    selectedFleet: runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null,
  }),
  sendMessage,
  nextCommandId: nextActionId,
  appendEvent,
  setStatus,
});

const shopTradeController = createShopTradeController({
  getContext: () => ({
    state: runtime.gameState,
    selectedFleet: runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null,
  }),
  sendMessage,
  nextCommandId: nextActionId,
  appendEvent,
  onShopChanged: refreshHud,
});

const mapCamera = createMapCameraController(
  app,
  mapLayers,
  runtime,
  {
    stageEl,
    zoomOutBtn: mapZoomOutBtn,
    zoomInBtn: mapZoomInBtn,
    zoomResetBtn: mapZoomResetBtn,
    zoomValueEl: mapZoomValueEl,
  },
  {
    defaultZoom: DEFAULT_MAP_ZOOM,
    minZoom: MIN_MAP_ZOOM,
    maxZoom: MAX_MAP_ZOOM,
    maxTextResolution: MAP_TEXT_MAX_RESOLUTION,
    renderResolution: RENDER_RESOLUTION,
  },
);
const panGesture = createPanGestureState();

function ownFleetAtCoord(state: GameState, coord: HexCoord): Nullable<Fleet> {
  const playerId = activePlayerId(runtime);
  if (!playerId) {
    return null;
  }

  return ownFleetAtCoordByPlayer(state, coord, playerId);
}

function ownFleetsAtCoord(state: GameState, coord: HexCoord): Fleet[] {
  const playerId = activePlayerId(runtime);
  if (!playerId) {
    return [];
  }

  return ownFleetsAtCoordByPlayer(state, coord, playerId);
}

function activeMapHexScale(): number {
  return runtime.mapMode === "TACTICAL" ? TACTICAL_HEX_SCALE : 1;
}

function renderScene(): void {
  const state = runtime.gameState;
  if (!state) {
    hexContextMenu.hide();
    clearMapLayers(mapLayers);
    return;
  }

  if (runtime.mapMode === "STRATEGIC" && runtime.focusedUnitId !== null) {
    const focusedUnit = state.fleets[runtime.focusedUnitId];
    if (focusedUnit) {
      const point = toPixel(focusedUnit.position);
      app.stage.position.set(
        stageEl.clientWidth / 2 - point.x * runtime.mapZoom,
        stageEl.clientHeight / 2 - point.y * runtime.mapZoom,
      );
    }
  }
  const selectedFleet = getSelectedFleet(runtime, state);
  const plannedMovePathsByFleetId = { ...runtime.plannedMovePathsByFleetId };
  if (selectedFleet && runtime.plannedPath.length > 0) {
    delete plannedMovePathsByFleetId[selectedFleet.id];
  }

  renderMapScene({
    state,
    layers: mapLayers,
    navigatorLayerEnabled: runtime.navigatorLayerEnabled,
    tacticalCenter: runtime.mapMode === "TACTICAL" ? runtime.tacticalCenter : null,
    strategicSelectedHex: runtime.mapMode === "STRATEGIC" && !selectedFleet ? runtime.selectedStrategicHex : null,
    selectedFleet,
    plannedPath: runtime.plannedPath,
    plannedMovePathsByFleetId,
    playerId: activePlayerId(runtime),
    hasFullMapVisibility: isAdmin(runtime),
    textResolution: mapCamera.mapTextResolution(),
    hexScale: activeMapHexScale(),
  });
}

function appendEvent(message: string): void {
  eventsLog.prepend(document.createTextNode(`[${new Date().toLocaleTimeString()}] ${message}\n`));
}

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function setHoveredHexInfo(coord: HexCoord | null): void {
  if (!coord) {
    hoverHexInfoEl.textContent = "Hex: -";
    return;
  }

  hoverHexInfoEl.textContent = `Hex: q=${coord.q}, r=${coord.r}`;
}

const hexContextMenu = createHexContextMenuController({
  elements: {
    stageEl,
    menuEl: hexContextMenuEl,
    titleEl: hexContextTitleEl,
    bodyEl: hexContextBodyEl,
  },
  getActivePlayerId: () => activePlayerId(runtime),
  getSelectedFleetId: () => runtime.selectedFleetId,
  getTile,
  fleetsAtCoord,
  onOwnFleetSelected: (fleetId) => {
    runtime.selectedFleetId = fleetId;
    runtime.focusedUnitId = fleetId;
    runtime.plannedPath = [];
    hexContextMenu.hide();
    appendEvent(`Selected ${fleetId}`);
    refreshHud();
    renderScene();
  },
});

function renderPlayerEvents(state: GameState | null): void {
  playerEventsListEl.innerHTML = "";
  const events = [...(state?.events ?? [])].sort((a, b) => b.id - a.id);
  if (events.length === 0) {
    playerEventsListEl.textContent = "No events";
    return;
  }
  for (const event of events) {
    const item = document.createElement("article");
    item.className = "player-event";
    item.dataset.kind = event.kind;
    const meta = document.createElement("div");
    meta.className = "player-event-meta";
    meta.textContent = `#${event.id} · Turn ${event.turnNumber} · ${event.kind}`;
    const message = document.createElement("div");
    message.textContent = event.message;
    item.append(meta, message);
    playerEventsListEl.append(item);
  }
}

function selectMainView(view: "MAP" | "EVENTS"): void {
  const showMap = view === "MAP";
  stageZoneEl.classList.toggle("view-hidden", !showMap);
  playerEventsViewEl.classList.toggle("view-hidden", showMap);
  mapViewBtn.classList.toggle("is-active", showMap);
  mapViewBtn.classList.toggle("ghost", !showMap);
  eventsViewBtn.classList.toggle("is-active", !showMap);
  eventsViewBtn.classList.toggle("ghost", showMap);
  if (showMap) {
    window.requestAnimationFrame(() => {
      app.renderer.resize(stageEl.clientWidth, stageEl.clientHeight);
      renderScene();
    });
  }
}

function refreshDetectedObjects(state: GameState | null): void {
  if (!state) {
    detectedObjectsEl.textContent = "-";
    return;
  }
  const lines = [
    ...Object.values(state.planets).map(
      (planet) => "Planet #" + planet.id + " " + planet.name + " [" + planet.position.q + "," + planet.position.r + "]",
    ),
    ...Object.values(state.stations).map(
      (station) => "Station #" + station.id + " " + station.name + " [" + station.position.q + "," + station.position.r + "]",
    ),
    ...Object.values(state.shipwrecks).map(
      (wreck) => "Shipwreck #" + wreck.id + " [" + wreck.position.q + "," + wreck.position.r + "]",
    ),
    ...Object.values(state.anomalies).map(
      (anomaly) => "Anomaly #" + anomaly.id + " [" + anomaly.position.q + "," + anomaly.position.r + "]",
    ),
  ];
  detectedObjectsEl.textContent = lines.join("\n") || "-";
}

function refreshFleetArtifactControls(
  state: GameState | null,
  selectedFleet: Fleet | null,
): void {
  fleetArtifactSelect.innerHTML = "";
  artifactUseBtn.disabled = true;
  if (!state || !selectedFleet) return;

  for (const artifactId of selectedFleet.itemInventory.artifactIds) {
    const artifact = state.artifacts[artifactId];
    const option = document.createElement("option");
    option.value = artifactId;
    option.textContent = artifact ? `${artifact.name} (${artifactId})` : artifactId;
    fleetArtifactSelect.append(option);
  }
  artifactUseBtn.disabled =
    state.phase !== "PLANNING" || fleetArtifactSelect.options.length === 0;
}

type RawResourceKey = (typeof RAW_RESOURCE_KEYS)[number];
type ProductResourceKey = (typeof PRODUCT_RESOURCE_KEYS)[number];
type InfoCategory = (typeof INFO_CATEGORIES)[number];
type TitheLevel = (typeof TITHE_LEVEL_ORDER)[number];

interface PlanetActionContext {
  state: GameState;
  playerId: string;
  selectedFleet: Fleet;
  planet: Planet;
}

interface PlanetResourceAvailability {
  key: string;
  maxAmount: number;
}

function ensurePlanetStaticOptions(): void {
  if (planetInfoCategorySelect.options.length === 0) {
    for (const category of INFO_CATEGORIES) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      planetInfoCategorySelect.appendChild(option);
    }
  }

  if (planetTitheLevelSelect.options.length === 0) {
    for (const level of TITHE_LEVEL_ORDER) {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = level;
      planetTitheLevelSelect.appendChild(option);
    }
  }
}

function resolvePlanetActionContext(): PlanetActionContext | null {
  const state = runtime.gameState;
  const playerId = activePlayerId(runtime);
  if (!state || !playerId) {
    return null;
  }

  const selectedFleet = getSelectedFleet(runtime, state);
  if (!selectedFleet) {
    return null;
  }

  const planet = selectedFleetPlanet(state, selectedFleet);
  if (!planet) {
    return null;
  }

  return {
    state,
    playerId,
    selectedFleet,
    planet,
  };
}

function selectedPlanetForReport(): Planet | null {
  const state = runtime.gameState;
  if (!state) return null;
  const fleet = getSelectedFleet(runtime, state);
  const fleetPlanet = fleet ? selectedFleetPlanet(state, fleet) : null;
  if (fleetPlanet) return fleetPlanet;
  const selectedHex = runtime.selectedStrategicHex;
  if (!selectedHex) return null;
  return Object.values(state.planets).find((planet) =>
    planet.position.q === selectedHex.q && planet.position.r === selectedHex.r
  ) ?? null;
}

function fillPlanetResourceOptions(
  select: HTMLSelectElement,
  availability: PlanetResourceAvailability[],
): void {
  const keep = select.value;
  select.innerHTML = "";

  for (const entry of availability) {
    const option = document.createElement("option");
    option.value = entry.key;
    option.textContent = `${entry.key} (max ${entry.maxAmount})`;
    select.appendChild(option);
  }

  if (availability.some((entry) => entry.key === keep)) {
    select.value = keep;
  }
}

function selectedOptionAvailability(
  select: HTMLSelectElement,
  availability: PlanetResourceAvailability[],
): PlanetResourceAvailability | null {
  return availability.find((entry) => entry.key === select.value) ?? null;
}

function clampAmountInput(
  input: HTMLInputElement,
  maxAmount: number,
): number {
  const currentAmount = Math.trunc(Number(input.value));
  const safeAmount = Number.isFinite(currentAmount) ? currentAmount : 1;
  const clampedAmount = Math.max(1, Math.min(maxAmount, safeAmount));
  input.value = String(clampedAmount);
  input.min = "1";
  input.max = String(maxAmount);
  return clampedAmount;
}

function buildRawStockAvailability(
  planet: Planet,
  raidFromShop = false,
): PlanetResourceAvailability[] {
  if (raidFromShop) {
    return RAW_RESOURCE_KEYS
      .map((key) => ({ key, maxAmount: storeAmount(planet.shop.resources, key) }))
      .filter((entry) => entry.maxAmount > 0);
  }
  const titheCapacity = Math.max(0, Math.floor(planet.titheTarget - planet.tithePaid));
  if (titheCapacity <= 0) {
    return [];
  }

  return RAW_RESOURCE_KEYS
    .map((key) => ({
      key,
      maxAmount: Math.min(storeAmount(planet.rawStock, key), titheCapacity),
    }))
    .filter((entry) => entry.maxAmount > 0);
}

function buildProductAvailability(
  state: GameState,
  planet: Planet,
  playerId: string,
): PlanetResourceAvailability[] {
  const fleets = Object.values(state.fleets).filter(
    (fleet) =>
      fleet.ownerPlayerId === playerId &&
      fleet.position.q === planet.position.q &&
      fleet.position.r === planet.position.r,
  );

  return PRODUCT_RESOURCE_KEYS
    .map((productKey) => {
      const recipe = PRODUCT_RECIPES[productKey];
      if (!planet.worldTags.includes(recipe.requiredTag)) {
        return null;
      }

      const available = fleets.reduce(
        (sum, fleet) => sum + storeAmount(fleet.inventory, recipe.input),
        0,
      );
      const conversionRate = state.productConversionRates[productKey];

      return {
        key: productKey,
        maxAmount: Math.floor(available * conversionRate + 1e-9),
      };
    })
    .filter((entry): entry is PlanetResourceAvailability => Boolean(entry && entry.maxAmount > 0));
}

function activePlayerHasFaction(
  state: GameState,
  playerId: number,
  factionCode: string,
): boolean {
  const player = state.players[playerId];
  return Boolean(player && player.alignment === "IMPERIAL" && state.factions[player.factionId]?.code === factionCode);
}

function buildPlanetDetails(planet: Planet, playerId: number | string | null): string {
  const productStorage = playerId
    ? (planet.productStorageByPlayerId[String(playerId)] ?? {})
    : {};
  return [
    `ID: ${planet.id}`,
    `Name: ${planet.name}`,
    `World Type: ${planet.worldType}`,
    `Tags: ${planet.worldTags.length > 0 ? planet.worldTags.join(", ") : "-"}`,
    `Population: ${planet.population}`,
    `Morale: ${planet.morale}`,
    `Tithe: ${planet.titheLevel}; max ${planet.maxTitheLevel} (cap ${planet.titheTarget}); delivered ${planet.tithePaid}`,
    `Generated resources: ${Object.keys(planet.resourceGeneration).join(", ") || "-"}`,
    `Actual production per turn: ${planet.resourceProduction}`,
    `Raw Stock: ${formatStore(planet.rawStock, 2)}`,
    `Your Product Storage: ${formatStore(productStorage, 2)}`,
    `Info: ${formatStore(planet.infoFragments)}`,
  ].join("\n");
}

type PlanetActionExtraPayload = Partial<Omit<PlanetAction["payload"], "planetId" | "kind">>;

function submitPlanetAction(
  kind: PlanetActionKind,
  extraPayload: PlanetActionExtraPayload = {},
): void {
  const context = resolvePlanetActionContext();
  if (!context || context.state.phase !== "PLANNING") {
    return;
  }

  const action: PlanetAction = {
    id: nextActionId("planet"),
    playerId: context.playerId,
    type: "PLANET_ACTION",
    payload: {
      planetId: context.planet.id,
      kind,
      ...extraPayload,
    },
  };

  if (sendMessage({ type: "submitAction", action })) {
    appendEvent(`${kind} sent for ${context.planet.id}`);
  }
}

function refreshSecretStorageControls(state: Nullable<GameState>): void {
  const previous = secretStorageTargetSelect.value;
  secretStorageTargetSelect.innerHTML = "";
  if (state) {
    for (const planet of Object.values(state.planets)) {
      if (!planet.secretStorageAvailable) continue;
      const option = document.createElement("option");
      option.value = `PLANET:${planet.id}`;
      option.textContent = `Планета ${planet.name} (#${planet.id})`;
      secretStorageTargetSelect.append(option);
    }
    for (const station of Object.values(state.stations)) {
      if (!station.secretStorageAvailable) continue;
      const option = document.createElement("option");
      option.value = `STATION:${station.id}`;
      option.textContent = `Станция ${station.name} (#${station.id})`;
      secretStorageTargetSelect.append(option);
    }
  }
  if (Array.from(secretStorageTargetSelect.options).some((option) => option.value === previous)) {
    secretStorageTargetSelect.value = previous;
  }
  const available = secretStorageTargetSelect.options.length > 0;
  secretStorageTargetSelect.disabled = !available;
  secretStoragePasswordInput.disabled = !available;
  secretStorageOpenBtn.disabled = !available;
  if (!available) secretStorageContentsEl.textContent = "-";
}

function renderAdministratum(state: Nullable<GameState>, playerId: number | null): void {
  const hasAccess = Boolean(
    state && playerId && state.factions[state.players[playerId]?.factionId]?.isAdministratum,
  );
  administratumPanel.classList.toggle("hidden", !hasAccess);
  administratumRegistryEl.innerHTML = "";
  if (!state || !hasAccess) return;
  for (const report of [...state.administratumWorldReports].sort((a, b) => a.sequence - b.sequence)) {
    const row = document.createElement("div");
    row.className = "entity-row";
    const planet = state.planets[report.planetId];
    const proposals = state.administratumTitheProposals
      .filter((entry) => entry.planetId === report.planetId && entry.requestedOnTurn === state.turnNumber)
      .map((entry) => `${entry.playerId}: ${entry.titheLevel}`)
      .join(", ");
    const description = document.createElement("span");
    description.textContent = `${report.sequence}. ${planet?.name ?? `Мир #${report.planetId}`} · ход ${report.reportedAtTurn}`
      + (proposals ? ` · предложения: ${proposals}` : "");
    const level = document.createElement("select");
    for (const titheLevel of TITHE_LEVEL_ORDER) {
      const option = document.createElement("option");
      option.value = titheLevel;
      option.textContent = titheLevel;
      level.append(option);
    }
    const ownProposal = state.administratumTitheProposals.find((entry) =>
      entry.planetId === report.planetId
      && entry.playerId === playerId
      && entry.requestedOnTurn === state.turnNumber
    );
    level.value = ownProposal?.titheLevel ?? planet?.maxTitheLevel ?? TITHE_LEVEL_ORDER[0];
    const propose = document.createElement("button");
    propose.className = "ghost";
    propose.textContent = "Предложить десятину";
    propose.disabled = state.phase !== "PLANNING";
    propose.addEventListener("click", () => {
      sendMessage({
        type: "proposeTithe",
        commandId: nextActionId("tithe-proposal"),
        planetId: report.planetId,
        titheLevel: level.value as TitheLevel,
      });
    });
    row.append(description, level, propose);
    administratumRegistryEl.append(row);
  }
}

function refreshPlanetActionControls(
  state: Nullable<GameState>,
  selectedFleet: Nullable<Fleet>,
): void {
  ensurePlanetStaticOptions();

  const playerId = activePlayerId(runtime);
  const planet = state && selectedFleet ? selectedFleetPlanet(state, selectedFleet) : null;
  const canUsePlanet = Boolean(state && selectedFleet && playerId && planet && state.phase === "PLANNING");

  selectedPlanetLine.textContent = planet
    ? `Planet: ${planet.name} (#${planet.id})`
    : "Planet: none";
  selectedPlanetDetailsEl.textContent = planet ? buildPlanetDetails(planet, playerId) : "-";

  planetRawResourceSelect.disabled = true;
  planetRawAmountInput.disabled = true;
  planetTakeStockBtn.disabled = true;
  planetProductSelect.disabled = true;
  planetProductAmountInput.disabled = true;
  planetCreateProductBtn.disabled = true;
  planetRaiseMoraleBtn.disabled = true;
  planetDeployInformantBtn.disabled = true;
  planetInfoCategorySelect.disabled = !canUsePlanet;
  planetTitheLevelSelect.disabled = !canUsePlanet;
  planetSetTitheBtn.disabled = true;
  planetReportWorldBtn.disabled = !Boolean(
    state && playerId && state.phase === "PLANNING" && selectedPlanetForReport(),
  );

  if (!state || !selectedFleet || !playerId || !planet || state.phase !== "PLANNING") {
    planetRawResourceSelect.innerHTML = "";
    planetProductSelect.innerHTML = "";
    return;
  }

  const player = state.players[playerId];
  const raidFromShop = player?.alignment === "NON_IMPERIAL";
  const rawAvailability = buildRawStockAvailability(planet, raidFromShop);
  fillPlanetResourceOptions(planetRawResourceSelect, rawAvailability);
  const selectedRaw = selectedOptionAvailability(planetRawResourceSelect, rawAvailability);
  if (selectedRaw) {
    clampAmountInput(planetRawAmountInput, selectedRaw.maxAmount);
    planetRawResourceSelect.disabled = false;
    planetRawAmountInput.disabled = false;
    planetTakeStockBtn.disabled = !player?.canTakePlanetResources;
  }
  planetTakeStockBtn.textContent = player?.alignment === "IMPERIAL" ? "Take Stock" : "Raid Stock";

  const productAvailability = buildProductAvailability(state, planet, playerId);
  fillPlanetResourceOptions(planetProductSelect, productAvailability);
  const selectedProduct = selectedOptionAvailability(
    planetProductSelect,
    productAvailability,
  );
  if (selectedProduct) {
    clampAmountInput(planetProductAmountInput, selectedProduct.maxAmount);
    planetProductSelect.disabled = false;
    planetProductAmountInput.disabled = false;
    planetCreateProductBtn.disabled = false;
  }

  planetRaiseMoraleBtn.disabled = !activePlayerHasFaction(
    state,
    playerId,
    "ecclesiarchy",
  );
  planetDeployInformantBtn.disabled = !activePlayerHasFaction(
    state,
    playerId,
    "inquisition",
  );
  const administratum = Boolean(state.factions[player?.factionId]?.isAdministratum);
  planetSetTitheBtn.disabled = !administratum;
  planetTitheLevelSelect.disabled = !administratum;
  planetTitheLevelSelect.value = planet.maxTitheLevel;
}

function submitTakeOrRaidStock(): void {
  const context = resolvePlanetActionContext();
  if (!context) {
    return;
  }

  const player = context.state.players[context.playerId];
  const availability = buildRawStockAvailability(context.planet, player?.alignment === "NON_IMPERIAL");
  const selectedRaw = selectedOptionAvailability(planetRawResourceSelect, availability);
  if (!selectedRaw) {
    appendEvent("No raw stock available for selected fleet");
    return;
  }

  const amount = Math.trunc(Number(planetRawAmountInput.value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > selectedRaw.maxAmount) {
    appendEvent(`Raw stock amount must be within 1..${selectedRaw.maxAmount}`);
    return;
  }

  const kind = player?.alignment === "IMPERIAL" ? "TAKE_STOCK" : "RAID_STOCK";
  submitPlanetAction(kind, {
    fleetId: context.selectedFleet.id,
    resourceKey: selectedRaw.key as RawResourceKey,
    amount,
  });
}

function submitCreateProduct(): void {
  const context = resolvePlanetActionContext();
  if (!context) {
    return;
  }

  const availability = buildProductAvailability(context.state, context.planet, context.playerId);
  const selectedProduct = selectedOptionAvailability(planetProductSelect, availability);
  if (!selectedProduct) {
    appendEvent("No product recipe available for selected planet and inventories");
    return;
  }

  const amount = Math.trunc(Number(planetProductAmountInput.value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > selectedProduct.maxAmount) {
    appendEvent(`Product amount must be within 1..${selectedProduct.maxAmount}`);
    return;
  }

  submitPlanetAction("CREATE_PRODUCT", {
    productKey: selectedProduct.key as ProductResourceKey,
    amount,
  });
}

function refreshArmyTransportControls(state: GameState | null, selected: Fleet | null): void {
  const playerId = activePlayerId(runtime);
  armyTransportTargetSelect.innerHTML = "";
  armyTransportRequestsEl.innerHTML = "";
  const isArmy = selected?.domain === "GROUND";
  const canPlan = Boolean(state && playerId && state.phase === "PLANNING");

  if (state && selected && isArmy && playerId) {
    const currentCarrier = selected.carrierFleetId
      ? state.fleets[selected.carrierFleetId]
      : undefined;
    const armyPosition = currentCarrier?.position ?? selected.position;
    for (const fleet of Object.values(state.fleets)) {
      const isEligibleOwner =
        fleet.ownerPlayerId === playerId ||
        areMutualAllies(state.players, playerId, fleet.ownerPlayerId);
      if (
        fleet.domain !== "SPACE" ||
        !isEligibleOwner ||
        fleet.id === selected.carrierFleetId ||
        fleet.position.q !== armyPosition.q ||
        fleet.position.r !== armyPosition.r
      ) continue;
      const option = document.createElement("option");
      option.value = String(fleet.id);
      const ownerName = state.players[fleet.ownerPlayerId]?.name ?? fleet.ownerPlayerId;
      const ownership = fleet.ownerPlayerId === playerId ? "own" : "ally";
      option.textContent = `${fleet.id} (${ownerName}, ${ownership})`;
      armyTransportTargetSelect.append(option);
    }
  }
  armyTransportTargetSelect.disabled = !canPlan || !isArmy || armyTransportTargetSelect.options.length === 0;
  armyEmbarkBtn.disabled = armyTransportTargetSelect.disabled;
  armyDisembarkBtn.disabled = !canPlan || !isArmy || !selected?.carrierFleetId;

  if (!state || !playerId) return;
  if (selected?.domain === "SPACE" && selected.ownerPlayerId === playerId) {
    for (const army of Object.values(state.fleets)) {
      if (army.domain !== "GROUND" || army.carrierFleetId !== selected.id) continue;
      const row = document.createElement("div");
      row.className = "entity-row";
      row.append(document.createTextNode(`Embarked army ${army.id} `));
      const button = document.createElement("button");
      button.textContent = "Disembark on planet";
      button.disabled = !canPlan;
      button.addEventListener("click", () => sendMessage({
        type: "disembarkArmy",
        commandId: nextActionId("disembark"),
        armyId: army.id,
      }));
      row.append(button);
      armyTransportRequestsEl.append(row);
    }
  }
  for (const request of state.pendingArmyTransportRequests) {
    const carrier = state.fleets[request.fleetId];
    if (carrier?.ownerPlayerId !== playerId) continue;
    const row = document.createElement("div");
    row.className = "entity-row";
    row.append(document.createTextNode(`Army ${request.armyId} requests ${request.fleetId} `));
    for (const [label, accept] of [["Accept", true], ["Decline", false]] as const) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => sendMessage({
        type: "respondArmyEmbark",
        commandId: nextActionId("embark-response"),
        requestId: request.id,
        accept,
      }));
      row.append(button);
    }
    armyTransportRequestsEl.append(row);
  }
}

function refreshTurnCountdown(): void {
  const timer = runtime.gameState?.turnTimer;
  if (!timer || runtime.gameState?.phase !== "PLANNING") {
    turnCountdownEl.textContent = "-";
    return;
  }
  const remainingMs = Math.max(0, timer.turnEndsAt - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  turnCountdownEl.textContent =
    String(hours).padStart(2, "0") + ":"
    + String(minutes).padStart(2, "0") + ":"
    + String(seconds).padStart(2, "0");
}

function refreshHud(): void {
  renderPlayerEvents(runtime.gameState);
  updateAuthView(hudElements, runtime.session);

  const state = runtime.gameState;
  const session = runtime.session;
  if (!state || !session) {
    hudElements.turnNumberEl.textContent = "-";
    hudElements.phaseValueEl.textContent = "-";
    hudElements.resourceValueEl.textContent = "-";
    hudElements.selectedFleetLine.textContent = "Selected fleet: none";
    hudElements.selectedFleetDetailsEl.textContent = "-";
    hudElements.pathLine.textContent = "Planned path: 0 steps";

    hudElements.clearPathBtn.disabled = true;
    resetRouteBtn.disabled = true;
    fuelToMovementBtn.disabled = true;
    hudElements.setAttackBtn.disabled = true;
    hudElements.setDefenseBtn.disabled = true;
    hudElements.shareAllyVisionBtn.disabled = true;
    hudElements.shareAllyVisionBtn.classList.remove(
      "ally-vision-on",
      "ally-vision-off",
    );
    hudElements.warBtn.disabled = true;
    hudElements.allyBtn.disabled = true;
    hudElements.readyBtn.disabled = true;
    hudElements.endTurnBtn.disabled = true;
    hudElements.targetSelect.disabled = true;
    updateRelationsWindow(hudElements, null);
    updateStanceButtons(hudElements, null, null);
    resourceTransferController.refresh();
    refreshPlanetActionControls(null, null);
    refreshArmyTransportControls(null, null);
    refreshFleetArtifactControls(null, null);
    shopTradeController.refresh();
    refreshDetectedObjects(null);
    refreshSecretStorageControls(null);
    renderAdministratum(null, null);
    refreshTurnCountdown();
    return;
  }

  hudElements.turnNumberEl.textContent = String(state.turnNumber);
  hudElements.phaseValueEl.textContent = state.phase;
  const playerId = activePlayerId(runtime);
  hudElements.resourceValueEl.textContent = String(getPlayerResources(state, playerId));
  const hasNavigatorAccess = session.role === "admin"
    || Boolean(playerId && state.players[playerId]?.effectiveNavigator);
  if (!hasNavigatorAccess) {
    runtime.navigatorLayerEnabled = false;
    navigatorMapBtn.classList.remove("is-active");
  }
  navigatorMapBtn.disabled = !hasNavigatorAccess;
  navigatorMapBtn.classList.toggle("is-active", runtime.navigatorLayerEnabled);
  tacticalMapBtn.classList.toggle("is-active", runtime.mapMode === "TACTICAL");
  strategicMapBtn.classList.toggle("is-active", runtime.mapMode === "STRATEGIC");
  tacticalMapBtn.disabled = runtime.mapMode === "TACTICAL";
  strategicMapBtn.disabled = runtime.mapMode === "STRATEGIC";
  resetFocusBtn.disabled = false;

  const selected = getSelectedFleet(runtime, state);
  resetRouteBtn.disabled = !playerId || selected === null;
  refreshArmyTransportControls(state, selected);
  const selectedStance = selected ? effectiveFleetStance(runtime, selected) : null;
  if (selected) {
    const pendingTag = selectedStance === selected.stance ? "" : ", pending";
    const unitLabel = selected.domain === "GROUND" ? "army" : "fleet";
    hudElements.selectedFleetLine.textContent =
      `Выбран ${unitLabel === "army" ? "отряд" : "флот"}: ${selected.id} (ОД ${selected.movementPoints}/${selected.maxMovementPoints}, ${selectedStance}${pendingTag})`;
    hudElements.selectedFleetDetailsEl.textContent = buildSelectedFleetDetails(selected, selectedStance);
  } else {
    hudElements.selectedFleetLine.textContent = "Selected fleet: none";
    hudElements.selectedFleetDetailsEl.textContent = "-";
  }

  const submittedPathSteps = selected
    ? (runtime.plannedMovePathsByFleetId[selected.id]?.length ?? 0)
    : 0;
  if (runtime.plannedPath.length > 0) {
    hudElements.pathLine.textContent = `Draft path: ${runtime.plannedPath.length} steps`;
  } else if (submittedPathSteps > 0) {
    hudElements.pathLine.textContent = `Submitted path: ${submittedPathSteps} steps`;
  } else {
    hudElements.pathLine.textContent = "Planned path: 0 steps";
  }

  const controlsDisabled = !playerId;
  hudElements.clearPathBtn.disabled = controlsDisabled || runtime.plannedPath.length === 0;
  const fuelCapacity = selected?.domain === "SPACE"
    ? Math.max(0, Math.min(selected.inventory.FUEL ?? 0, selected.maxMovementPoints - selected.movementPoints))
    : 0;
  fuelToMovementAmountInput.max = String(fuelCapacity);
  fuelToMovementBtn.disabled = controlsDisabled || state.phase !== "PLANNING" || fuelCapacity <= 0;

  hudElements.setAttackBtn.disabled = controlsDisabled || !selected;
  hudElements.setDefenseBtn.disabled = controlsDisabled || !selected;
  hudElements.shareAllyVisionBtn.disabled =
    controlsDisabled || !selected || state.phase !== "PLANNING";
  hudElements.shareAllyVisionBtn.classList.toggle(
    "ally-vision-on",
    Boolean(selected?.shareVisionWithAllies),
  );
  hudElements.shareAllyVisionBtn.classList.toggle(
    "ally-vision-off",
    Boolean(selected) && !selected?.shareVisionWithAllies,
  );
  hudElements.readyBtn.disabled = controlsDisabled;
  updateStanceButtons(hudElements, selected, selectedStance);

  refreshTargetOptions(hudElements, state, playerId);
  const diplomacyDisabled = controlsDisabled || hudElements.targetSelect.disabled;
  hudElements.warBtn.disabled = diplomacyDisabled;
  hudElements.allyBtn.disabled = diplomacyDisabled;
  hudElements.endTurnBtn.disabled = !isAdmin(runtime);
  updateRelationsWindow(hudElements, state);

  refreshAdminFleetOwnerOptions(hudElements, state);
  renderAdminLists(hudElements, state, (path) => {
    void adminActions.adminDelete(path);
  });
  resourceTransferController.refresh();
  refreshPlanetActionControls(state, selected);
  refreshSecretStorageControls(state);
  renderAdministratum(state, playerId ? Number(playerId) : null);
  refreshFleetArtifactControls(state, selected);
  shopTradeController.refresh();
  refreshDetectedObjects(state);
  refreshTurnCountdown();
}

const networkSession = createNetworkSessionController({
  runtime,
  apiBase,
  wsBase,
  getLoginCredentials: () => ({
    username: loginUserInput.value.trim(),
    password: loginPassInput.value,
  }),
  setStatus,
  appendEvent,
  refreshHud,
  renderScene,
  hideHexContextMenu: () => {
    hexContextMenu.hide();
  },
  reconcilePendingFleetStances: (state) => {
    reconcilePendingFleetStances(runtime, state);
  },
  resizeAndRenderScene: () => {
    app.renderer.resize(stageEl.clientWidth, stageEl.clientHeight);
    renderScene();
  },
  showSecretStorage: (message) => {
    secretStorageContentsEl.textContent = message.storage
      ? JSON.stringify(message.storage, null, 2)
      : message.message;
    appendEvent(message.message);
  },
});

const adminActions = createAdminActions({
  isAdmin: () => isAdmin(runtime),
  apiRequest: networkSession.apiRequest,
  appendEvent,
});

function sendMessage(message: ClientMessage): boolean {
  return networkSession.sendMessage(message);
}

function nextActionId(prefix: string): string {
  const pid = activePlayerId(runtime) ?? "admin";
  const randomPart = Math.floor(Math.random() * 1000000).toString(36);
  return `${prefix}-${pid}-${Date.now()}-${randomPart}`;
}

const orderActions = createOrderActions({
  runtime,
  getActivePlayerId: () => activePlayerId(runtime),
  getSelectedFleet: (state) => getSelectedFleet(runtime, state),
  getTargetPlayerId: () => Number(targetSelect.value),
  nextActionId,
  sendMessage,
  appendEvent,
  refreshHud,
  renderScene,
});

function applyRouteClick(
  state: GameState,
  selected: Fleet,
  clicked: HexCoord,
): void {
  hexContextMenu.hide();
  const tile = getTile(state, clicked);
  if (!tile) {
    return;
  }

  const selectedPathIndex = runtime.plannedPath.findIndex(
    (step) => step.q === clicked.q && step.r === clicked.r,
  );

  if (selectedPathIndex >= 0) {
    runtime.plannedPath = runtime.plannedPath.slice(0, selectedPathIndex + 1);
    appendEvent(
      `Маршрут сокращён до ${coordKey(clicked)} (${runtime.plannedPath.length} шагов)`,
    );
    refreshHud();
    renderScene();
    if (runtime.plannedPath.length > 0) {
      orderActions.submitMove();
    } else {
      orderActions.clearPath();
    }
    return;
  }

  if (tile.terrainType === "OBSTACLE") {
    appendEvent(`Cannot add obstacle ${coordKey(clicked)} to route`);
    return;
  }

  const routeStart = runtime.plannedPath[runtime.plannedPath.length - 1]
    ?? selected.position;
  if (!areNeighbors(routeStart, clicked)) {
    appendEvent("Route must be built one adjacent hex at a time");
    return;
  }

  runtime.plannedPath = [...runtime.plannedPath, { ...clicked }];
  appendEvent(
    `Добавлена точка маршрута ${coordKey(clicked)} (${runtime.plannedPath.length} шагов)`,
  );
  refreshHud();
  renderScene();
  orderActions.submitMove();
}

function handleCanvasPrimaryClick(
  clientX: number,
  clientY: number,
): void {
  const state = runtime.gameState;
  const playerId = activePlayerId(runtime);
  if (!state || !playerId) {
    hexContextMenu.hide();
    return;
  }

  const worldPoint = mapCamera.canvasClientToWorld(clientX, clientY);
  const clicked = toHex(worldPoint.x / activeMapHexScale(), worldPoint.y / activeMapHexScale());

  if (!isInsideMap(state, clicked)) {
    hexContextMenu.hide();
    return;
  }

  const tile = getTile(state, clicked);
  if (!tile) {
    hexContextMenu.hide();
    return;
  }

  if (runtime.mapMode === "TACTICAL") {
    const center = runtime.tacticalCenter;
    if (!center || clicked.q !== center.q || clicked.r !== center.r) {
      hexContextMenu.hide();
      return;
    }
  }
  const fleetsHere = fleetsAtCoord(state, clicked);
  const ownFleetsHere = ownFleetsAtCoord(state, clicked);
  const selected = getSelectedFleet(runtime, state);
  const unitCount = getObjectsAtHex(state, clicked).length;

  if (
    selected &&
    clicked.q === selected.position.q &&
    clicked.r === selected.position.r
  ) {
    hexContextMenu.hide();
    runtime.selectedFleetId = null;
    runtime.plannedPath = [];
    appendEvent(`Deselected ${selected.id}`);
    refreshHud();
    renderScene();
    return;
  }

  if (selected && selected.domain === "SPACE" && state.phase === "PLANNING") {
    const routeEnd = runtime.plannedPath[runtime.plannedPath.length - 1]
      ?? selected.position;
    const hasAnotherControllableFleet = ownFleetsHere.some(
      (fleet) => fleet.id !== selected.id && fleet.domain === "SPACE",
    );
    if (hasAnotherControllableFleet && areNeighbors(routeEnd, clicked)) {
      hexContextMenu.open(state, clicked, clientX, clientY, {
        onPlotRoute: () => {
          const currentState = runtime.gameState;
          const currentSelected = currentState
            ? getSelectedFleet(runtime, currentState)
            : null;
          if (
            currentState
            && currentSelected
            && currentSelected.id === selected.id
            && currentSelected.domain === "SPACE"
            && currentState.phase === "PLANNING"
          ) {
            applyRouteClick(currentState, currentSelected, clicked);
          }
        },
      });
      return;
    }

    if (!hasAnotherControllableFleet) {
      applyRouteClick(state, selected, clicked);
      return;
    }
  }

  const shouldOpenContextMenu =
    unitCount > 1 && (ownFleetsHere.length > 0 || !selected);

  if (shouldOpenContextMenu) {
    hexContextMenu.open(state, clicked, clientX, clientY);
    return;
  }

  hexContextMenu.hide();

  const ownFleet = ownFleetAtCoord(state, clicked);
  if (ownFleet) {
    runtime.selectedFleetId = ownFleet.id;
    runtime.selectedStrategicHex = null;
    runtime.plannedPath = [];
    runtime.focusedUnitId = ownFleet.id;
    appendEvent(`Selected ${ownFleet.id}`);
    refreshHud();
    renderScene();
    return;
  }

  if (!selected) {
    if (runtime.mapMode === "STRATEGIC") {
      runtime.selectedStrategicHex = { ...clicked };
      refreshHud();
      renderScene();
    }
    if (fleetsHere.length > 0) {
      appendEvent(`Tile ${coordKey(clicked)} has enemy fleets`);
    }
    return;
  }

  if (tile.terrainType === "OBSTACLE") {
    appendEvent(`Cannot path to obstacle ${coordKey(clicked)}`);
    return;
  }

}

const canvasController = createCanvasController({
  appStage: app.stage,
  stageEl,
  canvas: canvasEl,
  panGesture,
  panDragThresholdPx: PAN_DRAG_THRESHOLD_PX,
  mapCamera,
  toHex: (x, y) => toHex(x / activeMapHexScale(), y / activeMapHexScale()),
  isHoverHexValid: (coord) => {
    const state = runtime.gameState;
    if (!state) {
      return false;
    }

    return isInsideMap(state, coord) && Boolean(getTile(state, coord));
  },
  onHoverHex: setHoveredHexInfo,
  onPrimaryClick: handleCanvasPrimaryClick,
  onPanMove: () => {
    hexContextMenu.hide();
  },
  onPanStateChange: () => {
    // Reserved for future pan state UX hooks.
  },
  wheelZoomSensitivity: WHEEL_ZOOM_SENSITIVITY,
});

bindMainEvents(
  {
    loginBtn,
    logoutBtn,
    clearPathBtn,
    setAttackBtn,
    setDefenseBtn,
    shareAllyVisionBtn,
    warBtn,
    allyBtn,
    readyBtn,
    endTurnBtn,
    adminAddPlayerBtn,
    adminAddPlanetBtn,
    adminAddFleetBtn,
    hexContextCloseBtn,
    mapZoomOutBtn,
    mapZoomInBtn,
    mapZoomResetBtn,
    canvas: canvasEl,
  },
  {
    onLogin: () => {
      void networkSession.login();
    },
    onLogout: () => {
      void networkSession.logout();
    },
    onClearPath: orderActions.clearPath,
    onSetAttack: () => {
      orderActions.submitStance("ATTACK");
    },
    onSetDefense: () => {
      orderActions.submitStance("DEFENSE");
    },
    onToggleAllyVision: () => {
      const state = runtime.gameState;
      const selected = state ? getSelectedFleet(runtime, state) : null;
      if (!selected) {
        return;
      }

      sendMessage({
        type: "setFleetAllyVision",
        commandId: nextActionId("ally-vision"),
        fleetId: selected.id,
        enabled: !selected.shareVisionWithAllies,
      });
    },
    onDeclareWar: () => {
      orderActions.submitDiplomacy("DECLARE_WAR");
    },
    onProposeAlliance: () => {
      orderActions.submitDiplomacy("PROPOSE_ALLIANCE");
    },
    onReady: () => {
      sendMessage({ type: "playerReady" });
      appendEvent("Ready flag sent");
    },
    onEndTurn: () => {
      sendMessage({
        type: "endTurn",
        commandId: nextActionId("end-turn"),
      });
      appendEvent("endTurn sent");
    },
    onAdminAddPlayer: () => {
      void adminActions.adminPost(
        "/api/admin/players",
        buildAdminCreatePlayerPayload({
          idInput: adminPlayerIdInput,
          nameInput: adminPlayerNameInput,
          usernameInput: adminPlayerUsernameInput,
          passwordInput: adminPlayerPasswordInput,
        }),
      );
    },
    onAdminAddPlanet: () => {
      void adminActions.adminPost(
        "/api/admin/planets",
        buildAdminCreatePlanetPayload({
          idInput: adminPlanetIdInput,
          qInput: adminPlanetQInput,
          rInput: adminPlanetRInput,
          resourceInput: adminPlanetResInput,
          influenceInput: adminPlanetInfInput,
        }),
      );
    },
    onAdminAddFleet: () => {
      void adminActions.adminPost(
        "/api/admin/fleets",
        buildAdminCreateFleetPayload({
          idInput: adminFleetIdInput,
          ownerSelect: adminFleetOwnerSelect,
          qInput: adminFleetQInput,
          rInput: adminFleetRInput,
          powerInput: adminFleetPowerInput,
          healthInput: adminFleetHealthInput,
          influenceInput: adminFleetInfluenceInput,
          visionInput: adminFleetVisionInput,
          capacityInput: adminFleetCapacityInput,
        }),
      );
    },
    onCloseHexContextMenu: () => {
      hexContextMenu.hide();
    },
    onZoomOut: () => {
      mapCamera.applyMapZoom(mapCamera.getMapZoom() - BUTTON_ZOOM_STEP);
    },
    onZoomIn: () => {
      mapCamera.applyMapZoom(mapCamera.getMapZoom() + BUTTON_ZOOM_STEP);
    },
    onZoomReset: mapCamera.resetMapView,
    isHexContextMenuOpen: hexContextMenu.isOpen,
    onEscape: () => {
      hexContextMenu.hide();
    },
    onWindowResizeWithOpenHexMenu: () => {
      hexContextMenu.hide();
    },
    canvasController,
  },
);

for (const input of [loginUserInput, loginPassInput]) {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.repeat) return;
    event.preventDefault();
    void networkSession.login();
  });
}

mapViewBtn.addEventListener("click", () => selectMainView("MAP"));
eventsViewBtn.addEventListener("click", () => selectMainView("EVENTS"));
selectMainView("MAP");
function fitTacticalMap(center: HexCoord): void {
  const point = toPixel(center);
  const hexScale = activeMapHexScale();
  app.stage.position.set(
    stageEl.clientWidth / 2 - point.x * hexScale * runtime.mapZoom,
    stageEl.clientHeight / 2 - point.y * hexScale * runtime.mapZoom,
  );
}

tacticalMapBtn.addEventListener("click", () => {
  const state = runtime.gameState;
  if (!state) return;
  const selected = getSelectedFleet(runtime, state);
  const tile = state.map.tiles[0];
  const center = runtime.selectedStrategicHex ?? (selected ? { ...selected.position } : tile ? { q: tile.q, r: tile.r } : null);
  if (!center) return;
  runtime.strategicMapZoom = runtime.mapZoom;
  runtime.mapMode = "TACTICAL";
  runtime.tacticalCenter = center;
  fitTacticalMap(center);
  refreshHud();
  renderScene();
});
strategicMapBtn.addEventListener("click", () => {
  runtime.mapMode = "STRATEGIC";
  mapCamera.applyMapZoom(runtime.strategicMapZoom);
  runtime.tacticalCenter = null;
  refreshHud();
  renderScene();
});
navigatorMapBtn.addEventListener("click", () => {
  runtime.navigatorLayerEnabled = !runtime.navigatorLayerEnabled;
  navigatorMapBtn.classList.toggle("is-active", runtime.navigatorLayerEnabled);
  renderScene();
});
resetFocusBtn.addEventListener("click", () => {
  runtime.focusedUnitId = null;
  runtime.mapMode = "STRATEGIC";
  runtime.tacticalCenter = null;
  const state = runtime.gameState;
  if (state) {
    const point = toPixel({ q: (state.map.width - 1) / 2, r: (state.map.height - 1) / 2 });
    app.stage.position.set(stageEl.clientWidth / 2 - point.x * runtime.mapZoom, stageEl.clientHeight / 2 - point.y * runtime.mapZoom);
  }

  appendEvent("Фокус сброшен; камера возвращена к центру глобальной карты");
  refreshHud();
  renderScene();
});
resetRouteBtn.addEventListener("click", () => {
  orderActions.clearPath();
});
armyEmbarkBtn.addEventListener("click", () => {
  const state = runtime.gameState;
  const army = state ? getSelectedFleet(runtime, state) : null;
  if (!army || army.domain !== "GROUND" || !armyTransportTargetSelect.value) return;
  sendMessage({
    type: "requestArmyEmbark",
    commandId: nextActionId("embark-request"),
    armyId: army.id,
    fleetId: Number(armyTransportTargetSelect.value),
  });
});
armyDisembarkBtn.addEventListener("click", () => {
  const state = runtime.gameState;
  const army = state ? getSelectedFleet(runtime, state) : null;
  if (!army || army.domain !== "GROUND") return;
  sendMessage({
    type: "disembarkArmy",
    commandId: nextActionId("disembark"),
    armyId: army.id,
  });
});
fuelToMovementBtn.addEventListener("click", () => {
  const state = runtime.gameState;
  const fleet = state ? getSelectedFleet(runtime, state) : null;
  const amount = Math.trunc(Number(fuelToMovementAmountInput.value));
  if (!fleet || fleet.domain !== "SPACE" || !Number.isInteger(amount) || amount <= 0) return;
  sendMessage({
    type: "convertFuelToMovement",
    commandId: nextActionId("fuel-movement"),
    fleetId: fleet.id,
    amount,
  });
  appendEvent(`Отправлена конвертация ${amount} FUEL в ОД для флота ${fleet.id}`);
});

artifactUseBtn.addEventListener("click", () => {
  if (!fleetArtifactSelect.value) return;
  sendMessage({
    type: "artifactUse",
    commandId: nextActionId("artifact-use"),
    artifactId: fleetArtifactSelect.value,
  });
});
planetRawResourceSelect.addEventListener("change", () => {
  refreshPlanetActionControls(
    runtime.gameState,
    runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null,
  );
});
planetRawAmountInput.addEventListener("input", () => {
  refreshPlanetActionControls(
    runtime.gameState,
    runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null,
  );
});
planetTakeStockBtn.addEventListener("click", () => {
  submitTakeOrRaidStock();
});
planetProductSelect.addEventListener("change", () => {
  refreshPlanetActionControls(
    runtime.gameState,
    runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null,
  );
});
planetProductAmountInput.addEventListener("input", () => {
  refreshPlanetActionControls(
    runtime.gameState,
    runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null,
  );
});
planetCreateProductBtn.addEventListener("click", () => {
  submitCreateProduct();
});
planetRaiseMoraleBtn.addEventListener("click", () => {
  submitPlanetAction("ECCLESIARCHY_RAISE_MORALE");
});
planetDeployInformantBtn.addEventListener("click", () => {
  submitPlanetAction("INQUISITION_DEPLOY_INFORMANT", {
    infoCategory: planetInfoCategorySelect.value as InfoCategory,
  });
});
planetSetTitheBtn.addEventListener("click", () => {
  const context = resolvePlanetActionContext();
  if (!context) return;
  sendMessage({
    type: "proposeTithe",
    commandId: nextActionId("tithe-proposal"),
    planetId: context.planet.id,
    titheLevel: planetTitheLevelSelect.value as TitheLevel,
  });
});
planetReportWorldBtn.addEventListener("click", () => {
  const state = runtime.gameState;
  const playerId = activePlayerId(runtime);
  const planet = selectedPlanetForReport();
  if (!state || !playerId || !planet || state.phase !== "PLANNING") return;
  sendMessage({
    type: "reportWorld",
    commandId: nextActionId("report-world"),
    planetId: planet.id,
  });
});
secretStorageOpenBtn.addEventListener("click", () => {
  const [kind, idText] = secretStorageTargetSelect.value.split(":");
  const id = Number(idText);
  if ((kind !== "PLANET" && kind !== "STATION") || !Number.isInteger(id)) return;
  sendMessage({
    type: "openSecretStorage",
    commandId: nextActionId("secret-storage"),
    target: { kind, id },
    password: secretStoragePasswordInput.value,
  });
  secretStoragePasswordInput.value = "";
});

mapCamera.updateMapZoomUi();
refreshHud();
setHoveredHexInfo(null);
renderScene();
window.setInterval(refreshTurnCountdown, 250);
void networkSession.restoreSession();
