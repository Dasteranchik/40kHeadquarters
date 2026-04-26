import "./style.css";

import { Application, Container } from "pixi.js";

import type { ClientMessage } from "../../src/api/ws";
import { coordKey } from "../../src/hex";
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
  refreshAdminFleetOwnerOptions,
  refreshTargetOptions,
  renderAdminLists,
  updateAuthView,
  updateRelationsWindow,
  updateStanceButtons,
  type HudElements,
} from "./ui/hud";
import { createHexContextMenuController } from "./ui/contextMenu";
import type { Fleet, FleetStance, GameState, HexCoord } from "../../src/types";

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

  renderMapScene({
    state,
    layers: mapLayers,
    selectedFleet: getSelectedFleet(runtime, state),
    plannedPath: runtime.plannedPath,
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

  hudElements.pathLine.textContent = `Planned path: ${runtime.plannedPath.length} steps`;

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

mapCamera.updateMapZoomUi();
refreshHud();
setHoveredHexInfo(null);
renderScene();
void networkSession.restoreSession();
