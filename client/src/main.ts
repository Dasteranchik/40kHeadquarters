import "./style.css";

import { Application, Container, Graphics, Text } from "pixi.js";

import type { ClientMessage, ServerMessage } from "../../src/api/ws";
import { coordKey, hexDistance } from "../../src/hex";
import { collectRelationPairs } from "../../src/utils/relations";
import {
  axialToPixel,
  HEX_DIRECTIONS,
  hexPolygon,
  pixelToAxial,
} from "./hexMath";
import type {
  Action,
  Fleet,
  FleetStance,
  GameState,
  HexCoord,
  Planet,
  TerrainType,
  Tile,
} from "../../src/types";

interface SessionInfo {
  token: string;
  username: string;
  role: "admin" | "player";
  playerId?: string;
  expiresAt: number;
}

type Nullable<T> = T | null;

const SESSION_STORAGE_KEY = "hq_session";
const HEX_SIZE = 30;
const MAP_OFFSET = { x: 70, y: 60 };
const HEX_LAYOUT = { hexSize: HEX_SIZE, offset: MAP_OFFSET };

function toPixel(coord: HexCoord): { x: number; y: number } {
  return axialToPixel(coord, HEX_LAYOUT);
}

function toHex(x: number, y: number): HexCoord {
  return pixelToAxial(x, y, HEX_LAYOUT);
}

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

const app = new Application({
  backgroundAlpha: 0,
  antialias: true,
  resizeTo: stageEl,
});
stageEl.appendChild(app.view as HTMLCanvasElement);

const terrainLayer = new Container();
const planetLayer = new Container();
const fleetLayer = new Container();
const effectLayer = new Container();
const fogLayer = new Container();
const uiLayer = new Container();

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
}

const runtime: RuntimeState = {
  session: null,
  socket: null,
  gameState: null,
  selectedFleetId: null,
  plannedPath: [],
  reconnectTimer: null,
  pendingFleetStances: {},
};

function activePlayerId(): string | null {
  if (!runtime.session) {
    return null;
  }
  return runtime.session.playerId ?? null;
}

function isAdmin(): boolean {
  return runtime.session?.role === "admin";
}

function visibleFleets(state: GameState): Fleet[] {
  return Object.values(state.fleets);
}

function tileColor(terrainType: TerrainType): number {
  if (terrainType === "OBSTACLE") {
    return 0x4b2e2e;
  }
  if (terrainType === "NEBULA") {
    return 0x2e3f57;
  }
  return 0x223247;
}

function ownerColor(ownerId: string): number {
  const map: Record<string, number> = {
    p1: 0x63d6ff,
    p2: 0xff9a63,
    p3: 0xc7ff67,
  };

  return map[ownerId] ?? 0xd4d7de;
}

function clearLayer(layer: Container): void {
  layer.removeChildren().forEach((child) => child.destroy());
}

function getTile(state: GameState, coord: HexCoord): Nullable<Tile> {
  return state.map.tiles.find((tile) => tile.q === coord.q && tile.r === coord.r) ?? null;
}

function isInsideMap(state: GameState, coord: HexCoord): boolean {
  return (
    coord.q >= 0 &&
    coord.r >= 0 &&
    coord.q < state.map.width &&
    coord.r < state.map.height
  );
}

function isPassableTile(state: GameState, coord: HexCoord): boolean {
  const tile = getTile(state, coord);
  return Boolean(tile && tile.terrainType !== "OBSTACLE");
}

function computeVisibleTiles(state: GameState): Set<string> {
  const playerId = activePlayerId();
  if (!playerId) {
    return new Set<string>();
  }

  const visible = new Set<string>();

  for (const planet of Object.values(state.planets)) {
    for (const tile of state.map.tiles) {
      if (hexDistance(planet.position, tile) <= planet.visionRange) {
        visible.add(coordKey(tile));
      }
    }
  }

  const fleets = Object.values(state.fleets).filter(
    (fleet) => fleet.ownerPlayerId === playerId,
  );

  for (const fleet of fleets) {
    for (const tile of state.map.tiles) {
      if (hexDistance(fleet.position, tile) <= fleet.visionRange) {
        visible.add(coordKey(tile));
      }
    }
  }

  return visible;
}

function getPlayerResources(state: GameState): number {
  const playerId = activePlayerId();
  if (!playerId) {
    return 0;
  }

  const player = state.players[playerId];
  return player ? player.resources : 0;
}

function getSelectedFleet(state: GameState): Nullable<Fleet> {
  if (!runtime.selectedFleetId) {
    return null;
  }

  const playerId = activePlayerId();
  const fleet = state.fleets[runtime.selectedFleetId];
  if (!fleet || !playerId || fleet.ownerPlayerId !== playerId) {
    runtime.selectedFleetId = null;
    runtime.plannedPath = [];
    return null;
  }

  return fleet;
}
function buildSelectedFleetDetails(fleet: Fleet, stance: FleetStance): string {
  const isPendingStance = stance !== fleet.stance;
  return [
    `ID: ${fleet.id}`,
    `Owner: ${fleet.ownerPlayerId}`,
    `Position: q=${fleet.position.q}, r=${fleet.position.r}`,
    `AP: ${fleet.actionPoints}`,
    `Combat Power: ${Math.round(fleet.combatPower)}`,
    `Health: ${Math.max(0, Math.round(fleet.health))}`,
    `Influence: ${Math.round(fleet.influence)}`,
    `Vision Range: ${fleet.visionRange}`,
    `Capacity: ${fleet.capacity}`,
    `Stance: ${stance}`,
    `Stance Pending: ${isPendingStance ? "yes" : "no"}`,
  ].join("\n");
}
function effectiveFleetStance(fleet: Fleet): FleetStance {
  return runtime.pendingFleetStances[fleet.id] ?? fleet.stance;
}

function updateStanceButtons(selected: Nullable<Fleet>): void {
  if (!selected || setAttackBtn.disabled || setDefenseBtn.disabled) {
    setAttackBtn.classList.remove("is-active");
    setDefenseBtn.classList.remove("is-active");
    return;
  }

  const stance = effectiveFleetStance(selected);
  setAttackBtn.classList.toggle("is-active", stance === "ATTACK");
  setDefenseBtn.classList.toggle("is-active", stance === "DEFENSE");
}

function reconcilePendingFleetStances(state: GameState): void {
  const next: Record<string, FleetStance> = {};

  for (const [fleetId, stance] of Object.entries(runtime.pendingFleetStances)) {
    const fleet = state.fleets[fleetId];
    if (!fleet) {
      continue;
    }

    if (fleet.stance !== stance) {
      next[fleetId] = stance;
    }
  }

  runtime.pendingFleetStances = next;
}

function fleetsAtCoord(state: GameState, coord: HexCoord): Fleet[] {
  return visibleFleets(state).filter(
    (fleet) => fleet.position.q === coord.q && fleet.position.r === coord.r,
  );
}

function ownFleetAtCoord(state: GameState, coord: HexCoord): Nullable<Fleet> {
  const playerId = activePlayerId();
  if (!playerId) {
    return null;
  }

  return (
    Object.values(state.fleets).find(
      (fleet) =>
        fleet.ownerPlayerId === playerId &&
        fleet.position.q === coord.q &&
        fleet.position.r === coord.r,
    ) ?? null
  );
}

function buildPath(
  state: GameState,
  start: HexCoord,
  target: HexCoord,
  maxSteps: number,
): Nullable<HexCoord[]> {
  if (start.q === target.q && start.r === target.r) {
    return [];
  }

  const visited = new Set<string>([coordKey(start)]);
  const queue: Array<{ coord: HexCoord; path: HexCoord[] }> = [{ coord: start, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.path.length >= maxSteps) {
      continue;
    }

    for (const dir of HEX_DIRECTIONS) {
      const next: HexCoord = {
        q: current.coord.q + dir.q,
        r: current.coord.r + dir.r,
      };

      const key = coordKey(next);
      if (visited.has(key)) {
        continue;
      }

      if (!isInsideMap(state, next) || !isPassableTile(state, next)) {
        continue;
      }

      const nextPath = [...current.path, next];
      if (next.q === target.q && next.r === target.r) {
        return nextPath;
      }

      visited.add(key);
      queue.push({ coord: next, path: nextPath });
    }
  }

  return null;
}

function mapFleetsByTile(state: GameState): Map<string, Fleet[]> {
  const byTile = new Map<string, Fleet[]>();

  for (const fleet of visibleFleets(state)) {
    const key = coordKey(fleet.position);
    const list = byTile.get(key);
    if (list) {
      list.push(fleet);
    } else {
      byTile.set(key, [fleet]);
    }
  }

  return byTile;
}

function drawTerrain(state: GameState): void {
  clearLayer(terrainLayer);

  for (const tile of state.map.tiles) {
    const center = toPixel(tile);
    const shape = hexPolygon(center, HEX_SIZE - 1);

    const graphics = new Graphics();
    graphics.lineStyle(1, 0x3a5270, 0.7);
    graphics.beginFill(tileColor(tile.terrainType), 0.95);
    graphics.drawPolygon(shape);
    graphics.endFill();

    terrainLayer.addChild(graphics);
  }
}

function drawPlanets(state: GameState): void {
  clearLayer(planetLayer);

  for (const planet of Object.values(state.planets)) {
    const center = toPixel(planet.position);

    const circle = new Graphics();
    circle.lineStyle(2, 0xc8f1ff, 0.9);
    circle.beginFill(0x5a8ef5, 0.85);
    circle.drawCircle(center.x, center.y, 8);
    circle.endFill();
    planetLayer.addChild(circle);

    const label = new Text(`+${planet.resourceProduction} | VR ${planet.visionRange}`, {
      fontFamily: "Chakra Petch",
      fontSize: 11,
      fill: 0xd8ecff,
    });
    label.x = center.x + 10;
    label.y = center.y - 7;
    planetLayer.addChild(label);
  }
}

function drawFleets(state: GameState): void {
  clearLayer(fleetLayer);

  const selected = getSelectedFleet(state);
  const byTile = mapFleetsByTile(state);

  for (const [key, fleets] of byTile.entries()) {
    const [qStr, rStr] = key.split(",");
    const center = toPixel({ q: Number(qStr), r: Number(rStr) });

    const spreadRadius = fleets.length > 1 ? 10 : 0;
    fleets.forEach((fleet, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(fleets.length, 1);
      const x = center.x + Math.cos(angle) * spreadRadius;
      const y = center.y + Math.sin(angle) * spreadRadius;

      const body = new Graphics();
      body.lineStyle(2, fleet.id === selected?.id ? 0xffffff : 0x1a2533, 1);
      body.beginFill(ownerColor(fleet.ownerPlayerId), 1);
      body.drawCircle(x, y, 7);
      body.endFill();
      fleetLayer.addChild(body);

      const statsText = `CP ${Math.round(fleet.combatPower)}  HP ${Math.max(
        0,
        Math.round(fleet.health),
      )}`;
      const tag = new Text(statsText, {
        fontFamily: "Chakra Petch",
        fontSize: 9,
        fill: 0xf7f9fc,
      });
      tag.x = x + 8;
      tag.y = y - 5;
      fleetLayer.addChild(tag);
    });
  }
}

function drawPath(state: GameState): void {
  clearLayer(effectLayer);

  const selected = getSelectedFleet(state);
  if (!selected || runtime.plannedPath.length === 0) {
    return;
  }

  const line = new Graphics();
  line.lineStyle(3, 0x64ffe1, 0.95);

  const start = toPixel(selected.position);
  line.moveTo(start.x, start.y);

  for (const step of runtime.plannedPath) {
    const point = toPixel(step);
    line.lineTo(point.x, point.y);

    const dot = new Graphics();
    dot.beginFill(0x8dffe9, 1);
    dot.drawCircle(point.x, point.y, 3);
    dot.endFill();
    effectLayer.addChild(dot);
  }

  effectLayer.addChild(line);
}

function drawFog(state: GameState): void {
  clearLayer(fogLayer);

  const playerId = activePlayerId();
  if (!playerId) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const visible = computeVisibleTiles(state);
  const explored = new Set(player.exploredTiles.map(coordKey));

  for (const tile of state.map.tiles) {
    const key = coordKey(tile);
    const center = toPixel(tile);
    const shape = hexPolygon(center, HEX_SIZE - 1);

    let alpha = 0;
    if (!explored.has(key)) {
      alpha = 0.82;
    } else if (!visible.has(key)) {
      alpha = 0.45;
    }

    if (alpha <= 0) {
      continue;
    }

    const veil = new Graphics();
    veil.beginFill(0x0a0f17, alpha);
    veil.drawPolygon(shape);
    veil.endFill();
    fogLayer.addChild(veil);
  }
}

function drawUiMarkers(state: GameState): void {
  clearLayer(uiLayer);

  for (const tile of state.map.tiles) {
    if (tile.terrainType !== "OBSTACLE") {
      continue;
    }

    const center = toPixel(tile);
    const mark = new Text("X", {
      fontFamily: "Chakra Petch",
      fontSize: 12,
      fill: 0xfab8b8,
    });
    mark.x = center.x - 4;
    mark.y = center.y - 8;
    uiLayer.addChild(mark);
  }
}

function renderScene(): void {
  const state = runtime.gameState;
  if (!state) {
    clearLayer(terrainLayer);
    clearLayer(planetLayer);
    clearLayer(fleetLayer);
    clearLayer(effectLayer);
    clearLayer(fogLayer);
    clearLayer(uiLayer);
    return;
  }

  drawTerrain(state);
  drawPlanets(state);
  drawFleets(state);
  drawPath(state);
  drawFog(state);
  drawUiMarkers(state);
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

function fillRelationList(
  listEl: HTMLUListElement,
  values: string[],
  emptyText: string,
): void {
  listEl.innerHTML = "";

  if (values.length === 0) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    listEl.appendChild(li);
    return;
  }

  for (const value of values) {
    const li = document.createElement("li");
    li.textContent = value;
    listEl.appendChild(li);
  }
}

function updateRelationsWindow(state: GameState | null): void {
  if (!state) {
    fillRelationList(alliancesListEl, [], "none");
    fillRelationList(warsListEl, [], "none");
    return;
  }

  const alliances = collectRelationPairs(state.players, "alliances").map(
    (pair) => `${pair.playerAId} <-> ${pair.playerBId}`,
  );
  const wars = collectRelationPairs(state.players, "wars").map((pair) => `${pair.playerAId} vs ${pair.playerBId}`);

  fillRelationList(alliancesListEl, alliances, "none");
  fillRelationList(warsListEl, wars, "none");
}

function updateAuthView(): void {
  const session = runtime.session;
  if (!session) {
    userValueEl.textContent = "-";
    authStateEl.textContent = "Not logged in";
    playerInfoEl.textContent = "Player: -";
    adminSection.classList.add("admin-hidden");
    return;
  }

  userValueEl.textContent = `${session.username} (${session.role})`;
  authStateEl.textContent = `Logged as ${session.username}`;
  playerInfoEl.textContent = `Player: ${session.playerId ?? "n/a"}`;
  if (session.role === "admin") {
    adminSection.classList.remove("admin-hidden");
  } else {
    adminSection.classList.add("admin-hidden");
  }
}

function refreshTargetOptions(state: GameState): void {
  const playerId = activePlayerId();
  const current = targetSelect.value;
  const otherPlayers = Object.values(state.players)
    .map((player) => player.id)
    .filter((id) => id !== playerId);

  targetSelect.innerHTML = "";
  for (const id of otherPlayers) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${id} - ${state.players[id].name}`;
    targetSelect.append(option);
  }

  targetSelect.disabled = otherPlayers.length === 0;
  if (otherPlayers.includes(current)) {
    targetSelect.value = current;
  }
}

function refreshAdminFleetOwnerOptions(state: GameState): void {
  const current = adminFleetOwnerSelect.value;
  const players = Object.values(state.players);

  adminFleetOwnerSelect.innerHTML = "";
  for (const player of players) {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = `${player.id} - ${player.name}`;
    adminFleetOwnerSelect.append(option);
  }

  if (players.some((player) => player.id === current)) {
    adminFleetOwnerSelect.value = current;
  }
}

function createEntityItem(label: string, onDelete: () => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "entity-item";

  const text = document.createElement("span");
  text.textContent = label;
  wrapper.appendChild(text);

  const removeBtn = document.createElement("button");
  removeBtn.className = "danger";
  removeBtn.textContent = "Delete";
  removeBtn.addEventListener("click", onDelete);
  wrapper.appendChild(removeBtn);

  return wrapper;
}

function renderAdminLists(state: GameState): void {
  adminPlayerList.innerHTML = "";
  for (const player of Object.values(state.players)) {
    adminPlayerList.appendChild(
      createEntityItem(`${player.id} (${player.name})`, () => {
        void adminDelete(`/api/admin/players/${encodeURIComponent(player.id)}`);
      }),
    );
  }

  adminPlanetList.innerHTML = "";
  for (const planet of Object.values(state.planets)) {
    adminPlanetList.appendChild(
      createEntityItem(
        `${planet.id} [${planet.position.q},${planet.position.r}] +${planet.resourceProduction} vr:${planet.visionRange}`,
        () => {
          void adminDelete(`/api/admin/planets/${encodeURIComponent(planet.id)}`);
        },
      ),
    );
  }

  adminFleetList.innerHTML = "";
  for (const fleet of Object.values(state.fleets)) {
    adminFleetList.appendChild(
      createEntityItem(
        `${fleet.id} (${fleet.ownerPlayerId}) [${fleet.position.q},${fleet.position.r}] ${fleet.stance}`,
        () => {
          void adminDelete(`/api/admin/fleets/${encodeURIComponent(fleet.id)}`);
        },
      ),
    );
  }
}

function refreshHud(): void {
  updateAuthView();

  const state = runtime.gameState;
  const session = runtime.session;
  if (!state || !session) {
    turnNumberEl.textContent = "-";
    phaseValueEl.textContent = "-";
    resourceValueEl.textContent = "-";
    selectedFleetLine.textContent = "Selected fleet: none";
    selectedFleetDetailsEl.textContent = "-";
    pathLine.textContent = "Planned path: 0 steps";

    submitMoveBtn.disabled = true;
    clearPathBtn.disabled = true;
    setAttackBtn.disabled = true;
    setDefenseBtn.disabled = true;
    warBtn.disabled = true;
    allyBtn.disabled = true;
    readyBtn.disabled = true;
    endTurnBtn.disabled = true;
    targetSelect.disabled = true;
    updateRelationsWindow(null);
    updateStanceButtons(null);
    return;
  }

  turnNumberEl.textContent = String(state.turnNumber);
  phaseValueEl.textContent = state.phase;
  resourceValueEl.textContent = String(getPlayerResources(state));

  const selected = getSelectedFleet(state);
  if (selected) {
    const stance = effectiveFleetStance(selected);
    const pendingTag = stance === selected.stance ? "" : ", pending";
    selectedFleetLine.textContent = `Selected fleet: ${selected.id} (AP ${selected.actionPoints}, ${stance}${pendingTag})`;
    selectedFleetDetailsEl.textContent = buildSelectedFleetDetails(selected, stance);
  } else {
    selectedFleetLine.textContent = "Selected fleet: none";
    selectedFleetDetailsEl.textContent = "-";
  }

  pathLine.textContent = `Planned path: ${runtime.plannedPath.length} steps`;

  const controlsDisabled = !activePlayerId();
  submitMoveBtn.disabled = controlsDisabled || !selected || runtime.plannedPath.length === 0;
  clearPathBtn.disabled = controlsDisabled || runtime.plannedPath.length === 0;
  setAttackBtn.disabled = controlsDisabled || !selected;
  setDefenseBtn.disabled = controlsDisabled || !selected;
  readyBtn.disabled = controlsDisabled;
  updateStanceButtons(selected);

  refreshTargetOptions(state);
  const diplomacyDisabled = controlsDisabled || targetSelect.disabled;
  warBtn.disabled = diplomacyDisabled;
  allyBtn.disabled = diplomacyDisabled;
  endTurnBtn.disabled = !isAdmin();
  updateRelationsWindow(state);

  refreshAdminFleetOwnerOptions(state);
  renderAdminLists(state);
}

function setSession(session: SessionInfo | null): void {
  runtime.session = session;
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    runtime.pendingFleetStances = {};
  }

  refreshHud();
}

function getAuthHeaders(): Record<string, string> {
  if (!runtime.session) {
    return {
      "Content-Type": "application/json",
    };
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${runtime.session.token}`,
  };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  return body;
}

async function loadStateSnapshot(): Promise<void> {
  if (!runtime.session) {
    return;
  }

  const payload = await apiRequest<{ state: GameState }>("/api/state", {
    method: "GET",
  });

  runtime.gameState = payload.state;
  reconcilePendingFleetStances(payload.state);
  refreshHud();

  window.requestAnimationFrame(() => {
    renderScene();
  });
}

async function login(): Promise<void> {
  const username = loginUserInput.value.trim();
  const password = loginPassInput.value;
  if (!username || !password) {
    setStatus("Enter username and password");
    return;
  }

  try {
    const session = await apiRequest<SessionInfo>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    setSession(session);
    try {
      await loadStateSnapshot();
    } catch (error) {
      appendEvent(`State snapshot failed: ${(error as Error).message}`);
    }
    connectSocket();
    appendEvent(`Logged in as ${session.username}`);
  } catch (error) {
    setStatus(`Login failed: ${(error as Error).message}`);
  }
}

async function restoreSession(): Promise<void> {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const session = JSON.parse(raw) as SessionInfo;
    runtime.session = session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  try {
    const me = await apiRequest<Omit<SessionInfo, "token">>("/api/me", {
      method: "GET",
    });

    setSession({
      token: runtime.session.token,
      username: me.username,
      role: me.role,
      playerId: me.playerId,
      expiresAt: me.expiresAt,
    });
    try {
      await loadStateSnapshot();
    } catch {
      // Defer to websocket stateUpdate if snapshot call fails.
    }
    connectSocket();
  } catch {
    setSession(null);
  }
}

async function logout(): Promise<void> {
  try {
    if (runtime.session) {
      await apiRequest("/api/logout", {
        method: "POST",
      });
    }
  } catch {
    // Ignore logout transport issues.
  }

  if (runtime.socket) {
    runtime.socket.close();
  }

  runtime.gameState = null;
  runtime.selectedFleetId = null;
  runtime.plannedPath = [];
  runtime.pendingFleetStances = {};
  setSession(null);
  renderScene();
  setStatus("Not authenticated");
}

function sendMessage(message: ClientMessage): boolean {
  const socket = runtime.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setStatus("Socket is not connected");
    return false;
  }

  socket.send(JSON.stringify(message));
  return true;
}

function nextActionId(prefix: string): string {
  const pid = activePlayerId() ?? "admin";
  const randomPart = Math.floor(Math.random() * 1000000).toString(36);
  return `${prefix}-${pid}-${Date.now()}-${randomPart}`;
}

function submitMove(): void {
  const state = runtime.gameState;
  const playerId = activePlayerId();
  if (!state || !playerId) {
    return;
  }

  const selected = getSelectedFleet(state);
  if (!selected || runtime.plannedPath.length === 0) {
    return;
  }

  const action: Action = {
    id: nextActionId("move"),
    playerId,
    type: "MOVE_FLEET",
    payload: {
      fleetId: selected.id,
      path: runtime.plannedPath,
    },
  };

  sendMessage({ type: "submitAction", action });
  appendEvent(`MOVE_FLEET submitted for ${selected.id} (${runtime.plannedPath.length} steps)`);
}

function submitStance(stance: FleetStance): void {
  const state = runtime.gameState;
  const playerId = activePlayerId();
  if (!state || !playerId) {
    return;
  }

  const selected = getSelectedFleet(state);
  if (!selected) {
    return;
  }

  const action: Action = {
    id: nextActionId("stance"),
    playerId,
    type: "SET_FLEET_STANCE",
    payload: {
      fleetId: selected.id,
      stance,
    },
  };

  if (!sendMessage({ type: "submitAction", action })) {
    return;
  }

  runtime.pendingFleetStances[selected.id] = stance;
  refreshHud();
  appendEvent(`SET_FLEET_STANCE submitted for ${selected.id} -> ${stance}`);
}
function submitDiplomacy(kind: "DECLARE_WAR" | "PROPOSE_ALLIANCE"): void {
  const playerId = activePlayerId();
  if (!playerId || !targetSelect.value) {
    return;
  }

  const action: Action = {
    id: nextActionId("dip"),
    playerId,
    type: "DIPLOMACY",
    payload: {
      targetPlayerId: targetSelect.value,
      action: kind,
    },
  };

  sendMessage({ type: "submitAction", action });
  appendEvent(`${kind} submitted -> ${targetSelect.value}`);
}

function clearPath(): void {
  runtime.plannedPath = [];
  refreshHud();
  renderScene();
}

async function adminPost(path: string, payload: unknown): Promise<void> {
  if (!isAdmin()) {
    return;
  }

  try {
    await apiRequest(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    appendEvent(`Admin POST ${path} success`);
  } catch (error) {
    appendEvent(`Admin POST ${path} failed: ${(error as Error).message}`);
  }
}

async function adminDelete(path: string): Promise<void> {
  if (!isAdmin()) {
    return;
  }

  try {
    await apiRequest(path, {
      method: "DELETE",
    });
    appendEvent(`Admin DELETE ${path} success`);
  } catch (error) {
    appendEvent(`Admin DELETE ${path} failed: ${(error as Error).message}`);
  }
}

function onCanvasPointerDown(event: PointerEvent): void {
  const state = runtime.gameState;
  const playerId = activePlayerId();
  if (!state || !playerId) {
    return;
  }

  const rect = (app.view as HTMLCanvasElement).getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const clicked = toHex(localX, localY);

  if (!isInsideMap(state, clicked)) {
    return;
  }

  const tile = getTile(state, clicked);
  if (!tile) {
    return;
  }

  const ownFleet = ownFleetAtCoord(state, clicked);
  if (ownFleet) {
    runtime.selectedFleetId = ownFleet.id;
    runtime.plannedPath = [];
    appendEvent(`Selected ${ownFleet.id}`);
    refreshHud();
    renderScene();
    return;
  }

  const selected = getSelectedFleet(state);
  if (!selected) {
    const fleetsHere = fleetsAtCoord(state, clicked);
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

function onCanvasPointerMove(event: PointerEvent): void {
  const state = runtime.gameState;
  if (!state) {
    setHoveredHexInfo(null);
    return;
  }

  const rect = (app.view as HTMLCanvasElement).getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const hovered = toHex(localX, localY);

  if (!isInsideMap(state, hovered) || !getTile(state, hovered)) {
    setHoveredHexInfo(null);
    return;
  }

  setHoveredHexInfo(hovered);
}

function onCanvasPointerLeave(): void {
  setHoveredHexInfo(null);
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === "stateUpdate") {
    runtime.gameState = message.state;
    reconcilePendingFleetStances(message.state);
    refreshHud();
    renderScene();
    return;
  }

  appendEvent(
    `Turn ${message.changes.turnNumber} resolved: ${message.changes.validationErrors.length} validation error(s), ${message.changes.combat.destroyedFleetIds.length} destroyed`,
  );
}

function connectSocket(): void {
  const session = runtime.session;
  if (!session) {
    return;
  }

  if (runtime.reconnectTimer) {
    window.clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }

  if (runtime.socket && runtime.socket.readyState === WebSocket.OPEN) {
    runtime.socket.close();
  }

  const socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(session.token)}`);
  runtime.socket = socket;

  socket.addEventListener("open", () => {
    setStatus(`Connected to ${wsBase}`);
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as ServerMessage;
      handleServerMessage(payload);
    } catch {
      appendEvent("Received malformed message");
    }
  });

  socket.addEventListener("close", () => {
    if (!runtime.session) {
      return;
    }
    setStatus("Disconnected. Reconnecting...");
    runtime.reconnectTimer = window.setTimeout(connectSocket, 1600);
  });

  socket.addEventListener("error", () => {
    setStatus("Socket error. Reconnecting...");
    socket.close();
  });
}

loginBtn.addEventListener("click", () => {
  void login();
});
logoutBtn.addEventListener("click", () => {
  void logout();
});

submitMoveBtn.addEventListener("click", submitMove);
clearPathBtn.addEventListener("click", clearPath);
setAttackBtn.addEventListener("click", () => submitStance("ATTACK"));
setDefenseBtn.addEventListener("click", () => submitStance("DEFENSE"));
warBtn.addEventListener("click", () => submitDiplomacy("DECLARE_WAR"));
allyBtn.addEventListener("click", () => submitDiplomacy("PROPOSE_ALLIANCE"));
readyBtn.addEventListener("click", () => {
  sendMessage({ type: "playerReady" });
  appendEvent("Ready flag sent");
});
endTurnBtn.addEventListener("click", () => {
  sendMessage({ type: "endTurn" });
  appendEvent("endTurn sent");
});

adminAddPlayerBtn.addEventListener("click", () => {
  void adminPost("/api/admin/players", {
    id: adminPlayerIdInput.value.trim(),
    name: adminPlayerNameInput.value.trim(),
    username: adminPlayerUsernameInput.value.trim() || undefined,
    password: adminPlayerPasswordInput.value.trim() || undefined,
  });
});

adminAddPlanetBtn.addEventListener("click", () => {
  void adminPost("/api/admin/planets", {
    id: adminPlanetIdInput.value.trim(),
    q: Number(adminPlanetQInput.value),
    r: Number(adminPlanetRInput.value),
    resourceProduction: Number(adminPlanetResInput.value),
    influenceValue: Number(adminPlanetInfInput.value),
  });
});

adminAddFleetBtn.addEventListener("click", () => {
  void adminPost("/api/admin/fleets", {
    id: adminFleetIdInput.value.trim(),
    ownerPlayerId: adminFleetOwnerSelect.value,
    q: Number(adminFleetQInput.value),
    r: Number(adminFleetRInput.value),
    combatPower: Number(adminFleetPowerInput.value || "10"),
    health: Number(adminFleetHealthInput.value || "100"),
    influence: Number(adminFleetInfluenceInput.value || "5"),
    visionRange: Number(adminFleetVisionInput.value || "2"),
    capacity: Number(adminFleetCapacityInput.value || "10"),
  });
});

(app.view as HTMLCanvasElement).addEventListener("pointerdown", onCanvasPointerDown);
(app.view as HTMLCanvasElement).addEventListener("pointermove", onCanvasPointerMove);
(app.view as HTMLCanvasElement).addEventListener("pointerleave", onCanvasPointerLeave);

refreshHud();
setHoveredHexInfo(null);
renderScene();
void restoreSession();























