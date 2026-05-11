import "./style.css";

import { Application, Container } from "pixi.js";

import type {
  ClientMessage,
  ResourceEndpointKind,
} from "../../src/api/ws";
import { coordKey } from "../../src/hex";
import {
  INFO_CATEGORIES,
  PRODUCT_RECIPES,
  PRODUCT_RESOURCE_KEYS,
  RAW_RESOURCE_KEYS,
  RESOURCE_KEYS,
  TITHE_LEVEL_ORDER,
} from "../../src/planetDomain";
import {
  buildPath,
  clearMapLayers,
  fleetsAtCoord,
  getTile,
  isInsideMap,
  ownFleetAtCoord as ownFleetAtCoordByPlayer,
  ownFleetsAtCoord as ownFleetsAtCoordByPlayer,
  renderMapScene,
  toHex,
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
const BUTTON_ZOOM_STEP = 0.15;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const PAN_DRAG_THRESHOLD_PX = 5;
const RENDER_RESOLUTION = Math.max(1, window.devicePixelRatio || 1);
const MAP_TEXT_MAX_RESOLUTION = 4;

const params = new URLSearchParams(window.location.search);
const apiBase = params.get("api") ?? `http://${window.location.hostname}:8080`;
const wsBase = params.get("ws") ?? `ws://${window.location.hostname}:8080`;

const statusLine = document.getElementById("statusLine") as HTMLParagraphElement;
const userValueEl = document.getElementById("userValue") as HTMLElement;
const turnNumberEl = document.getElementById("turnNumber") as HTMLElement;
const phaseValueEl = document.getElementById("phaseValue") as HTMLElement;
const resourceValueEl = document.getElementById("resourceValue") as HTMLElement;
const playerInfoEl = document.getElementById("playerInfo") as HTMLParagraphElement;
const authStateEl = document.getElementById("authState") as HTMLParagraphElement;
const selectedFleetLine = document.getElementById("selectedFleetLine") as HTMLParagraphElement;
const selectedFleetDetailsEl = document.getElementById("selectedFleetDetails") as HTMLPreElement;
const pathLine = document.getElementById("pathLine") as HTMLParagraphElement;
const targetSelect = document.getElementById("targetSelect") as HTMLSelectElement;
const eventsLog = document.getElementById("eventsLog") as HTMLPreElement;
const adminSection = document.getElementById("adminSection") as HTMLElement;

const loginUserInput = document.getElementById("loginUser") as HTMLInputElement;
const loginPassInput = document.getElementById("loginPass") as HTMLInputElement;
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;

const submitMoveBtn = document.getElementById("submitMoveBtn") as HTMLButtonElement;
const clearPathBtn = document.getElementById("clearPathBtn") as HTMLButtonElement;
const setAttackBtn = document.getElementById("setAttackBtn") as HTMLButtonElement;
const setDefenseBtn = document.getElementById("setDefenseBtn") as HTMLButtonElement;
const warBtn = document.getElementById("warBtn") as HTMLButtonElement;
const allyBtn = document.getElementById("allyBtn") as HTMLButtonElement;
const readyBtn = document.getElementById("readyBtn") as HTMLButtonElement;
const endTurnBtn = document.getElementById("endTurnBtn") as HTMLButtonElement;
const transferModeSelect = document.getElementById("transferMode") as HTMLSelectElement;
const transferTargetFleetSelect = document.getElementById(
  "transferTargetFleet",
) as HTMLSelectElement;
const transferResourceSelect = document.getElementById(
  "transferResource",
) as HTMLSelectElement;
const transferAmountInput = document.getElementById("transferAmount") as HTMLInputElement;
const transferSubmitBtn = document.getElementById("transferSubmitBtn") as HTMLButtonElement;
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
const planetProduceBtn = document.getElementById("planetProduceBtn") as HTMLButtonElement;
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
  submitMoveBtn,
  clearPathBtn,
  setAttackBtn,
  setDefenseBtn,
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
const planetLayer = new Container();
const fleetLayer = new Container();
const effectLayer = new Container();
const fogLayer = new Container();
const uiLayer = new Container();
const mapLayers: MapLayers = {
  terrainLayer,
  planetLayer,
  fleetLayer,
  effectLayer,
  fogLayer,
  uiLayer,
};

app.stage.addChild(terrainLayer);
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
};

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

function renderScene(): void {
  const state = runtime.gameState;
  if (!state) {
    hexContextMenu.hide();
    clearMapLayers(mapLayers);
    return;
  }

  const selectedFleet = getSelectedFleet(runtime, state);
  const plannedMovePathsByFleetId = { ...runtime.plannedMovePathsByFleetId };
  if (selectedFleet && runtime.plannedPath.length > 0) {
    delete plannedMovePathsByFleetId[selectedFleet.id];
  }

  renderMapScene({
    state,
    layers: mapLayers,
    selectedFleet,
    plannedPath: runtime.plannedPath,
    plannedMovePathsByFleetId,
    playerId: activePlayerId(runtime),
    textResolution: mapCamera.mapTextResolution(),
  });
}

function appendEvent(message: string): void {
  const next = `[${new Date().toLocaleTimeString()}] ${message}`;
  eventsLog.textContent = `${next}\n${eventsLog.textContent}`.trim();
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
    runtime.plannedPath = [];
    hexContextMenu.hide();
    appendEvent(`Selected ${fleetId}`);
    refreshHud();
    renderScene();
  },
});

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

const TRANSFER_MODES: TransferModeSpec[] = [
  {
    value: "FLEET_TO_FLEET",
    label: "Fleet -> Fleet",
    fromKind: "FLEET",
    toKind: "FLEET",
  },
  {
    value: "FLEET_TO_PLANET_STORAGE",
    label: "Fleet -> Planet Storage",
    fromKind: "FLEET",
    toKind: "PLANET_STORAGE",
  },
  {
    value: "PLANET_STORAGE_TO_FLEET",
    label: "Planet Storage -> Fleet",
    fromKind: "PLANET_STORAGE",
    toKind: "FLEET",
  },
];

function transferModeSpecFromValue(value: string): TransferModeSpec {
  return (
    TRANSFER_MODES.find((mode) => mode.value === value) ?? TRANSFER_MODES[0]
  );
}

function ensureTransferModeOptions(): void {
  if (transferModeSelect.options.length > 0) {
    return;
  }

  for (const mode of TRANSFER_MODES) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    transferModeSelect.appendChild(option);
  }
}

function selectedFleetPlanet(state: GameState, fleet: Fleet): Nullable<Planet> {
  const tile = getTile(state, fleet.position);
  if (!tile?.planetId) {
    return null;
  }

  return state.planets[tile.planetId] ?? null;
}

function storeAmount(store: Fleet["inventory"], key: string): number {
  const value = store[key as keyof typeof store];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function fleetInventoryLoad(fleet: Fleet): number {
  return Object.values(fleet.inventory).reduce((sum, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return sum;
    }
    return sum + Math.max(0, Math.trunc(value));
  }, 0);
}

function fleetFreeCapacity(fleet: Fleet): number {
  return Math.max(0, Math.trunc(fleet.capacity) - fleetInventoryLoad(fleet));
}

interface TransferAvailability {
  key: (typeof RESOURCE_KEYS)[number];
  maxAmount: number;
}

function fillResourceOptions(availability: TransferAvailability[]): void {
  const keep = transferResourceSelect.value;
  transferResourceSelect.innerHTML = "";

  for (const entry of availability) {
    const option = document.createElement("option");
    option.value = entry.key;
    option.textContent = `${entry.key} (max ${entry.maxAmount})`;
    transferResourceSelect.appendChild(option);
  }

  if (availability.some((entry) => entry.key === keep)) {
    transferResourceSelect.value = keep;
  }
}

function fillTargetFleetOptions(
  state: GameState,
  selectedFleet: Fleet,
  activePlayer: string | null,
): void {
  const previous = transferTargetFleetSelect.value;
  transferTargetFleetSelect.innerHTML = "";

  const fleets = fleetsAtCoord(state, selectedFleet.position)
    .filter((fleet) => fleet.id !== selectedFleet.id)
    .filter((fleet) => (activePlayer ? fleet.ownerPlayerId === activePlayer : false))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const fleet of fleets) {
    const option = document.createElement("option");
    option.value = fleet.id;
    option.textContent = `${fleet.id} (${fleet.ownerPlayerId})`;
    transferTargetFleetSelect.appendChild(option);
  }

  if (fleets.some((fleet) => fleet.id === previous)) {
    transferTargetFleetSelect.value = previous;
  }
}

interface TransferContext {
  mode: TransferModeSpec;
  fromId: string;
  fromStore: Fleet["inventory"];
  toId: string;
  toFleet: Fleet | null;
}

function resolveTransferContext(
  state: GameState,
  selectedFleet: Fleet,
): TransferContext | null {
  const mode = transferModeSpecFromValue(transferModeSelect.value);
  const planet = selectedFleetPlanet(state, selectedFleet);

  if ((mode.fromKind !== "FLEET" || mode.toKind !== "FLEET") && !planet) {
    return null;
  }

  const fromId = mode.fromKind === "FLEET" ? selectedFleet.id : planet!.id;
  const fromStore =
    mode.fromKind === "FLEET"
      ? selectedFleet.inventory
      : planet!.productStorage;

  if (mode.toKind === "FLEET") {
    const toFleetId = transferTargetFleetSelect.value;
    if (!toFleetId) {
      return null;
    }

    const toFleet = state.fleets[toFleetId];
    if (!toFleet) {
      return null;
    }

    return {
      mode,
      fromId,
      fromStore,
      toId: toFleet.id,
      toFleet,
    };
  }

  return {
    mode,
    fromId,
    fromStore,
    toId: planet!.id,
    toFleet: null,
  };
}

function buildTransferAvailability(context: TransferContext): TransferAvailability[] {
  const keys = RESOURCE_KEYS;
  const freeCapacity = context.toFleet ? fleetFreeCapacity(context.toFleet) : Number.POSITIVE_INFINITY;

  if (freeCapacity <= 0) {
    return [];
  }

  const availability: TransferAvailability[] = [];
  for (const key of keys) {
    const available = storeAmount(context.fromStore, key);
    if (available <= 0) {
      continue;
    }

    const maxAmount = Math.min(available, freeCapacity);
    if (maxAmount <= 0) {
      continue;
    }

    availability.push({
      key,
      maxAmount,
    });
  }

  return availability;
}

function refreshTransferControls(
  state: Nullable<GameState>,
  selectedFleet: Nullable<Fleet>,
): void {
  ensureTransferModeOptions();
  const activePlayer = activePlayerId(runtime);
  const canControl = Boolean(state && selectedFleet && activePlayer && state.phase === "PLANNING");

  transferModeSelect.disabled = !canControl;
  transferAmountInput.disabled = true;
  transferResourceSelect.disabled = true;
  transferSubmitBtn.disabled = true;

  if (!state || !selectedFleet || !activePlayer || state.phase !== "PLANNING") {
    transferTargetFleetSelect.innerHTML = "";
    transferTargetFleetSelect.disabled = true;
    transferResourceSelect.innerHTML = "";
    return;
  }

  const mode = transferModeSpecFromValue(transferModeSelect.value);
  const needsPlanet = mode.fromKind !== "FLEET" || mode.toKind !== "FLEET";
  const needsTargetFleet = mode.toKind === "FLEET";
  const planet = selectedFleetPlanet(state, selectedFleet);

  if (needsTargetFleet) {
    fillTargetFleetOptions(state, selectedFleet, activePlayer);
    transferTargetFleetSelect.disabled = transferTargetFleetSelect.options.length === 0;
  } else {
    transferTargetFleetSelect.innerHTML = "";
    transferTargetFleetSelect.disabled = true;
  }

  const hasTargetFleet = !needsTargetFleet || Boolean(transferTargetFleetSelect.value);
  const hasPlanet = !needsPlanet || Boolean(planet);
  if (!hasTargetFleet || !hasPlanet) {
    transferResourceSelect.innerHTML = "";
    transferAmountInput.disabled = true;
    transferResourceSelect.disabled = true;
    transferSubmitBtn.disabled = true;
    return;
  }

  const context = resolveTransferContext(state, selectedFleet);
  if (!context) {
    transferResourceSelect.innerHTML = "";
    return;
  }

  const availability = buildTransferAvailability(context);
  fillResourceOptions(availability);
  transferResourceSelect.disabled = availability.length === 0;

  const selectedResourceKey = transferResourceSelect.value;
  const selectedEntry = availability.find((entry) => entry.key === selectedResourceKey) ?? null;
  if (!selectedEntry) {
    transferAmountInput.disabled = true;
    transferSubmitBtn.disabled = true;
    return;
  }

  const currentAmount = Math.trunc(Number(transferAmountInput.value));
  const safeAmount = Number.isFinite(currentAmount) ? currentAmount : 1;
  const clampedAmount = Math.max(1, Math.min(selectedEntry.maxAmount, safeAmount));
  transferAmountInput.value = String(clampedAmount);
  transferAmountInput.min = "1";
  transferAmountInput.max = String(selectedEntry.maxAmount);
  transferAmountInput.disabled = false;
  transferSubmitBtn.disabled = false;
}

function submitTransfer(): void {
  const state = runtime.gameState;
  const activePlayer = activePlayerId(runtime);
  if (!state || !activePlayer || state.phase !== "PLANNING") {
    return;
  }

  const selectedFleet = getSelectedFleet(runtime, state);
  if (!selectedFleet) {
    appendEvent("Select a controllable fleet first");
    return;
  }

  const context = resolveTransferContext(state, selectedFleet);
  if (!context) {
    appendEvent("Transfer endpoints are not available in current context");
    return;
  }

  const availability = buildTransferAvailability(context);
  const selectedEntry = availability.find(
    (entry) => entry.key === transferResourceSelect.value,
  );
  if (!selectedEntry) {
    appendEvent("No transferable resources available for current source/target");
    return;
  }

  const amount = Math.trunc(Number(transferAmountInput.value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > selectedEntry.maxAmount) {
    appendEvent(`Transfer amount must be within 1..${selectedEntry.maxAmount}`);
    return;
  }

  const sent = sendMessage({
    type: "resourceTransfer",
    payload: {
      from: {
        kind: context.mode.fromKind,
        id: context.fromId,
      },
      to: {
        kind: context.mode.toKind,
        id: context.toId,
      },
      resourceKey: transferResourceSelect.value as (typeof RESOURCE_KEYS)[number],
      amount,
    },
  });

  if (sent) {
    appendEvent(
      `Transfer requested: ${context.mode.label}, ${amount} ${transferResourceSelect.value}`,
    );
  }
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
  selectedFleet: Fleet,
): PlanetResourceAvailability[] {
  const freeCapacity = fleetFreeCapacity(selectedFleet);
  if (freeCapacity <= 0) {
    return [];
  }

  return RAW_RESOURCE_KEYS
    .map((key) => ({
      key,
      maxAmount: Math.min(storeAmount(planet.rawStock, key), freeCapacity),
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

      return {
        key: productKey,
        maxAmount: available,
      };
    })
    .filter((entry): entry is PlanetResourceAvailability => Boolean(entry && entry.maxAmount > 0));
}

function activePlayerHasFaction(
  state: GameState,
  playerId: string,
  factionId: string,
): boolean {
  const player = state.players[playerId];
  return Boolean(player && player.alignment === "IMPERIAL" && player.factionId === factionId);
}

function buildPlanetDetails(planet: Planet): string {
  return [
    `ID: ${planet.id}`,
    `World Type: ${planet.worldType}`,
    `Tags: ${planet.worldTags.length > 0 ? planet.worldTags.join(", ") : "-"}`,
    `Population: ${planet.population}`,
    `Morale: ${planet.morale}`,
    `Tithe: ${planet.titheLevel} ${planet.tithePaid}/${planet.titheTarget}`,
    `Production: ${planet.resourceProduction}`,
    `Raw Stock: ${formatStore(planet.rawStock)}`,
    `Product Storage: ${formatStore(planet.productStorage)}`,
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
    appendEvent(`${kind} submitted for ${context.planet.id}`);
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

  selectedPlanetLine.textContent = planet ? `Planet: ${planet.id}` : "Planet: none";
  selectedPlanetDetailsEl.textContent = planet ? buildPlanetDetails(planet) : "-";

  planetRawResourceSelect.disabled = true;
  planetRawAmountInput.disabled = true;
  planetTakeStockBtn.disabled = true;
  planetProduceBtn.disabled = true;
  planetProductSelect.disabled = true;
  planetProductAmountInput.disabled = true;
  planetCreateProductBtn.disabled = true;
  planetRaiseMoraleBtn.disabled = true;
  planetDeployInformantBtn.disabled = true;
  planetInfoCategorySelect.disabled = !canUsePlanet;
  planetTitheLevelSelect.disabled = !canUsePlanet;
  planetSetTitheBtn.disabled = true;

  if (!state || !selectedFleet || !playerId || !planet || state.phase !== "PLANNING") {
    planetRawResourceSelect.innerHTML = "";
    planetProductSelect.innerHTML = "";
    return;
  }

  const player = state.players[playerId];
  const rawAvailability = buildRawStockAvailability(planet, selectedFleet);
  fillPlanetResourceOptions(planetRawResourceSelect, rawAvailability);
  const selectedRaw = selectedOptionAvailability(planetRawResourceSelect, rawAvailability);
  if (selectedRaw) {
    clampAmountInput(planetRawAmountInput, selectedRaw.maxAmount);
    planetRawResourceSelect.disabled = false;
    planetRawAmountInput.disabled = false;
    planetTakeStockBtn.disabled = false;
  }
  planetTakeStockBtn.textContent = player?.alignment === "IMPERIAL" ? "Take Stock" : "Raid Stock";

  planetProduceBtn.disabled =
    planet.resourceProduction <= 0 || planet.tithePaid >= planet.titheTarget;

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
  planetSetTitheBtn.disabled = !activePlayerHasFaction(
    state,
    playerId,
    "administratum",
  );
  planetTitheLevelSelect.value = planet.titheLevel;
}

function submitTakeOrRaidStock(): void {
  const context = resolvePlanetActionContext();
  if (!context) {
    return;
  }

  const availability = buildRawStockAvailability(context.planet, context.selectedFleet);
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

  const player = context.state.players[context.playerId];
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

function refreshHud(): void {
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

    hudElements.submitMoveBtn.disabled = true;
    hudElements.clearPathBtn.disabled = true;
    hudElements.setAttackBtn.disabled = true;
    hudElements.setDefenseBtn.disabled = true;
    hudElements.warBtn.disabled = true;
    hudElements.allyBtn.disabled = true;
    hudElements.readyBtn.disabled = true;
    hudElements.endTurnBtn.disabled = true;
    hudElements.targetSelect.disabled = true;
    updateRelationsWindow(hudElements, null);
    updateStanceButtons(hudElements, null, null);
    refreshTransferControls(null, null);
    refreshPlanetActionControls(null, null);
    return;
  }

  hudElements.turnNumberEl.textContent = String(state.turnNumber);
  hudElements.phaseValueEl.textContent = state.phase;
  const playerId = activePlayerId(runtime);
  hudElements.resourceValueEl.textContent = String(getPlayerResources(state, playerId));

  const selected = getSelectedFleet(runtime, state);
  const selectedStance = selected ? effectiveFleetStance(runtime, selected) : null;
  if (selected) {
    const pendingTag = selectedStance === selected.stance ? "" : ", pending";
    hudElements.selectedFleetLine.textContent =
      `Selected fleet: ${selected.id} (AP ${selected.actionPoints}, ${selectedStance}${pendingTag})`;
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
  hudElements.submitMoveBtn.disabled = controlsDisabled || !selected || runtime.plannedPath.length === 0;
  hudElements.clearPathBtn.disabled = controlsDisabled || runtime.plannedPath.length === 0;
  hudElements.setAttackBtn.disabled = controlsDisabled || !selected;
  hudElements.setDefenseBtn.disabled = controlsDisabled || !selected;
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
  refreshTransferControls(state, selected);
  refreshPlanetActionControls(state, selected);
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
  getTargetPlayerId: () => targetSelect.value,
  nextActionId,
  sendMessage,
  appendEvent,
  refreshHud,
  renderScene,
});

function handleCanvasPrimaryClick(clientX: number, clientY: number): void {
  const state = runtime.gameState;
  const playerId = activePlayerId(runtime);
  if (!state || !playerId) {
    hexContextMenu.hide();
    return;
  }

  const worldPoint = mapCamera.canvasClientToWorld(clientX, clientY);
  const clicked = toHex(worldPoint.x, worldPoint.y);

  if (!isInsideMap(state, clicked)) {
    hexContextMenu.hide();
    return;
  }

  const tile = getTile(state, clicked);
  if (!tile) {
    hexContextMenu.hide();
    return;
  }

  const fleetsHere = fleetsAtCoord(state, clicked);
  const ownFleetsHere = ownFleetsAtCoord(state, clicked);
  const selected = getSelectedFleet(runtime, state);
  const hasPlanet = Boolean(tile.planetId && state.planets[tile.planetId]);
  const unitCount = fleetsHere.length + (hasPlanet ? 1 : 0);
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
    runtime.plannedPath = [];
    appendEvent(`Selected ${ownFleet.id}`);
    refreshHud();
    renderScene();
    return;
  }

  if (!selected) {
    if (fleetsHere.length > 0) {
      appendEvent(`Tile ${coordKey(clicked)} has enemy fleets`);
    }
    return;
  }

  if (tile.terrainType === "OBSTACLE") {
    appendEvent(`Cannot path to obstacle ${coordKey(clicked)}`);
    return;
  }

  const path = buildPath(state, selected.position, clicked, selected.actionPoints);
  if (!path) {
    appendEvent("No valid path within AP");
    return;
  }

  runtime.plannedPath = path;
  refreshHud();
  renderScene();
}

const canvasController = createCanvasController({
  appStage: app.stage,
  stageEl,
  canvas: canvasEl,
  panGesture,
  panDragThresholdPx: PAN_DRAG_THRESHOLD_PX,
  mapCamera,
  toHex,
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
    submitMoveBtn,
    clearPathBtn,
    setAttackBtn,
    setDefenseBtn,
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
    onSubmitMove: orderActions.submitMove,
    onClearPath: orderActions.clearPath,
    onSetAttack: () => {
      orderActions.submitStance("ATTACK");
    },
    onSetDefense: () => {
      orderActions.submitStance("DEFENSE");
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
      sendMessage({ type: "endTurn" });
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

transferModeSelect.addEventListener("change", () => {
  refreshTransferControls(runtime.gameState, runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null);
});
transferAmountInput.addEventListener("input", () => {
  refreshTransferControls(runtime.gameState, runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null);
});
transferResourceSelect.addEventListener("change", () => {
  refreshTransferControls(runtime.gameState, runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null);
});
transferTargetFleetSelect.addEventListener("change", () => {
  refreshTransferControls(runtime.gameState, runtime.gameState ? getSelectedFleet(runtime, runtime.gameState) : null);
});
transferSubmitBtn.addEventListener("click", () => {
  submitTransfer();
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
planetProduceBtn.addEventListener("click", () => {
  submitPlanetAction("PRODUCE_RESOURCE");
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
  submitPlanetAction("ADMINISTRATUM_SET_TITHE", {
    titheLevel: planetTitheLevelSelect.value as TitheLevel,
  });
});

mapCamera.updateMapZoomUi();
refreshHud();
setHoveredHexInfo(null);
renderScene();
void networkSession.restoreSession();
