import "./admin.css";

import { PLANET_WORLD_TYPES, TITHE_LEVEL_ORDER } from "../../src/planetDomain";
import type {
  Faction,
  Fleet,
  FleetDomain,
  FleetStance,
  Planet,
  Player,
  ResourceStore,
} from "../../src/types";

interface SessionInfo {
  token: string;
  username: string;
  role: "admin" | "player";
  playerId?: string;
  expiresAt: number;
}

interface AdminPlayer extends Player {
  login: {
    username: string;
    password: string;
  } | null;
}

interface RelationPair {
  playerAId: string;
  playerBId: string;
}

interface AdminState {
  session: SessionInfo | null;
  players: AdminPlayer[];
  factions: Faction[];
  planets: Planet[];
  fleets: Fleet[];
  alliances: RelationPair[];
  wars: RelationPair[];
}

const SESSION_KEY = "hq_admin_session";

const params = new URLSearchParams(window.location.search);
const apiBase = params.get("api") ?? `http://${window.location.hostname}:8080`;

const statusLine = document.getElementById("statusLine") as HTMLParagraphElement;
const authLine = document.getElementById("authLine") as HTMLParagraphElement;
const eventsLog = document.getElementById("eventsLog") as HTMLPreElement;

const loginUser = document.getElementById("loginUser") as HTMLInputElement;
const loginPass = document.getElementById("loginPass") as HTMLInputElement;
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;

const adminPanel = document.getElementById("adminPanel") as HTMLElement;
const factionsPanel = document.getElementById("factionsPanel") as HTMLElement;
const planetsPanel = document.getElementById("planetsPanel") as HTMLElement;
const fleetsPanel = document.getElementById("fleetsPanel") as HTMLElement;
const relationsPanel = document.getElementById("relationsPanel") as HTMLElement;

const addPlayerId = document.getElementById("addPlayerId") as HTMLInputElement;
const addPlayerName = document.getElementById("addPlayerName") as HTMLInputElement;
const addPlayerUsername = document.getElementById("addPlayerUsername") as HTMLInputElement;
const addPlayerPassword = document.getElementById("addPlayerPassword") as HTMLInputElement;
const addPlayerAlignment = document.getElementById("addPlayerAlignment") as HTMLSelectElement;
const addPlayerFaction = document.getElementById("addPlayerFaction") as HTMLSelectElement;
const addPlayerBtn = document.getElementById("addPlayerBtn") as HTMLButtonElement;
const playersList = document.getElementById("playersList") as HTMLDivElement;

const addFactionId = document.getElementById("addFactionId") as HTMLInputElement;
const addFactionName = document.getElementById("addFactionName") as HTMLInputElement;
const addFactionDescription = document.getElementById("addFactionDescription") as HTMLInputElement;
const addFactionBtn = document.getElementById("addFactionBtn") as HTMLButtonElement;
const factionsList = document.getElementById("factionsList") as HTMLDivElement;

const addPlanetId = document.getElementById("addPlanetId") as HTMLInputElement;
const addPlanetQ = document.getElementById("addPlanetQ") as HTMLInputElement;
const addPlanetR = document.getElementById("addPlanetR") as HTMLInputElement;
const addPlanetWorldType = document.getElementById("addPlanetWorldType") as HTMLSelectElement;
const addPlanetWorldTags = document.getElementById("addPlanetWorldTags") as HTMLInputElement;
const addPlanetPopulation = document.getElementById("addPlanetPopulation") as HTMLInputElement;
const addPlanetMorale = document.getElementById("addPlanetMorale") as HTMLInputElement;
const addPlanetTitheLevel = document.getElementById("addPlanetTitheLevel") as HTMLSelectElement;
const addPlanetTithePaid = document.getElementById("addPlanetTithePaid") as HTMLInputElement;
const addPlanetInf = document.getElementById("addPlanetInf") as HTMLInputElement;
const addPlanetVision = document.getElementById("addPlanetVision") as HTMLInputElement;
const addPlanetOverview = document.getElementById("addPlanetOverview") as HTMLInputElement;
const addPlanetBtn = document.getElementById("addPlanetBtn") as HTMLButtonElement;
const planetsList = document.getElementById("planetsList") as HTMLDivElement;

const addFleetId = document.getElementById("addFleetId") as HTMLInputElement;
const addFleetOwner = document.getElementById("addFleetOwner") as HTMLSelectElement;
const addFleetQ = document.getElementById("addFleetQ") as HTMLInputElement;
const addFleetR = document.getElementById("addFleetR") as HTMLInputElement;
const addFleetPower = document.getElementById("addFleetPower") as HTMLInputElement;
const addFleetHealth = document.getElementById("addFleetHealth") as HTMLInputElement;
const addFleetInfluence = document.getElementById("addFleetInfluence") as HTMLInputElement;
const addFleetAp = document.getElementById("addFleetAp") as HTMLInputElement;
const addFleetVision = document.getElementById("addFleetVision") as HTMLInputElement;
const addFleetCapacity = document.getElementById("addFleetCapacity") as HTMLInputElement;
const addFleetStance = document.getElementById("addFleetStance") as HTMLSelectElement;
const addFleetDomain = document.getElementById("addFleetDomain") as HTMLSelectElement;
const addFleetInventory = document.getElementById("addFleetInventory") as HTMLInputElement;
const addFleetBtn = document.getElementById("addFleetBtn") as HTMLButtonElement;
const fleetsList = document.getElementById("fleetsList") as HTMLDivElement;

const relType = document.getElementById("relType") as HTMLSelectElement;
const relPlayerA = document.getElementById("relPlayerA") as HTMLSelectElement;
const relPlayerB = document.getElementById("relPlayerB") as HTMLSelectElement;
const addRelationBtn = document.getElementById("addRelationBtn") as HTMLButtonElement;
const removeRelationBtn = document.getElementById("removeRelationBtn") as HTMLButtonElement;
const alliancesList = document.getElementById("alliancesList") as HTMLUListElement;
const warsList = document.getElementById("warsList") as HTMLUListElement;

const runtime: AdminState = {
  session: null,
  players: [],
  factions: [],
  planets: [],
  fleets: [],
  alliances: [],
  wars: [],
};

function setPanelsVisible(visible: boolean): void {
  for (const panel of [adminPanel, factionsPanel, planetsPanel, fleetsPanel, relationsPanel]) {
    panel.classList.toggle("hidden", !visible);
  }
}

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function appendEvent(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  eventsLog.textContent = `${line}\n${eventsLog.textContent}`.trim();
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
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return body;
}

function setSession(session: SessionInfo | null): void {
  runtime.session = session;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    authLine.textContent = `Logged as ${session.username} (${session.role})`;
    setPanelsVisible(true);
  } else {
    localStorage.removeItem(SESSION_KEY);
    authLine.textContent = "Not logged in";
    setPanelsVisible(false);
    runtime.players = [];
    runtime.factions = [];
    runtime.planets = [];
    runtime.fleets = [];
    runtime.alliances = [];
    runtime.wars = [];
    renderAll();
  }
}

function createInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.value = value;
  return input;
}

function createNumberInput(value: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  return input;
}

function createSelect(value: string, options: string[]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    if (optionValue === value) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  return select;
}

function createLabeledField(labelText: string, control: HTMLElement): HTMLDivElement {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}

function createActionButton(label: string, className?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) {
    button.className = className;
  }
  return button;
}

function parseJsonObjectInput(value: string): Record<string, number> | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object");
  }

  const result: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      throw new Error(`Value for ${key} must be a number`);
    }

    result[key] = Math.trunc(rawValue);
  }

  return result;
}

function parseCommaTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim().toUpperCase())
    .filter(Boolean);
}

function toJsonCompact(value: unknown): string {
  const json = JSON.stringify(value);
  return json === "{}" ? "" : json;
}

function populateSelect(select: HTMLSelectElement, values: string[]): void {
  select.innerHTML = "";
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function initStaticSelects(): void {
  populateSelect(addPlanetWorldType, [...PLANET_WORLD_TYPES]);
  populateSelect(addPlanetTitheLevel, [...TITHE_LEVEL_ORDER]);
}

function sortedFactions(): Faction[] {
  return [...runtime.factions].sort((a, b) => a.id.localeCompare(b.id));
}

function factionNameById(factionId: string): string {
  return runtime.factions.find((faction) => faction.id === factionId)?.name ?? factionId;
}

function buildFactionSelect(selectedFactionId: string): HTMLSelectElement {
  const options = sortedFactions().map((faction) => faction.id);
  if (selectedFactionId && !options.includes(selectedFactionId)) {
    options.unshift(selectedFactionId);
  }

  if (options.length === 0) {
    options.push("");
  }

  const select = createSelect(selectedFactionId, options);
  return select;
}

function syncAddPlayerFactionSelect(): void {
  const prev = addPlayerFaction.value;
  addPlayerFaction.innerHTML = "";

  const options = sortedFactions().map((faction) => faction.id);
  if (options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "(no factions)";
    addPlayerFaction.appendChild(option);
    addPlayerFaction.disabled = true;
    return;
  }

  addPlayerFaction.disabled = false;
  for (const id of options) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${id} - ${factionNameById(id)}`;
    if (id === prev) {
      option.selected = true;
    }
    addPlayerFaction.appendChild(option);
  }

  if (!options.includes(prev)) {
    addPlayerFaction.value = options[0];
  }
}

function sortedPlayers(): AdminPlayer[] {
  return [...runtime.players].sort((a, b) => a.id.localeCompare(b.id));
}

function playerNameById(playerId: string): string {
  return runtime.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function populatePlayerIdSelect(select: HTMLSelectElement, preferredPlayerId: string): void {
  select.innerHTML = "";

  const playerIds = sortedPlayers().map((player) => player.id);
  if (
    preferredPlayerId &&
    !playerIds.includes(preferredPlayerId)
  ) {
    playerIds.unshift(preferredPlayerId);
  }

  if (playerIds.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "(no players)";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const playerId of playerIds) {
    const option = document.createElement("option");
    option.value = playerId;
    option.textContent = `${playerId} - ${playerNameById(playerId)}`;
    if (playerId === preferredPlayerId) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  if (!playerIds.includes(preferredPlayerId)) {
    select.value = playerIds[0];
  }
}

function buildPlayerSelect(selectedPlayerId: string): HTMLSelectElement {
  const select = document.createElement("select");
  populatePlayerIdSelect(select, selectedPlayerId);
  return select;
}

function syncPlayerIdSelects(): void {
  const prevFleetOwner = addFleetOwner.value;
  const prevRelationA = relPlayerA.value;
  const prevRelationB = relPlayerB.value;

  populatePlayerIdSelect(addFleetOwner, prevFleetOwner);
  populatePlayerIdSelect(relPlayerA, prevRelationA);
  populatePlayerIdSelect(relPlayerB, prevRelationB);

  if (relPlayerA.disabled || relPlayerB.disabled) {
    return;
  }

  if (relPlayerA.value === relPlayerB.value) {
    const next = Array.from(relPlayerB.options).find(
      (option) => option.value !== relPlayerA.value,
    );
    if (next) {
      relPlayerB.value = next.value;
    }
  }
}

async function loadAllData(): Promise<void> {
  if (!runtime.session) {
    return;
  }

  const [playersResp, factionsResp, planetsResp, fleetsResp, relationsResp] = await Promise.all([
    apiRequest<{ players: AdminPlayer[] }>("/api/admin/players", { method: "GET" }),
    apiRequest<{ factions: Faction[] }>("/api/admin/factions", { method: "GET" }),
    apiRequest<{ planets: Planet[] }>("/api/admin/planets", { method: "GET" }),
    apiRequest<{ fleets: Fleet[] }>("/api/admin/fleets", { method: "GET" }),
    apiRequest<{ alliances: RelationPair[]; wars: RelationPair[] }>("/api/admin/relations", {
      method: "GET",
    }),
  ]);

  runtime.players = playersResp.players;
  runtime.factions = factionsResp.factions;
  runtime.planets = planetsResp.planets;
  runtime.fleets = fleetsResp.fleets;
  runtime.alliances = relationsResp.alliances;
  runtime.wars = relationsResp.wars;

  renderAll();
}

function renderRelationsLists(): void {
  alliancesList.innerHTML = "";
  warsList.innerHTML = "";

  if (runtime.alliances.length === 0) {
    const li = document.createElement("li");
    li.textContent = "none";
    alliancesList.appendChild(li);
  }

  if (runtime.wars.length === 0) {
    const li = document.createElement("li");
    li.textContent = "none";
    warsList.appendChild(li);
  }

  for (const pair of runtime.alliances) {
    const li = document.createElement("li");
    li.textContent = `${pair.playerAId} <-> ${pair.playerBId}`;
    alliancesList.appendChild(li);
  }

  for (const pair of runtime.wars) {
    const li = document.createElement("li");
    li.textContent = `${pair.playerAId} vs ${pair.playerBId}`;
    warsList.appendChild(li);
  }
}

function renderPlayers(): void {
  playersList.innerHTML = "";

  for (const player of runtime.players) {
    const item = document.createElement("div");
    item.className = "item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${player.id} (${player.name}) [${player.factionId}]`;
    item.appendChild(title);

    const nameInput = createInput(player.name);
    const resourcesInput = createNumberInput(player.resources);
    const usernameInput = createInput(player.login?.username ?? "");
    const passwordInput = createInput(player.login?.password ?? "");
    const alignmentSelect = createSelect(player.alignment, [
      "NON_IMPERIAL",
      "IMPERIAL",
    ]);
    const factionSelect = buildFactionSelect(player.factionId);

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Name", nameInput),
      createLabeledField("Resources", resourcesInput),
      createLabeledField("Alignment", alignmentSelect),
      createLabeledField("Faction", factionSelect),
      createLabeledField("Username", usernameInput),
      createLabeledField("Password", passwordInput),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/players/${encodeURIComponent(player.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              name: nameInput.value,
              resources: Number(resourcesInput.value),
              alignment: alignmentSelect.value,
              factionId: factionSelect.value,
              username: usernameInput.value.trim() || undefined,
              password: passwordInput.value || undefined,
            }),
          });
          appendEvent(`Player ${player.id} updated`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Player update failed: ${(error as Error).message}`);
        }
      })();
    });

    const deleteBtn = createActionButton("Delete", "danger");
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/players/${encodeURIComponent(player.id)}`, {
            method: "DELETE",
          });
          appendEvent(`Player ${player.id} deleted`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Player delete failed: ${(error as Error).message}`);
        }
      })();
    });

    actions.append(updateBtn, deleteBtn);
    item.appendChild(actions);

    playersList.appendChild(item);
  }
}

function renderFactions(): void {
  factionsList.innerHTML = "";

  for (const faction of sortedFactions()) {
    const item = document.createElement("div");
    item.className = "item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${faction.id} (${faction.name})`;
    item.appendChild(title);

    const nameInput = createInput(faction.name);
    const descriptionInput = createInput(faction.description ?? "");

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Name", nameInput),
      createLabeledField("Description", descriptionInput),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/factions/${encodeURIComponent(faction.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              name: nameInput.value,
              description: descriptionInput.value,
            }),
          });
          appendEvent(`Faction ${faction.id} updated`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Faction update failed: ${(error as Error).message}`);
        }
      })();
    });

    const deleteBtn = createActionButton("Delete", "danger");
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/factions/${encodeURIComponent(faction.id)}`, {
            method: "DELETE",
          });
          appendEvent(`Faction ${faction.id} deleted`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Faction delete failed: ${(error as Error).message}`);
        }
      })();
    });

    actions.append(updateBtn, deleteBtn);
    item.appendChild(actions);

    factionsList.appendChild(item);
  }
}
function renderPlanets(): void {
  planetsList.innerHTML = "";

  for (const planet of runtime.planets) {
    const item = document.createElement("div");
    item.className = "item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${planet.id} [${planet.position.q},${planet.position.r}] ${planet.worldType}`;
    item.appendChild(title);

    const qInput = createNumberInput(planet.position.q);
    const rInput = createNumberInput(planet.position.r);
    const worldTypeSelect = createSelect(planet.worldType, [...PLANET_WORLD_TYPES]);
    const worldTagsInput = createInput(planet.worldTags.join(","));
    const populationInput = createNumberInput(planet.population);
    const moraleInput = createNumberInput(planet.morale);
    const titheLevelSelect = createSelect(planet.titheLevel, [...TITHE_LEVEL_ORDER]);
    const tithePaidInput = createNumberInput(planet.tithePaid);
    const infInput = createNumberInput(planet.influenceValue);
    const visionInput = createNumberInput(planet.visionRange);
    const overviewInput = createNumberInput(planet.overviewRange);
    const rawStockInput = createInput(toJsonCompact(planet.rawStock));
    const productStorageInput = createInput(toJsonCompact(planet.productStorage));
    const infoFragmentsInput = createInput(toJsonCompact(planet.infoFragments));

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Q", qInput),
      createLabeledField("R", rInput),
      createLabeledField("World Type", worldTypeSelect),
      createLabeledField("World Tags", worldTagsInput),
      createLabeledField("Population", populationInput),
      createLabeledField("Morale", moraleInput),
      createLabeledField("Tithe Level", titheLevelSelect),
      createLabeledField("Tithe Paid", tithePaidInput),
      createLabeledField("Influence", infInput),
      createLabeledField("Vision", visionInput),
      createLabeledField("Overview", overviewInput),
      createLabeledField("Raw Stock JSON", rawStockInput),
      createLabeledField("Product Storage JSON", productStorageInput),
      createLabeledField("Info Fragments JSON", infoFragmentsInput),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          const rawStock = parseJsonObjectInput(rawStockInput.value);
          const productStorage = parseJsonObjectInput(productStorageInput.value);
          const infoFragments = parseJsonObjectInput(infoFragmentsInput.value);

          await apiRequest(`/api/admin/planets/${encodeURIComponent(planet.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              q: Number(qInput.value),
              r: Number(rInput.value),
              worldType: worldTypeSelect.value,
              worldTags: parseCommaTags(worldTagsInput.value),
              population: Number(populationInput.value),
              morale: Number(moraleInput.value),
              titheLevel: titheLevelSelect.value,
              tithePaid: Number(tithePaidInput.value),
              influenceValue: Number(infInput.value),
              visionRange: Number(visionInput.value),
              overviewRange: Number(overviewInput.value),
              rawStock,
              productStorage,
              infoFragments,
            }),
          });
          appendEvent(`Planet ${planet.id} updated`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Planet update failed: ${(error as Error).message}`);
        }
      })();
    });

    const deleteBtn = createActionButton("Delete", "danger");
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/planets/${encodeURIComponent(planet.id)}`, {
            method: "DELETE",
          });
          appendEvent(`Planet ${planet.id} deleted`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Planet delete failed: ${(error as Error).message}`);
        }
      })();
    });

    actions.append(updateBtn, deleteBtn);
    item.appendChild(actions);

    planetsList.appendChild(item);
  }
}

function renderFleets(): void {
  fleetsList.innerHTML = "";

  for (const fleet of runtime.fleets) {
    const item = document.createElement("div");
    item.className = "item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${fleet.id} (${fleet.ownerPlayerId}) [${fleet.position.q},${fleet.position.r}]`;
    item.appendChild(title);

    const ownerSelect = buildPlayerSelect(fleet.ownerPlayerId);
    const qInput = createNumberInput(fleet.position.q);
    const rInput = createNumberInput(fleet.position.r);
    const powerInput = createNumberInput(fleet.combatPower);
    const healthInput = createNumberInput(fleet.health);
    const influenceInput = createNumberInput(fleet.influence);
    const apInput = createNumberInput(fleet.actionPoints);
    const visionInput = createNumberInput(fleet.visionRange);
    const capacityInput = createNumberInput(fleet.capacity);

    const stanceSelect = createSelect(fleet.stance, ["ATTACK", "DEFENSE"]);
    const domainSelect = createSelect(fleet.domain as FleetDomain, ["SPACE", "GROUND"]);
    const inventoryInput = createInput(toJsonCompact(fleet.inventory));

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Owner Player ID", ownerSelect),
      createLabeledField("Q", qInput),
      createLabeledField("R", rInput),
      createLabeledField("Combat Power", powerInput),
      createLabeledField("Health", healthInput),
      createLabeledField("Influence", influenceInput),
      createLabeledField("Action Points", apInput),
      createLabeledField("Vision Range", visionInput),
      createLabeledField("Capacity", capacityInput),
      createLabeledField("Stance", stanceSelect),
      createLabeledField("Domain", domainSelect),
      createLabeledField("Inventory JSON", inventoryInput),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          const inventory = parseJsonObjectInput(inventoryInput.value);

          await apiRequest(`/api/admin/fleets/${encodeURIComponent(fleet.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              ownerPlayerId: ownerSelect.value,
              q: Number(qInput.value),
              r: Number(rInput.value),
              combatPower: Number(powerInput.value),
              health: Number(healthInput.value),
              influence: Number(influenceInput.value),
              actionPoints: Number(apInput.value),
              visionRange: Number(visionInput.value),
              capacity: Number(capacityInput.value),
              stance: stanceSelect.value as FleetStance,
              domain: domainSelect.value as FleetDomain,
              inventory,
            }),
          });
          appendEvent(`Fleet ${fleet.id} updated`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Fleet update failed: ${(error as Error).message}`);
        }
      })();
    });

    const deleteBtn = createActionButton("Delete", "danger");
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/fleets/${encodeURIComponent(fleet.id)}`, {
            method: "DELETE",
          });
          appendEvent(`Fleet ${fleet.id} deleted`);
          await loadAllData();
        } catch (error) {
          appendEvent(`Fleet delete failed: ${(error as Error).message}`);
        }
      })();
    });

    actions.append(updateBtn, deleteBtn);
    item.appendChild(actions);

    fleetsList.appendChild(item);
  }
}

function renderAll(): void {
  syncAddPlayerFactionSelect();
  syncPlayerIdSelects();
  renderPlayers();
  renderFactions();
  renderPlanets();
  renderFleets();
  renderRelationsLists();
}

async function addPlayer(): Promise<void> {
  try {
    await apiRequest("/api/admin/players", {
      method: "POST",
      body: JSON.stringify({
        id: addPlayerId.value.trim(),
        name: addPlayerName.value.trim(),
        alignment: addPlayerAlignment.value,
        factionId: addPlayerFaction.value || undefined,
        username: addPlayerUsername.value.trim() || undefined,
        password: addPlayerPassword.value || undefined,
      }),
    });
    appendEvent(`Player ${addPlayerId.value.trim()} created`);
    await loadAllData();
  } catch (error) {
    appendEvent(`Player create failed: ${(error as Error).message}`);
  }
}

async function addFaction(): Promise<void> {
  try {
    await apiRequest("/api/admin/factions", {
      method: "POST",
      body: JSON.stringify({
        id: addFactionId.value.trim(),
        name: addFactionName.value.trim(),
        description: addFactionDescription.value.trim() || undefined,
      }),
    });
    appendEvent(`Faction ${addFactionId.value.trim()} created`);
    await loadAllData();
  } catch (error) {
    appendEvent(`Faction create failed: ${(error as Error).message}`);
  }
}

async function addPlanet(): Promise<void> {
  try {
    await apiRequest("/api/admin/planets", {
      method: "POST",
      body: JSON.stringify({
        id: addPlanetId.value.trim(),
        q: Number(addPlanetQ.value),
        r: Number(addPlanetR.value),
        worldType: addPlanetWorldType.value,
        worldTags: parseCommaTags(addPlanetWorldTags.value),
        population: Number(addPlanetPopulation.value),
        morale: Number(addPlanetMorale.value),
        titheLevel: addPlanetTitheLevel.value,
        tithePaid: Number(addPlanetTithePaid.value),
        influenceValue: Number(addPlanetInf.value),
        visionRange: Number(addPlanetVision.value || "1"),
        overviewRange: Number(addPlanetOverview.value || "1"),
      }),
    });
    appendEvent(`Planet ${addPlanetId.value.trim()} created`);
    await loadAllData();
  } catch (error) {
    appendEvent(`Planet create failed: ${(error as Error).message}`);
  }
}

async function addFleet(): Promise<void> {
  try {
    if (!addFleetOwner.value) {
      throw new Error("Owner player is required");
    }

    const inventory = parseJsonObjectInput(addFleetInventory.value);

    await apiRequest("/api/admin/fleets", {
      method: "POST",
      body: JSON.stringify({
        id: addFleetId.value.trim(),
        ownerPlayerId: addFleetOwner.value,
        q: Number(addFleetQ.value),
        r: Number(addFleetR.value),
        combatPower: Number(addFleetPower.value),
        health: Number(addFleetHealth.value),
        influence: Number(addFleetInfluence.value),
        actionPoints: Number(addFleetAp.value),
        visionRange: Number(addFleetVision.value),
        capacity: Number(addFleetCapacity.value),
        stance: addFleetStance.value,
        domain: addFleetDomain.value,
        inventory,
      }),
    });
    appendEvent(`Fleet ${addFleetId.value.trim()} created`);
    await loadAllData();
  } catch (error) {
    appendEvent(`Fleet create failed: ${(error as Error).message}`);
  }
}

async function mutateRelation(remove: boolean): Promise<void> {
  if (!relPlayerA.value || !relPlayerB.value) {
    appendEvent("Relation mutation failed: player ids are required");
    return;
  }

  const payload = {
    type: relType.value,
    playerAId: relPlayerA.value,
    playerBId: relPlayerB.value,
  };

  try {
    await apiRequest("/api/admin/relations", {
      method: remove ? "DELETE" : "POST",
      body: JSON.stringify(payload),
    });
    appendEvent(
      `Relation ${remove ? "removed" : "added"}: ${payload.playerAId}/${payload.playerBId} ${payload.type}`,
    );
    await loadAllData();
  } catch (error) {
    appendEvent(`Relation mutation failed: ${(error as Error).message}`);
  }
}

async function login(): Promise<void> {
  const username = loginUser.value.trim();
  const password = loginPass.value;
  if (!username || !password) {
    setStatus("Enter username/password");
    return;
  }

  try {
    const session = await apiRequest<SessionInfo>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    if (session.role !== "admin") {
      throw new Error("Account is not admin");
    }

    setSession(session);
    setStatus(`Connected to ${apiBase}`);
    await loadAllData();
  } catch (error) {
    setStatus(`Login failed: ${(error as Error).message}`);
  }
}

async function logout(): Promise<void> {
  try {
    if (runtime.session) {
      await apiRequest("/api/logout", { method: "POST" });
    }
  } catch {
    // ignore transport errors
  }

  setSession(null);
  setStatus("Not authenticated");
}

async function restoreSession(): Promise<void> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return;
  }

  try {
    const session = JSON.parse(raw) as SessionInfo;
    runtime.session = session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  try {
    const me = await apiRequest<Omit<SessionInfo, "token">>("/api/me", {
      method: "GET",
    });

    if (me.role !== "admin") {
      throw new Error("Session is not admin");
    }

    setSession({
      token: runtime.session.token,
      username: me.username,
      role: me.role,
      playerId: me.playerId,
      expiresAt: me.expiresAt,
    });

    await loadAllData();
    setStatus(`Connected to ${apiBase}`);
  } catch {
    setSession(null);
  }
}

loginBtn.addEventListener("click", () => {
  void login();
});

logoutBtn.addEventListener("click", () => {
  void logout();
});

addPlayerBtn.addEventListener("click", () => {
  void addPlayer();
});

addFactionBtn.addEventListener("click", () => {
  void addFaction();
});

addPlanetBtn.addEventListener("click", () => {
  void addPlanet();
});

addFleetBtn.addEventListener("click", () => {
  void addFleet();
});

addRelationBtn.addEventListener("click", () => {
  void mutateRelation(false);
});

removeRelationBtn.addEventListener("click", () => {
  void mutateRelation(true);
});

initStaticSelects();
setPanelsVisible(false);
renderAll();
void restoreSession();




