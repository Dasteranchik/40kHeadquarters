import { randomUUID } from "crypto";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { RawData, WebSocket, WebSocketServer } from "ws";

import { ClientMessage } from "./api/ws";
import {
  Account,
  AddFactionRequest,
  AddFleetRequest,
  AddPlanetRequest,
  AddPlayerRequest,
  ClientContext,
  LoginRequest,
  RelationRequest,
  Session,
  UpdateFactionRequest,
  UpdateFleetRequest,
  UpdatePlanetRequest,
  UpdatePlayerRequest,
} from "./server/contracts";
import {
  applyImmediateDiplomacy,
  clearAllianceProposalsForPair,
  clearAllianceProposalsForPlayer,
} from "./server/immediateDiplomacy";
import { normalizeGameState } from "./server/normalization";
import { createInitialDocumentSnapshot } from "./server/seed";
import {
  getBearerToken,
  parseClientMessage,
  readJsonBody,
  send,
  setCorsHeaders,
  writeJson,
} from "./server/transport";
import { buildResolutionForSession, buildStateForSession } from "./server/visibility";
import { resolveTurn } from "./turn/resolveTurn";
import { DbAccount, DocumentDb } from "./storage/documentDb";
import {
  computePopulationProduction,
  INFO_CATEGORIES,
  isInfoCategory,
  isPlanetTag,
  isPlanetWorldType,
  isResourceKey,
  isTitheLevel,
  RAW_OUTPUTS_BY_WORLD_TYPE,
  titheValue,
} from "./planetDomain";
import {
  collectRelationPairs,
  linkPlayers,
  removeFromArray,
  unlinkPlayers,
} from "./utils/relations";
import {
  isFiniteNumber,
  isFleetDomain,
  isFleetStance,
  isNonEmptyString,
  isPlayerAlignment,
  isValidId,
} from "./utils/validation";
import {
  Action,
  Faction,
  Fleet,
  GameState,
  HexCoord,
  IntelFragmentMap,
  Planet,
  Player,
  ResourceStore,
  Tile,
} from "./types";

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const db = new DocumentDb(createInitialDocumentSnapshot());
const persisted = db.getSnapshot();

const state = normalizeGameState(persisted.gameState);
const pendingActions = new Map<string, Action>();
const pendingAllianceProposals = new Set<string>();
const readyPlayers = new Set<string>();
const clients = new Map<WebSocket, ClientContext>();

const accounts = new Map<string, Account>();
for (const account of Object.values(persisted.accounts)) {
  accounts.set(account.username, { ...account });
}

if (!accounts.has("admin")) {
  accounts.set("admin", {
    username: "admin",
    password: "admin123",
    role: "admin",
    playerId: "p1",
  });
}

function persistDatabase(): void {
  const storedAccounts: Record<string, DbAccount> = {};
  for (const [username, account] of accounts.entries()) {
    storedAccounts[username] = {
      username: account.username,
      password: account.password,
      role: account.role,
      playerId: account.playerId,
    };
  }

  db.replace({
    gameState: state,
    accounts: storedAccounts,
  });
}

persistDatabase();

const sessions = new Map<string, Session>();

function createSession(account: Account): Session {
  const token = randomUUID();
  const session: Session = {
    token,
    username: account.username,
    role: account.role,
    playerId: account.playerId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessions.set(token, session);
  return session;
}

function getSessionByToken(token: string | null): Session | null {
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function getSessionFromRequest(req: IncomingMessage): Session | null {
  return getSessionByToken(getBearerToken(req));
}

function requireSession(req: IncomingMessage, res: ServerResponse): Session | null {
  const session = getSessionFromRequest(req);
  if (!session) {
    writeJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

function requireAdmin(req: IncomingMessage, res: ServerResponse): Session | null {
  const session = requireSession(req, res);
  if (!session) {
    return null;
  }

  if (session.role !== "admin") {
    writeJson(res, 403, { error: "Admin role required" });
    return null;
  }

  return session;
}

function ensurePlanningPhase(res: ServerResponse): boolean {
  if (state.phase !== "PLANNING") {
    writeJson(res, 409, { error: "Operation allowed only in PLANNING phase" });
    return false;
  }
  return true;
}

function getTileAt(coord: HexCoord): Tile | null {
  return state.map.tiles.find((tile) => tile.q === coord.q && tile.r === coord.r) ?? null;
}

function parseResourceStore(value: unknown): ResourceStore | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: ResourceStore = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isResourceKey(key) || !isFiniteNumber(raw)) {
      return null;
    }

    const amount = Math.max(0, Math.trunc(raw));
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

function parseIntelFragments(value: unknown): IntelFragmentMap | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result: IntelFragmentMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isInfoCategory(key) || !isFiniteNumber(raw)) {
      return null;
    }

    const amount = Math.max(0, Math.trunc(raw));
    if (amount > 0) {
      result[key] = amount;
    }
  }

  return result;
}

function computePlanetResourceProduction(planet: Planet): number {
  const outputs = RAW_OUTPUTS_BY_WORLD_TYPE[planet.worldType] ?? [];
  return computePopulationProduction(planet.population) * outputs.length;
}

function setPlanetResourceProduction(planet: Planet): void {
  planet.resourceProduction = computePlanetResourceProduction(planet);
}

function getDefaultFactionId(): string | null {
  const factionIds = Object.keys(state.factions).sort((a, b) => a.localeCompare(b));
  return factionIds.length > 0 ? factionIds[0] : null;
}

function findPlayerAccount(playerId: string): [string, Account] | null {
  for (const entry of accounts.entries()) {
    const [, account] = entry;
    if (account.playerId === playerId && account.role === "player") {
      return entry;
    }
  }

  return null;
}

function removeSessionsForPlayer(playerId: string): void {
  for (const [token, session] of sessions.entries()) {
    if (session.playerId === playerId) {
      sessions.delete(token);
    }
  }
}

function removeAccountsForPlayer(playerId: string): void {
  for (const [username, account] of accounts.entries()) {
    if (account.playerId === playerId && account.role === "player") {
      accounts.delete(username);
    }
  }
}

function broadcastState(): void {
  for (const context of clients.values()) {
    send(context.socket, {
      type: "stateUpdate",
      state: buildStateForSession(context.session, state),
    });
  }
}

function resolveAndBroadcastTurn(): void {
  const ownerByFleetIdBeforeResolution = new Map<string, string>();
  for (const fleet of Object.values(state.fleets)) {
    ownerByFleetIdBeforeResolution.set(fleet.id, fleet.ownerPlayerId);
  }

  const resolution = resolveTurn(state, [...pendingActions.values()]);
  pendingActions.clear();
  pendingAllianceProposals.clear();
  readyPlayers.clear();
  persistDatabase();

  for (const context of clients.values()) {
    send(context.socket, {
      type: "turnResolved",
      changes: buildResolutionForSession(
        context.session,
        state,
        resolution,
        ownerByFleetIdBeforeResolution,
      ),
    });
  }

  broadcastState();
}

function sanitizeActionForContext(action: Action, context: ClientContext): Action | null {
  if (context.session.role === "admin") {
    return action;
  }

  const playerId = context.session.playerId;
  if (!playerId || action.playerId !== playerId) {
    return null;
  }

  return action;
}

function applySubmitAction(context: ClientContext, message: ClientMessage): void {
  if (message.type !== "submitAction") {
    return;
  }

  if (state.phase !== "PLANNING") {
    return;
  }

  const action = sanitizeActionForContext(message.action, context);
  if (!action) {
    return;
  }

  if (action.type === "DIPLOMACY") {
    readyPlayers.delete(action.playerId);
    if (applyImmediateDiplomacy(state, pendingAllianceProposals, action)) {
      persistDatabase();
      broadcastState();
    }
    return;
  }

  pendingActions.set(action.id, action);
  if (action.playerId) {
    readyPlayers.delete(action.playerId);
  }
}

function applyRemoveAction(context: ClientContext, message: ClientMessage): void {
  if (message.type !== "removeAction") {
    return;
  }

  if (state.phase !== "PLANNING") {
    return;
  }

  const action = pendingActions.get(message.actionId);
  if (!action) {
    return;
  }

  if (context.session.role !== "admin" && action.playerId !== context.session.playerId) {
    return;
  }

  pendingActions.delete(message.actionId);
}

function applyReady(context: ClientContext, message: ClientMessage): void {
  if (message.type !== "playerReady") {
    return;
  }

  if (state.phase !== "PLANNING") {
    return;
  }

  if (context.session.playerId) {
    readyPlayers.add(context.session.playerId);
  }
}

function applyEndTurn(context: ClientContext, message: ClientMessage): void {
  if (message.type !== "endTurn") {
    return;
  }

  if (context.session.role !== "admin" || state.phase !== "PLANNING") {
    return;
  }

  state.phase = "LOCKED";
  broadcastState();

  state.phase = "RESOLUTION";
  resolveAndBroadcastTurn();
}

async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<LoginRequest>(req);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    writeJson(res, 400, { error: "Invalid login payload" });
    return;
  }

  const account = accounts.get(body.username);
  if (!account || account.password !== body.password) {
    writeJson(res, 401, { error: "Invalid credentials" });
    return;
  }

  const session = createSession(account);
  writeJson(res, 200, {
    token: session.token,
    username: session.username,
    role: session.role,
    playerId: session.playerId,
    expiresAt: session.expiresAt,
  });
}

function handleMe(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  writeJson(res, 200, {
    username: session.username,
    role: session.role,
    playerId: session.playerId,
    expiresAt: session.expiresAt,
  });
}

function handleState(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  writeJson(res, 200, {
    state: buildStateForSession(session, state),
  });
}

function handleLogout(req: IncomingMessage, res: ServerResponse): void {
  const token = getBearerToken(req);
  if (token) {
    sessions.delete(token);
  }

  writeJson(res, 200, { ok: true });
}

async function handleAddPlayer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const body = await readJsonBody<AddPlayerRequest>(req);
  if (!body || typeof body.id !== "string" || typeof body.name !== "string") {
    writeJson(res, 400, { error: "Invalid player payload" });
    return;
  }

  if (!isValidId(body.id)) {
    writeJson(res, 400, { error: "Player id must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (state.players[body.id]) {
    writeJson(res, 409, { error: "Player id already exists" });
    return;
  }

  if (body.alignment !== undefined && !isPlayerAlignment(body.alignment)) {
    writeJson(res, 400, { error: "alignment must be IMPERIAL or NON_IMPERIAL" });
    return;
  }

  if (body.factionId !== undefined && !isValidId(body.factionId)) {
    writeJson(res, 400, { error: "factionId must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (body.factionId !== undefined && !state.factions[body.factionId]) {
    writeJson(res, 400, { error: "factionId is invalid" });
    return;
  }

  const defaultFactionId = body.factionId ?? getDefaultFactionId();
  if (!defaultFactionId) {
    writeJson(res, 400, { error: "No factions configured" });
    return;
  }

  const username = body.username ?? body.id;
  const password = body.password ?? body.id;

  if (!isValidId(username)) {
    writeJson(res, 400, { error: "Username must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (accounts.has(username)) {
    writeJson(res, 409, { error: "Username already exists" });
    return;
  }

  const player: Player = {
    id: body.id,
    name: body.name,
    resources: 100,
    alliances: [],
    wars: [],
    exploredTiles: [],
    alignment: body.alignment ?? "NON_IMPERIAL",
    factionId: defaultFactionId,
    intelFragments: {},
  };

  state.players[player.id] = player;
  accounts.set(username, {
    username,
    password,
    role: "player",
    playerId: player.id,
  });

  persistDatabase();
  broadcastState();
  writeJson(res, 201, { player, login: { username, password } });
}

function handleDeletePlayer(req: IncomingMessage, res: ServerResponse, playerId: string): void {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    writeJson(res, 404, { error: "Player not found" });
    return;
  }

  delete state.players[playerId];

  for (const other of Object.values(state.players)) {
    removeFromArray(other.alliances, playerId);
    removeFromArray(other.wars, playerId);
  }

  for (const [fleetId, fleet] of Object.entries(state.fleets)) {
    if (fleet.ownerPlayerId === playerId) {
      delete state.fleets[fleetId];
    }
  }

  for (const [actionId, action] of pendingActions.entries()) {
    if (action.playerId === playerId) {
      pendingActions.delete(actionId);
    }
  }

  readyPlayers.delete(playerId);
  removeAccountsForPlayer(playerId);
  removeSessionsForPlayer(playerId);
  clearAllianceProposalsForPlayer(pendingAllianceProposals, playerId);
  state.pendingInformantActions = state.pendingInformantActions.filter(
    (entry) => entry.playerId !== playerId,
  );
  state.pendingTitheChanges = state.pendingTitheChanges.filter(
    (entry) => entry.requestedByPlayerId !== playerId,
  );

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { removedPlayerId: playerId });
}

async function handleAddPlanet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const body = await readJsonBody<AddPlanetRequest>(req);
  if (
    !body ||
    typeof body.id !== "string" ||
    !isFiniteNumber(body.q) ||
    !isFiniteNumber(body.r)
  ) {
    writeJson(res, 400, { error: "Invalid planet payload" });
    return;
  }

  if (!isValidId(body.id)) {
    writeJson(res, 400, { error: "Planet id must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (state.planets[body.id]) {
    writeJson(res, 409, { error: "Planet id already exists" });
    return;
  }

  if (body.worldType !== undefined && !isPlanetWorldType(body.worldType)) {
    writeJson(res, 400, { error: "worldType is invalid" });
    return;
  }

  if (
    body.worldTags !== undefined &&
    (!Array.isArray(body.worldTags) || body.worldTags.some((tag) => !isPlanetTag(tag)))
  ) {
    writeJson(res, 400, { error: "worldTags must be an array of valid tags" });
    return;
  }

  const numericChecks: Array<[unknown, string]> = [
    [body.population, "population"],
    [body.morale, "morale"],
    [body.tithePaid, "tithePaid"],
    [body.influenceValue, "influenceValue"],
    [body.visionRange, "visionRange"],
    [body.overviewRange, "overviewRange"],
  ];

  for (const [value, field] of numericChecks) {
    if (value !== undefined && !isFiniteNumber(value)) {
      writeJson(res, 400, { error: `${field} must be a number` });
      return;
    }
  }

  if (body.titheLevel !== undefined && !isTitheLevel(body.titheLevel)) {
    writeJson(res, 400, { error: "titheLevel is invalid" });
    return;
  }

  const parsedRawStock =
    body.rawStock === undefined ? {} : parseResourceStore(body.rawStock);
  if (parsedRawStock === null) {
    writeJson(res, 400, { error: "rawStock must be an object<ResourceKey, number>" });
    return;
  }

  const parsedProductStorage =
    body.productStorage === undefined ? {} : parseResourceStore(body.productStorage);
  if (parsedProductStorage === null) {
    writeJson(res, 400, { error: "productStorage must be an object<ResourceKey, number>" });
    return;
  }

  const parsedInfoFragments =
    body.infoFragments === undefined ? {} : parseIntelFragments(body.infoFragments);
  if (parsedInfoFragments === null) {
    writeJson(res, 400, { error: "infoFragments must be an object<InfoCategory, number>" });
    return;
  }

  const coord = { q: Math.trunc(body.q), r: Math.trunc(body.r) };
  const tile = getTileAt(coord);
  if (!tile) {
    writeJson(res, 400, { error: "Planet position is outside the map" });
    return;
  }

  if (tile.planetId) {
    writeJson(res, 409, { error: "Tile already has a planet" });
    return;
  }

  if (tile.terrainType === "OBSTACLE") {
    writeJson(res, 400, { error: "Cannot place planet on obstacle tile" });
    return;
  }

  const titheLevel = body.titheLevel ?? "DECUMA_PRIMA";
  const visionRange = Math.max(0, Math.trunc(body.visionRange ?? 1));
  const planet: Planet = {
    id: body.id,
    position: coord,
    worldType: body.worldType ?? "AGRI_WORLD",
    worldTags: body.worldTags ? [...new Set(body.worldTags)] : [],
    population: Math.max(0, Math.trunc(body.population ?? 60)),
    morale: Math.max(0, Math.trunc(body.morale ?? 5)),
    titheLevel,
    titheTarget: titheValue(titheLevel),
    tithePaid: Math.max(0, Math.trunc(body.tithePaid ?? 0)),
    resourceProduction: 0,
    influenceValue: Math.max(0, Math.trunc(body.influenceValue ?? 1)),
    visionRange,
    overviewRange: Math.max(0, Math.trunc(body.overviewRange ?? visionRange)),
    rawStock: parsedRawStock,
    productStorage: parsedProductStorage,
    infoFragments: parsedInfoFragments,
  };

  setPlanetResourceProduction(planet);

  state.planets[planet.id] = planet;
  tile.planetId = planet.id;

  persistDatabase();
  broadcastState();
  writeJson(res, 201, { planet });
}

function handleDeletePlanet(req: IncomingMessage, res: ServerResponse, planetId: string): void {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const planet = state.planets[planetId];
  if (!planet) {
    writeJson(res, 404, { error: "Planet not found" });
    return;
  }

  const tile = getTileAt(planet.position);
  if (tile && tile.planetId === planetId) {
    delete tile.planetId;
  }

  delete state.planets[planetId];
  state.pendingInformantActions = state.pendingInformantActions.filter(
    (entry) => entry.planetId !== planetId,
  );
  state.pendingTitheChanges = state.pendingTitheChanges.filter(
    (entry) => entry.planetId !== planetId,
  );

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { removedPlanetId: planetId });
}

async function handleAddFleet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const body = await readJsonBody<AddFleetRequest>(req);
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.ownerPlayerId !== "string" ||
    !isFiniteNumber(body.q) ||
    !isFiniteNumber(body.r)
  ) {
    writeJson(res, 400, { error: "Invalid fleet payload" });
    return;
  }

  if (!isValidId(body.id)) {
    writeJson(res, 400, { error: "Fleet id must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (state.fleets[body.id]) {
    writeJson(res, 409, { error: "Fleet id already exists" });
    return;
  }

  if (!state.players[body.ownerPlayerId]) {
    writeJson(res, 404, { error: "Owner player not found" });
    return;
  }

  if (body.stance !== undefined && !isFleetStance(body.stance)) {
    writeJson(res, 400, { error: "Stance must be ATTACK or DEFENSE" });
    return;
  }

  if (body.domain !== undefined && !isFleetDomain(body.domain)) {
    writeJson(res, 400, { error: "domain must be SPACE or GROUND" });
    return;
  }

  const parsedInventory =
    body.inventory === undefined ? {} : parseResourceStore(body.inventory);
  if (parsedInventory === null) {
    writeJson(res, 400, { error: "inventory must be an object<ResourceKey, number>" });
    return;
  }

  const position = { q: Math.trunc(body.q), r: Math.trunc(body.r) };
  const tile = getTileAt(position);
  if (!tile) {
    writeJson(res, 400, { error: "Fleet position is outside the map" });
    return;
  }

  if (tile.terrainType === "OBSTACLE") {
    writeJson(res, 400, { error: "Cannot place fleet on obstacle tile" });
    return;
  }

  const fleet: Fleet = {
    id: body.id,
    ownerPlayerId: body.ownerPlayerId,
    position,
    combatPower: Math.max(0, Math.trunc(body.combatPower ?? 10)),
    health: Math.max(1, Math.trunc(body.health ?? 100)),
    influence: Math.max(0, Math.trunc(body.influence ?? 5)),
    actionPoints: Math.max(0, Math.trunc(body.actionPoints ?? 3)),
    visionRange: Math.max(0, Math.trunc(body.visionRange ?? 2)),
    capacity: Math.max(0, Math.trunc(body.capacity ?? 10)),
    stance: body.stance ?? "ATTACK",
    domain: body.domain ?? "SPACE",
    inventory: parsedInventory,
  };

  state.fleets[fleet.id] = fleet;

  persistDatabase();
  broadcastState();
  writeJson(res, 201, { fleet });
}

function handleDeleteFleet(req: IncomingMessage, res: ServerResponse, fleetId: string): void {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  if (!state.fleets[fleetId]) {
    writeJson(res, 404, { error: "Fleet not found" });
    return;
  }

  delete state.fleets[fleetId];

  for (const [actionId, action] of pendingActions.entries()) {
    if (
      ((action.type === "MOVE_FLEET" || action.type === "SET_FLEET_STANCE") &&
        action.payload.fleetId === fleetId) ||
      (action.type === "PLANET_ACTION" && action.payload.fleetId === fleetId)
    ) {
      pendingActions.delete(actionId);
    }
  }

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { removedFleetId: fleetId });
}

function handleListPlayers(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAdmin(req, res)) {
    return;
  }

  const loginByPlayerId = new Map<string, { username: string; password: string }>();
  for (const account of accounts.values()) {
    if (account.role === "player" && account.playerId) {
      loginByPlayerId.set(account.playerId, {
        username: account.username,
        password: account.password,
      });
    }
  }

  const players = Object.values(state.players)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((player) => ({
      ...player,
      login: loginByPlayerId.get(player.id) ?? null,
    }));

  writeJson(res, 200, { players });
}

function handleListFactions(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAdmin(req, res)) {
    return;
  }

  const factions = Object.values(state.factions).sort((a, b) => a.id.localeCompare(b.id));
  writeJson(res, 200, { factions });
}

async function handleAddFaction(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const body = await readJsonBody<AddFactionRequest>(req);
  if (!body || typeof body.id !== "string" || !isNonEmptyString(body.name)) {
    writeJson(res, 400, { error: "Invalid faction payload" });
    return;
  }

  if (!isValidId(body.id)) {
    writeJson(res, 400, { error: "Faction id must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (state.factions[body.id]) {
    writeJson(res, 409, { error: "Faction id already exists" });
    return;
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    writeJson(res, 400, { error: "description must be a string" });
    return;
  }

  const faction: Faction = {
    id: body.id,
    name: body.name.trim(),
    description:
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : undefined,
  };

  state.factions[faction.id] = faction;

  persistDatabase();
  broadcastState();
  writeJson(res, 201, { faction });
}

async function handleUpdateFaction(
  req: IncomingMessage,
  res: ServerResponse,
  factionId: string,
): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const faction = state.factions[factionId];
  if (!faction) {
    writeJson(res, 404, { error: "Faction not found" });
    return;
  }

  const body = await readJsonBody<UpdateFactionRequest>(req);
  if (!body) {
    writeJson(res, 400, { error: "Invalid faction payload" });
    return;
  }

  if (body.name !== undefined && !isNonEmptyString(body.name)) {
    writeJson(res, 400, { error: "name must be a non-empty string" });
    return;
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    writeJson(res, 400, { error: "description must be a string" });
    return;
  }

  if (body.name !== undefined) {
    faction.name = body.name.trim();
  }

  if (body.description !== undefined) {
    faction.description = body.description.trim().length > 0 ? body.description.trim() : undefined;
  }

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { faction });
}

function handleDeleteFaction(req: IncomingMessage, res: ServerResponse, factionId: string): void {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  if (!state.factions[factionId]) {
    writeJson(res, 404, { error: "Faction not found" });
    return;
  }

  const assignedPlayer = Object.values(state.players).find((player) => player.factionId === factionId);
  if (assignedPlayer) {
    writeJson(res, 409, {
      error: `Faction is assigned to player ${assignedPlayer.id}. Reassign players before deletion.`,
    });
    return;
  }

  delete state.factions[factionId];

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { removedFactionId: factionId });
}

function handleListPlanets(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAdmin(req, res)) {
    return;
  }

  const planets = Object.values(state.planets).sort((a, b) => a.id.localeCompare(b.id));
  writeJson(res, 200, { planets });
}

function handleListFleets(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAdmin(req, res)) {
    return;
  }

  const fleets = Object.values(state.fleets).sort((a, b) => a.id.localeCompare(b.id));
  writeJson(res, 200, { fleets });
}

function handleListRelations(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAdmin(req, res)) {
    return;
  }

  writeJson(res, 200, {
    alliances: collectRelationPairs(state.players, "alliances"),
    wars: collectRelationPairs(state.players, "wars"),
  });
}

async function handleUpdatePlayer(
  req: IncomingMessage,
  res: ServerResponse,
  playerId: string,
): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    writeJson(res, 404, { error: "Player not found" });
    return;
  }

  const body = await readJsonBody<UpdatePlayerRequest>(req);
  if (!body) {
    writeJson(res, 400, { error: "Invalid player payload" });
    return;
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    writeJson(res, 400, { error: "name must be a string" });
    return;
  }

  if (body.resources !== undefined && !isFiniteNumber(body.resources)) {
    writeJson(res, 400, { error: "resources must be a number" });
    return;
  }

  if (body.username !== undefined && typeof body.username !== "string") {
    writeJson(res, 400, { error: "username must be a string" });
    return;
  }

  if (body.password !== undefined && typeof body.password !== "string") {
    writeJson(res, 400, { error: "password must be a string" });
    return;
  }

  if (body.alignment !== undefined && !isPlayerAlignment(body.alignment)) {
    writeJson(res, 400, { error: "alignment must be IMPERIAL or NON_IMPERIAL" });
    return;
  }

  if (body.factionId !== undefined && !isValidId(body.factionId)) {
    writeJson(res, 400, { error: "factionId must match [a-zA-Z0-9_-]{2,32}" });
    return;
  }

  if (body.factionId !== undefined && !state.factions[body.factionId]) {
    writeJson(res, 400, { error: "factionId is invalid" });
    return;
  }

  if (body.name !== undefined) {
    player.name = body.name.trim() || player.name;
  }

  if (body.resources !== undefined) {
    player.resources = Math.max(0, Math.trunc(body.resources));
  }

  if (body.alignment !== undefined) {
    player.alignment = body.alignment;
  }

  if (body.factionId !== undefined) {
    player.factionId = body.factionId;
  }

  let entry = findPlayerAccount(playerId);
  if (!entry) {
    if (accounts.has(playerId)) {
      writeJson(res, 409, { error: "Default username is occupied by another account" });
      return;
    }

    const fallback: Account = {
      username: playerId,
      password: playerId,
      role: "player",
      playerId,
    };
    accounts.set(fallback.username, fallback);
    entry = [fallback.username, fallback];
  }

  const [currentUsername, currentAccount] = entry;
  const requestedUsername = body.username?.trim();
  if (requestedUsername !== undefined) {
    if (!requestedUsername || !isValidId(requestedUsername)) {
      writeJson(res, 400, { error: "Username must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (requestedUsername !== currentUsername && accounts.has(requestedUsername)) {
      writeJson(res, 409, { error: "Username already exists" });
      return;
    }
  }

  const nextUsername = requestedUsername ?? currentUsername;
  const nextPassword = body.password ?? currentAccount.password;

  if (nextUsername !== currentUsername) {
    accounts.delete(currentUsername);
  }

  accounts.set(nextUsername, {
    username: nextUsername,
    password: nextPassword,
    role: "player",
    playerId,
  });

  const login = findPlayerAccount(playerId)?.[1] ?? null;

  persistDatabase();
  broadcastState();
  writeJson(res, 200, {
    player,
    login: login
      ? {
          username: login.username,
          password: login.password,
        }
      : null,
  });
}

async function handleUpdatePlanet(
  req: IncomingMessage,
  res: ServerResponse,
  planetId: string,
): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const planet = state.planets[planetId];
  if (!planet) {
    writeJson(res, 404, { error: "Planet not found" });
    return;
  }

  const body = await readJsonBody<UpdatePlanetRequest>(req);
  if (!body) {
    writeJson(res, 400, { error: "Invalid planet payload" });
    return;
  }

  if (body.q !== undefined && !isFiniteNumber(body.q)) {
    writeJson(res, 400, { error: "q must be a number" });
    return;
  }

  if (body.r !== undefined && !isFiniteNumber(body.r)) {
    writeJson(res, 400, { error: "r must be a number" });
    return;
  }

  if (body.worldType !== undefined && !isPlanetWorldType(body.worldType)) {
    writeJson(res, 400, { error: "worldType is invalid" });
    return;
  }

  if (
    body.worldTags !== undefined &&
    (!Array.isArray(body.worldTags) || body.worldTags.some((tag) => !isPlanetTag(tag)))
  ) {
    writeJson(res, 400, { error: "worldTags must be an array of valid tags" });
    return;
  }

  const numericChecks: Array<[unknown, string]> = [
    [body.population, "population"],
    [body.morale, "morale"],
    [body.tithePaid, "tithePaid"],
    [body.influenceValue, "influenceValue"],
    [body.visionRange, "visionRange"],
    [body.overviewRange, "overviewRange"],
  ];

  for (const [value, field] of numericChecks) {
    if (value !== undefined && !isFiniteNumber(value)) {
      writeJson(res, 400, { error: `${field} must be a number` });
      return;
    }
  }

  if (body.titheLevel !== undefined && !isTitheLevel(body.titheLevel)) {
    writeJson(res, 400, { error: "titheLevel is invalid" });
    return;
  }

  const parsedRawStock =
    body.rawStock === undefined ? undefined : parseResourceStore(body.rawStock);
  if (parsedRawStock === null) {
    writeJson(res, 400, { error: "rawStock must be an object<ResourceKey, number>" });
    return;
  }

  const parsedProductStorage =
    body.productStorage === undefined ? undefined : parseResourceStore(body.productStorage);
  if (parsedProductStorage === null) {
    writeJson(res, 400, { error: "productStorage must be an object<ResourceKey, number>" });
    return;
  }

  const parsedInfoFragments =
    body.infoFragments === undefined ? undefined : parseIntelFragments(body.infoFragments);
  if (parsedInfoFragments === null) {
    writeJson(res, 400, { error: "infoFragments must be an object<InfoCategory, number>" });
    return;
  }

  const nextPosition = {
    q: body.q !== undefined ? Math.trunc(body.q) : planet.position.q,
    r: body.r !== undefined ? Math.trunc(body.r) : planet.position.r,
  };

  const moved =
    nextPosition.q !== planet.position.q ||
    nextPosition.r !== planet.position.r;

  if (moved) {
    const nextTile = getTileAt(nextPosition);
    if (!nextTile) {
      writeJson(res, 400, { error: "Planet position is outside the map" });
      return;
    }

    if (nextTile.terrainType === "OBSTACLE") {
      writeJson(res, 400, { error: "Cannot place planet on obstacle tile" });
      return;
    }

    if (nextTile.planetId && nextTile.planetId !== planetId) {
      writeJson(res, 409, { error: "Tile already has a planet" });
      return;
    }

    const prevTile = getTileAt(planet.position);
    if (prevTile && prevTile.planetId === planetId) {
      delete prevTile.planetId;
    }

    nextTile.planetId = planetId;
    planet.position = nextPosition;
  }

  if (body.worldType !== undefined) {
    planet.worldType = body.worldType;
  }

  if (body.worldTags !== undefined) {
    planet.worldTags = [...new Set(body.worldTags)];
  }

  if (body.population !== undefined) {
    planet.population = Math.max(0, Math.trunc(body.population));
  }

  if (body.morale !== undefined) {
    planet.morale = Math.max(0, Math.trunc(body.morale));
  }

  if (body.titheLevel !== undefined) {
    planet.titheLevel = body.titheLevel;
    planet.titheTarget = titheValue(body.titheLevel);
  }

  if (body.tithePaid !== undefined) {
    planet.tithePaid = Math.max(0, Math.trunc(body.tithePaid));
  }

  if (body.influenceValue !== undefined) {
    planet.influenceValue = Math.max(0, Math.trunc(body.influenceValue));
  }

  if (body.visionRange !== undefined) {
    planet.visionRange = Math.max(0, Math.trunc(body.visionRange));
  }

  if (body.overviewRange !== undefined) {
    planet.overviewRange = Math.max(0, Math.trunc(body.overviewRange));
  }

  if (parsedRawStock !== undefined) {
    planet.rawStock = parsedRawStock;
  }

  if (parsedProductStorage !== undefined) {
    planet.productStorage = parsedProductStorage;
  }

  if (parsedInfoFragments !== undefined) {
    planet.infoFragments = parsedInfoFragments;
  }

  setPlanetResourceProduction(planet);

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { planet });
}

async function handleUpdateFleet(
  req: IncomingMessage,
  res: ServerResponse,
  fleetId: string,
): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const fleet = state.fleets[fleetId];
  if (!fleet) {
    writeJson(res, 404, { error: "Fleet not found" });
    return;
  }

  const body = await readJsonBody<UpdateFleetRequest>(req);
  if (!body) {
    writeJson(res, 400, { error: "Invalid fleet payload" });
    return;
  }

  if (body.ownerPlayerId !== undefined && typeof body.ownerPlayerId !== "string") {
    writeJson(res, 400, { error: "ownerPlayerId must be a string" });
    return;
  }

  if (body.ownerPlayerId && !state.players[body.ownerPlayerId]) {
    writeJson(res, 404, { error: "Owner player not found" });
    return;
  }

  const numericChecks: Array<[unknown, string]> = [
    [body.q, "q"],
    [body.r, "r"],
    [body.combatPower, "combatPower"],
    [body.health, "health"],
    [body.influence, "influence"],
    [body.actionPoints, "actionPoints"],
    [body.visionRange, "visionRange"],
    [body.capacity, "capacity"],
  ];

  for (const [value, field] of numericChecks) {
    if (value !== undefined && !isFiniteNumber(value)) {
      writeJson(res, 400, { error: `${field} must be a number` });
      return;
    }
  }

  if (body.stance !== undefined && !isFleetStance(body.stance)) {
    writeJson(res, 400, { error: "Stance must be ATTACK or DEFENSE" });
    return;
  }

  if (body.domain !== undefined && !isFleetDomain(body.domain)) {
    writeJson(res, 400, { error: "domain must be SPACE or GROUND" });
    return;
  }

  const parsedInventory =
    body.inventory === undefined ? undefined : parseResourceStore(body.inventory);
  if (parsedInventory === null) {
    writeJson(res, 400, { error: "inventory must be an object<ResourceKey, number>" });
    return;
  }

  const nextPosition = {
    q: body.q !== undefined ? Math.trunc(body.q) : fleet.position.q,
    r: body.r !== undefined ? Math.trunc(body.r) : fleet.position.r,
  };

  const tile = getTileAt(nextPosition);
  if (!tile) {
    writeJson(res, 400, { error: "Fleet position is outside the map" });
    return;
  }

  if (tile.terrainType === "OBSTACLE") {
    writeJson(res, 400, { error: "Cannot place fleet on obstacle tile" });
    return;
  }

  if (body.ownerPlayerId !== undefined) {
    fleet.ownerPlayerId = body.ownerPlayerId;
  }

  fleet.position = nextPosition;

  if (body.combatPower !== undefined) {
    fleet.combatPower = Math.max(0, Math.trunc(body.combatPower));
  }

  if (body.health !== undefined) {
    fleet.health = Math.max(1, Math.trunc(body.health));
  }

  if (body.influence !== undefined) {
    fleet.influence = Math.max(0, Math.trunc(body.influence));
  }

  if (body.actionPoints !== undefined) {
    fleet.actionPoints = Math.max(0, Math.trunc(body.actionPoints));
  }

  if (body.visionRange !== undefined) {
    fleet.visionRange = Math.max(0, Math.trunc(body.visionRange));
  }

  if (body.capacity !== undefined) {
    fleet.capacity = Math.max(0, Math.trunc(body.capacity));
  }

  if (body.stance !== undefined) {
    fleet.stance = body.stance;
  }

  if (body.domain !== undefined) {
    fleet.domain = body.domain;
  }

  if (parsedInventory !== undefined) {
    fleet.inventory = parsedInventory;
  }

  persistDatabase();
  broadcastState();
  writeJson(res, 200, { fleet });
}

async function handleAddRelation(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const body = await readJsonBody<RelationRequest>(req);
  if (
    !body ||
    typeof body.playerAId !== "string" ||
    typeof body.playerBId !== "string" ||
    (body.type !== "WAR" && body.type !== "ALLIANCE")
  ) {
    writeJson(res, 400, { error: "Invalid relation payload" });
    return;
  }

  if (body.playerAId === body.playerBId) {
    writeJson(res, 400, { error: "Players must be different" });
    return;
  }

  if (!state.players[body.playerAId] || !state.players[body.playerBId]) {
    writeJson(res, 404, { error: "Player not found" });
    return;
  }

  if (body.type === "WAR") {
    linkPlayers(state.players, "wars", body.playerAId, body.playerBId);
    unlinkPlayers(state.players, "alliances", body.playerAId, body.playerBId);
  } else {
    linkPlayers(state.players, "alliances", body.playerAId, body.playerBId);
    unlinkPlayers(state.players, "wars", body.playerAId, body.playerBId);
  }

  clearAllianceProposalsForPair(pendingAllianceProposals, body.playerAId, body.playerBId);

  persistDatabase();
  broadcastState();
  writeJson(res, 200, {
    alliances: collectRelationPairs(state.players, "alliances"),
    wars: collectRelationPairs(state.players, "wars"),
  });
}

async function handleDeleteRelation(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res) || !ensurePlanningPhase(res)) {
    return;
  }

  const body = await readJsonBody<RelationRequest>(req);
  if (
    !body ||
    typeof body.playerAId !== "string" ||
    typeof body.playerBId !== "string" ||
    (body.type !== "WAR" && body.type !== "ALLIANCE")
  ) {
    writeJson(res, 400, { error: "Invalid relation payload" });
    return;
  }

  if (!state.players[body.playerAId] || !state.players[body.playerBId]) {
    writeJson(res, 404, { error: "Player not found" });
    return;
  }

  if (body.type === "WAR") {
    unlinkPlayers(state.players, "wars", body.playerAId, body.playerBId);
  } else {
    unlinkPlayers(state.players, "alliances", body.playerAId, body.playerBId);
  }

  clearAllianceProposalsForPair(pendingAllianceProposals, body.playerAId, body.playerBId);

  persistDatabase();
  broadcastState();
  writeJson(res, 200, {
    alliances: collectRelationPairs(state.players, "alliances"),
    wars: collectRelationPairs(state.players, "wars"),
  });
}

async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (path === "/api/login" && method === "POST") {
    await handleLogin(req, res);
    return;
  }

  if (path === "/api/me" && method === "GET") {
    handleMe(req, res);
    return;
  }

  if (path === "/api/state" && method === "GET") {
    handleState(req, res);
    return;
  }

  if (path === "/api/logout" && method === "POST") {
    handleLogout(req, res);
    return;
  }

  if (path === "/api/admin/players" && method === "GET") {
    handleListPlayers(req, res);
    return;
  }

  if (path === "/api/admin/players" && method === "POST") {
    await handleAddPlayer(req, res);
    return;
  }

  if (path === "/api/admin/factions" && method === "GET") {
    handleListFactions(req, res);
    return;
  }

  if (path === "/api/admin/factions" && method === "POST") {
    await handleAddFaction(req, res);
    return;
  }

  if (path === "/api/admin/planets" && method === "GET") {
    handleListPlanets(req, res);
    return;
  }

  if (path === "/api/admin/planets" && method === "POST") {
    await handleAddPlanet(req, res);
    return;
  }

  if (path === "/api/admin/fleets" && method === "GET") {
    handleListFleets(req, res);
    return;
  }

  if (path === "/api/admin/fleets" && method === "POST") {
    await handleAddFleet(req, res);
    return;
  }

  if (path === "/api/admin/relations" && method === "GET") {
    handleListRelations(req, res);
    return;
  }

  if (path === "/api/admin/relations" && method === "POST") {
    await handleAddRelation(req, res);
    return;
  }

  if (path === "/api/admin/relations" && method === "DELETE") {
    await handleDeleteRelation(req, res);
    return;
  }

  const factionMatch = path.match(/^\/api\/admin\/factions\/([^/]+)$/);
  if (factionMatch && method === "DELETE") {
    handleDeleteFaction(req, res, decodeURIComponent(factionMatch[1]));
    return;
  }

  if (factionMatch && method === "PUT") {
    await handleUpdateFaction(req, res, decodeURIComponent(factionMatch[1]));
    return;
  }

  const playerMatch = path.match(/^\/api\/admin\/players\/([^/]+)$/);
  if (playerMatch && method === "DELETE") {
    handleDeletePlayer(req, res, decodeURIComponent(playerMatch[1]));
    return;
  }

  if (playerMatch && method === "PUT") {
    await handleUpdatePlayer(req, res, decodeURIComponent(playerMatch[1]));
    return;
  }

  const planetMatch = path.match(/^\/api\/admin\/planets\/([^/]+)$/);
  if (planetMatch && method === "DELETE") {
    handleDeletePlanet(req, res, decodeURIComponent(planetMatch[1]));
    return;
  }

  if (planetMatch && method === "PUT") {
    await handleUpdatePlanet(req, res, decodeURIComponent(planetMatch[1]));
    return;
  }

  const fleetMatch = path.match(/^\/api\/admin\/fleets\/([^/]+)$/);
  if (fleetMatch && method === "DELETE") {
    handleDeleteFleet(req, res, decodeURIComponent(fleetMatch[1]));
    return;
  }

  if (fleetMatch && method === "PUT") {
    await handleUpdateFleet(req, res, decodeURIComponent(fleetMatch[1]));
    return;
  }

  writeJson(res, 404, { error: "Not found" });
}

const httpServer = createServer((req, res) => {
  void handleApiRequest(req, res);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  const session = getSessionByToken(token);

  if (!session) {
    socket.close(4401, "Unauthorized");
    return;
  }

  const context: ClientContext = {
    socket,
    session,
  };

  clients.set(socket, context);

  send(socket, {
    type: "stateUpdate",
    state: buildStateForSession(session, state),
  });

  socket.on("message", (raw: RawData) => {
    const message = parseClientMessage(raw);
    if (!message) {
      return;
    }

    applySubmitAction(context, message);
    applyRemoveAction(context, message);
    applyReady(context, message);
    applyEndTurn(context, message);
  });

  socket.on("close", () => {
    clients.delete(socket);
  });

  socket.on("error", () => {
    clients.delete(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] API + WS ready on http://localhost:${PORT}`);
  console.log(`[server] default admin: admin / admin123`);
  console.log(`[server] default player creds: p1/p1, p2/p2, p3/p3`);
});












