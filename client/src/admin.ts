import "./admin.css";

import {
  PLANET_TAGS,
  PLANET_WORLD_TYPES,
  DEFAULT_PRODUCT_CONVERSION_RATES,
  PRODUCT_RESOURCE_KEYS,
  PRODUCT_RECIPES,
  RAW_RESOURCE_KEYS,
  roundConversionRate,
  TITHE_LEVEL_ORDER,
} from "../../src/planetDomain";
import type { ProductConversionRates } from "../../src/planetDomain";
import { defaultPlayerColor } from "../../src/utils/playerColor";
import type {
  Faction,
  Fleet,
  FleetDomain,
  FleetStance,
  Planet,
  Player,
  PlayerProductStorages,
  ResourceStore,
} from "../../src/types";

interface SessionInfo {
  username: string;
  role: "admin" | "player";
  playerId?: string;
  expiresAt: number;
}

interface AdminPlayer extends Player {
  login: {
    username: string;
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
  productConversionRates: ProductConversionRates;
}

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
const armiesPanel = document.getElementById("armiesPanel") as HTMLElement;
const relationsPanel = document.getElementById("relationsPanel") as HTMLElement;
const resourceConversionPanel = document.getElementById("resourceConversionPanel") as HTMLElement;
const resourceConversionRates = document.getElementById("resourceConversionRates") as HTMLDivElement;
const saveResourceConversionBtn = document.getElementById("saveResourceConversionBtn") as HTMLButtonElement;

const addPlayerId = document.getElementById("addPlayerId") as HTMLInputElement;
const addPlayerName = document.getElementById("addPlayerName") as HTMLInputElement;
const addPlayerColor = document.getElementById("addPlayerColor") as HTMLInputElement;
const addPlayerUsername = document.getElementById("addPlayerUsername") as HTMLInputElement;
const addPlayerPassword = document.getElementById("addPlayerPassword") as HTMLInputElement;
const addPlayerAlignment = document.getElementById("addPlayerAlignment") as HTMLSelectElement;
const addPlayerFaction = document.getElementById("addPlayerFaction") as HTMLSelectElement;
const addPlayerCanTakeResources = document.getElementById("addPlayerCanTakeResources") as HTMLInputElement;
const addPlayerBtn = document.getElementById("addPlayerBtn") as HTMLButtonElement;
const playersSearch = document.getElementById("playersSearch") as HTMLInputElement;
const playersList = document.getElementById("playersList") as HTMLDivElement;

const addFactionId = document.getElementById("addFactionId") as HTMLInputElement;
const addFactionName = document.getElementById("addFactionName") as HTMLInputElement;
const addFactionDescription = document.getElementById("addFactionDescription") as HTMLInputElement;
const addFactionBtn = document.getElementById("addFactionBtn") as HTMLButtonElement;
const factionsSearch = document.getElementById("factionsSearch") as HTMLInputElement;
const factionsList = document.getElementById("factionsList") as HTMLDivElement;

const addPlanetId = document.getElementById("addPlanetId") as HTMLInputElement;
const addPlanetName = document.getElementById("addPlanetName") as HTMLInputElement;
const addPlanetQ = document.getElementById("addPlanetQ") as HTMLInputElement;
const addPlanetR = document.getElementById("addPlanetR") as HTMLInputElement;
const addPlanetWorldType = document.getElementById("addPlanetWorldType") as HTMLSelectElement;
const addPlanetWorldTags = document.getElementById("addPlanetWorldTags") as HTMLDivElement;
const addPlanetPopulation = document.getElementById("addPlanetPopulation") as HTMLInputElement;
const addPlanetMorale = document.getElementById("addPlanetMorale") as HTMLInputElement;
const addPlanetTitheLevel = document.getElementById("addPlanetTitheLevel") as HTMLSelectElement;
const addPlanetMaxTitheLevel = document.getElementById("addPlanetMaxTitheLevel") as HTMLSelectElement;
const addPlanetTithePaid = document.getElementById("addPlanetTithePaid") as HTMLInputElement;
const addPlanetInf = document.getElementById("addPlanetInf") as HTMLInputElement;
const addPlanetVision = document.getElementById("addPlanetVision") as HTMLInputElement;
const addPlanetOverview = document.getElementById("addPlanetOverview") as HTMLInputElement;
const addPlanetGeneration = document.getElementById("addPlanetGeneration") as HTMLDivElement;
const addPlanetRawStock = document.getElementById("addPlanetRawStock") as HTMLDivElement;
const addPlanetBtn = document.getElementById("addPlanetBtn") as HTMLButtonElement;
const planetsSearch = document.getElementById("planetsSearch") as HTMLInputElement;
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
const addFleetInventory = document.getElementById("addFleetInventory") as HTMLInputElement;
const addFleetBtn = document.getElementById("addFleetBtn") as HTMLButtonElement;
const addArmyBtn = document.getElementById("addArmyBtn") as HTMLButtonElement;
const addArmyOwner = document.getElementById("addArmyOwner") as HTMLSelectElement;
const addArmyDestinationKind = document.getElementById("addArmyDestinationKind") as HTMLSelectElement;
const addArmyDestination = document.getElementById("addArmyDestination") as HTMLSelectElement;
const addArmyPower = document.getElementById("addArmyPower") as HTMLInputElement;
const addArmyHealth = document.getElementById("addArmyHealth") as HTMLInputElement;
const addArmyInfluence = document.getElementById("addArmyInfluence") as HTMLInputElement;
const addArmyVision = document.getElementById("addArmyVision") as HTMLInputElement;
const addArmyStance = document.getElementById("addArmyStance") as HTMLSelectElement;
const fleetsSearch = document.getElementById("fleetsSearch") as HTMLInputElement;
const fleetsList = document.getElementById("fleetsList") as HTMLDivElement;
const armiesSearch = document.getElementById("armiesSearch") as HTMLInputElement;
const armiesList = document.getElementById("armiesList") as HTMLDivElement;

const relType = document.getElementById("relType") as HTMLSelectElement;
const relPlayerA = document.getElementById("relPlayerA") as HTMLSelectElement;
const relPlayerB = document.getElementById("relPlayerB") as HTMLSelectElement;
const addRelationBtn = document.getElementById("addRelationBtn") as HTMLButtonElement;
const removeRelationBtn = document.getElementById("removeRelationBtn") as HTMLButtonElement;
const relationsSearch = document.getElementById("relationsSearch") as HTMLInputElement;
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
  productConversionRates: { ...DEFAULT_PRODUCT_CONVERSION_RATES },
};

function setPanelsVisible(visible: boolean): void {
  for (const panel of [
    adminPanel,
    factionsPanel,
    planetsPanel,
    fleetsPanel,
    armiesPanel,
    relationsPanel,
    resourceConversionPanel,
  ]) {
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
  return {
    "Content-Type": "application/json",
  };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
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
    authLine.textContent = `Logged as ${session.username} (${session.role})`;
    setPanelsVisible(true);
  } else {
    authLine.textContent = "Not logged in";
    setPanelsVisible(false);
    runtime.players = [];
    runtime.factions = [];
    runtime.planets = [];
    runtime.fleets = [];
    runtime.alliances = [];
    runtime.wars = [];
    runtime.productConversionRates = { ...DEFAULT_PRODUCT_CONVERSION_RATES };
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

function createChipSelector(options: readonly string[], selected: readonly string[]): HTMLDivElement {
  const selector = document.createElement("div");
  selector.className = "chip-selector";
  selector.role = "group";
  const selectedSet = new Set(selected);
  for (const value of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-toggle";
    chip.dataset.value = value;
    chip.textContent = value;
    const isSelected = selectedSet.has(value);
    chip.classList.toggle("is-selected", isSelected);
    chip.setAttribute("aria-pressed", String(isSelected));
    chip.addEventListener("click", () => {
      const nextSelected = !chip.classList.contains("is-selected");
      chip.classList.toggle("is-selected", nextSelected);
      chip.setAttribute("aria-pressed", String(nextSelected));
    });
    selector.append(chip);
  }
  return selector;
}

function selectedChipValues(selector: HTMLElement): string[] {
  return Array.from(
    selector.querySelectorAll<HTMLElement>(".chip-toggle.is-selected"),
    (chip) => chip.dataset.value!,
  );
}

function createResourceEditor(
  keys: readonly string[],
  store: ResourceStore,
): HTMLDivElement {
  const editor = document.createElement("div");
  editor.className = "resource-editor";
  for (const key of keys) {
    const row = document.createElement("div");
    row.className = "resource-editor-row";
    const label = document.createElement("label");
    label.textContent = key;
    const input = createNumberInput(store[key] ?? 0);
    input.value = Number(store[key] ?? 0).toFixed(2);
    input.min = "0";
    input.step = "0.01";
    input.dataset.resourceKey = key;
    row.append(label, input);
    editor.append(row);
  }
  return editor;
}

function readResourceEditor(editor: HTMLElement): ResourceStore {
  const store: ResourceStore = {};
  for (const input of editor.querySelectorAll<HTMLInputElement>("input[data-resource-key]")) {
    const amount = Math.max(0, Math.round((Number(input.value) || 0) * 100) / 100);
    if (amount > 0) store[input.dataset.resourceKey!] = amount;
  }
  return store;
}

function createPlayerProductStorageEditor(
  players: readonly AdminPlayer[],
  storages: PlayerProductStorages,
): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "player-product-storages";
  for (const player of [...players].sort((a, b) => a.id - b.id)) {
    const section = document.createElement("section");
    section.className = "player-product-storage";
    section.dataset.playerProductStorage = String(player.id);
    const title = document.createElement("h3");
    title.textContent = `Player ${player.id}: ${player.name}`;
    section.append(
      title,
      createResourceEditor(
        PRODUCT_RESOURCE_KEYS,
        storages[String(player.id)] ?? {},
      ),
    );
    container.append(section);
  }
  return container;
}

function readPlayerProductStorages(editor: HTMLElement): PlayerProductStorages {
  const storages: PlayerProductStorages = {};
  for (const section of editor.querySelectorAll<HTMLElement>("[data-player-product-storage]")) {
    const playerId = section.dataset.playerProductStorage;
    const resourceEditor = section.querySelector<HTMLElement>(".resource-editor");
    if (!playerId || !resourceEditor) continue;
    storages[playerId] = readResourceEditor(resourceEditor);
  }
  return storages;
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

function toJsonCompact(value: unknown): string {
  const json = JSON.stringify(value);
  return json === "{}" ? "" : json;
}

function matchesSearch(haystack: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  return haystack.toLowerCase().includes(trimmed);
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
  addPlanetWorldTags.replaceChildren(
    ...createChipSelector(PLANET_TAGS, []).children,
  );
  addPlanetGeneration.replaceChildren(
    ...createChipSelector(RAW_RESOURCE_KEYS, []).children,
  );
  populateSelect(addPlanetTitheLevel, [...TITHE_LEVEL_ORDER]);
  addPlanetTitheLevel.value = "ADEPTUS_NON";
  addPlanetTitheLevel.disabled = true;
  addPlanetTithePaid.disabled = true;
  populateSelect(addPlanetMaxTitheLevel, [...TITHE_LEVEL_ORDER]);
  addPlanetRawStock.replaceChildren(...createResourceEditor(RAW_RESOURCE_KEYS, {}).children);
}

function sortedFactions(): Faction[] {
  return [...runtime.factions].sort((a, b) => a.id - b.id);
}

function factionNameById(factionId: number): string {
  return runtime.factions.find((faction) => faction.id === factionId)?.name ?? String(factionId);
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
  return [...runtime.players].sort((a, b) => a.id - b.id);
}

function playerNameById(playerId: number): string {
  return runtime.players.find((player) => player.id === playerId)?.name ?? String(playerId);
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
  populatePlayerIdSelect(addArmyOwner, addArmyOwner.value);
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

function syncArmyDestinations(): void {
  const previous = addArmyDestination.value;
  addArmyDestination.innerHTML = "";
  const isPlanet = addArmyDestinationKind.value === "PLANET";
  const destinations = isPlanet
    ? runtime.planets.map((planet) => ({
        id: planet.id,
        label: `${planet.id} — ${planet.worldType} [${planet.position.q},${planet.position.r}]`,
      }))
    : runtime.fleets
        .filter((fleet) => fleet.domain === "SPACE")
        .map((fleet) => ({
          id: fleet.id,
          label: `${fleet.id} — ${playerNameById(fleet.ownerPlayerId)} [${fleet.position.q},${fleet.position.r}]`,
        }));

  for (const destination of destinations) {
    const option = document.createElement("option");
    option.value = String(destination.id);
    option.textContent = destination.label;
    addArmyDestination.appendChild(option);
  }
  addArmyDestination.disabled = destinations.length === 0;
  addArmyBtn.disabled = destinations.length === 0 || addArmyOwner.disabled;
  if (destinations.some((destination) => String(destination.id) === previous)) {
    addArmyDestination.value = previous;
  }
}

async function loadAllData(): Promise<void> {
  if (!runtime.session) {
    return;
  }

  const [
    playersResp,
    factionsResp,
    planetsResp,
    fleetsResp,
    relationsResp,
    conversionResp,
  ] = await Promise.all([
    apiRequest<{ players: AdminPlayer[] }>("/api/admin/players", { method: "GET" }),
    apiRequest<{ factions: Faction[] }>("/api/admin/factions", { method: "GET" }),
    apiRequest<{ planets: Planet[] }>("/api/admin/planets", { method: "GET" }),
    apiRequest<{ fleets: Fleet[] }>("/api/admin/fleets", { method: "GET" }),
    apiRequest<{ alliances: RelationPair[]; wars: RelationPair[] }>("/api/admin/relations", {
      method: "GET",
    }),
    apiRequest<{ rates: ProductConversionRates }>("/api/admin/product-conversion-rates", {
      method: "GET",
    }),
  ]);

  runtime.players = playersResp.players;
  const nextPlayerId = Math.max(0, ...runtime.players.map((player) => player.id)) + 1;
  addPlayerColor.value = defaultPlayerColor(nextPlayerId);
  runtime.factions = factionsResp.factions;
  runtime.planets = planetsResp.planets;
  runtime.fleets = fleetsResp.fleets;
  runtime.alliances = relationsResp.alliances;
  runtime.wars = relationsResp.wars;
  runtime.productConversionRates = conversionResp.rates;

  renderAll();
}

function renderRelationsLists(): void {
  alliancesList.innerHTML = "";
  warsList.innerHTML = "";

  const query = relationsSearch.value;
  const filteredAlliances = runtime.alliances.filter((pair) =>
    matchesSearch(`${pair.playerAId} ${pair.playerBId} alliance`, query),
  );
  const filteredWars = runtime.wars.filter((pair) =>
    matchesSearch(`${pair.playerAId} ${pair.playerBId} war`, query),
  );

  if (filteredAlliances.length === 0) {
    const li = document.createElement("li");
    li.textContent = "none";
    alliancesList.appendChild(li);
  }

  if (filteredWars.length === 0) {
    const li = document.createElement("li");
    li.textContent = "none";
    warsList.appendChild(li);
  }

  for (const pair of filteredAlliances) {
    const li = document.createElement("li");
    li.textContent = `${pair.playerAId} <-> ${pair.playerBId}`;
    alliancesList.appendChild(li);
  }

  for (const pair of filteredWars) {
    const li = document.createElement("li");
    li.textContent = `${pair.playerAId} vs ${pair.playerBId}`;
    warsList.appendChild(li);
  }
}

function renderPlayers(): void {
  playersList.innerHTML = "";

  const query = playersSearch.value;
  for (const player of sortedPlayers()) {
    const searchText = [
      player.id,
      player.name,
      player.factionId,
      player.alignment,
      player.login?.username ?? "",
    ].join(" ");
    if (!matchesSearch(searchText, query)) {
      continue;
    }

    const item = document.createElement("details");
    item.className = "item item-collapsible";

    const title = document.createElement("summary");
    title.className = "title";
    title.textContent = `${player.id} (${player.name}) [${player.factionId}]`;
    item.appendChild(title);

    const nameInput = createInput(player.name);
    const colorInput = createInput(player.color);
    colorInput.type = "color";
    const resourcesInput = createNumberInput(player.resources);
    const usernameInput = createInput(player.login?.username ?? "");
    const passwordInput = createInput("");
    const alignmentSelect = createSelect(player.alignment, [
      "NON_IMPERIAL",
      "IMPERIAL",
    ]);
    const factionSelect = buildFactionSelect(player.factionId);
    const canTakeResourcesInput = document.createElement("input");
    canTakeResourcesInput.type = "checkbox";
    canTakeResourcesInput.checked = player.canTakePlanetResources;

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Name", nameInput),
      createLabeledField("Unit color", colorInput),
      createLabeledField("Resources", resourcesInput),
      createLabeledField("Alignment", alignmentSelect),
      createLabeledField("Faction", factionSelect),
      createLabeledField("May take planet resources", canTakeResourcesInput),
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
              color: colorInput.value,
              resources: Number(resourcesInput.value),
              alignment: alignmentSelect.value,
              factionId: Number(factionSelect.value),
              canTakePlanetResources: canTakeResourcesInput.checked,
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

  const query = factionsSearch.value;
  for (const faction of sortedFactions()) {
    const searchText = `${faction.id} ${faction.name} ${faction.description ?? ""}`;
    if (!matchesSearch(searchText, query)) {
      continue;
    }

    const item = document.createElement("details");
    item.className = "item item-collapsible";

    const title = document.createElement("summary");
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

  const query = planetsSearch.value;
  const planets = [...runtime.planets].sort((a, b) => a.id - b.id);
  for (const planet of planets) {
    const searchText = [
      planet.id,
      planet.name,
      planet.worldType,
      planet.position.q,
      planet.position.r,
      ...planet.worldTags,
    ].join(" ");
    if (!matchesSearch(searchText, query)) {
      continue;
    }

    const item = document.createElement("details");
    item.className = "item item-collapsible";

    const title = document.createElement("summary");
    title.className = "title";
    title.textContent = `${planet.name} (#${planet.id}) [${planet.position.q},${planet.position.r}] ${planet.worldType}`;
    item.appendChild(title);

    const nameInput = createInput(planet.name);
    const qInput = createNumberInput(planet.position.q);
    const rInput = createNumberInput(planet.position.r);
    const worldTypeSelect = createSelect(planet.worldType, [...PLANET_WORLD_TYPES]);
    const worldTagsSelector = createChipSelector(PLANET_TAGS, planet.worldTags);
    const populationInput = createNumberInput(planet.population);
    const moraleInput = createNumberInput(planet.morale);
    const titheLevelSelect = createSelect(planet.titheLevel, [...TITHE_LEVEL_ORDER]);
    titheLevelSelect.disabled = true;
    const maxTitheLevelSelect = createSelect(planet.maxTitheLevel, [...TITHE_LEVEL_ORDER]);
    const tithePaidInput = createNumberInput(planet.tithePaid);
    tithePaidInput.disabled = true;
    const infInput = createNumberInput(planet.influenceValue);
    const visionInput = createNumberInput(planet.visionRange);
    const overviewInput = createNumberInput(planet.overviewRange);
    const rawStockEditor = createResourceEditor(RAW_RESOURCE_KEYS, planet.rawStock);
    const generationSelector = createChipSelector(
      RAW_RESOURCE_KEYS,
      Object.entries(planet.resourceGeneration)
        .filter(([, enabled]) => Number(enabled) > 0)
        .map(([key]) => key),
    );
    const titheContributionsInput = createInput(toJsonCompact(planet.titheContributions));
    const productStorageEditor = createPlayerProductStorageEditor(
      runtime.players,
      planet.productStorageByPlayerId,
    );
    const infoFragmentsInput = createInput(toJsonCompact(planet.infoFragments));

    const fields = document.createElement("div");
    fields.className = "grid";
    const rawStockField = createLabeledField("Current Resources", rawStockEditor);
    rawStockField.className = "resource-list-field";
    const productStorageField = createLabeledField("Current Products", productStorageEditor);
    productStorageField.className = "resource-list-field";
    fields.append(
      createLabeledField("Planet Name", nameInput),
      createLabeledField("Q", qInput),
      createLabeledField("R", rInput),
      createLabeledField("World Type", worldTypeSelect),
      createLabeledField("World Tags", worldTagsSelector),
      createLabeledField("Population", populationInput),
      createLabeledField("Morale", moraleInput),
      createLabeledField("Tithe Level", titheLevelSelect),
      createLabeledField("Maximum Tithe Level", maxTitheLevelSelect),
      createLabeledField("Tithe Paid", tithePaidInput),
      createLabeledField("Tithe Contributions JSON", titheContributionsInput),
      createLabeledField("Influence", infInput),
      createLabeledField("Vision", visionInput),
      createLabeledField("Overview", overviewInput),
      rawStockField,
      createLabeledField("Generated Resources", generationSelector),
      productStorageField,
      createLabeledField("Info Fragments JSON", infoFragmentsInput),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          const rawStock = readResourceEditor(rawStockEditor);
          const resourceGeneration = Object.fromEntries(
            selectedChipValues(generationSelector).map((key) => [key, 1]),
          );
          const titheContributions = parseJsonObjectInput(titheContributionsInput.value);
          const productStorageByPlayerId = readPlayerProductStorages(productStorageEditor);
          const infoFragments = parseJsonObjectInput(infoFragmentsInput.value);

          await apiRequest(`/api/admin/planets/${encodeURIComponent(planet.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              name: nameInput.value.trim(),
              q: Number(qInput.value),
              r: Number(rInput.value),
              worldType: worldTypeSelect.value,
              worldTags: selectedChipValues(worldTagsSelector),
              population: Number(populationInput.value),
              morale: Number(moraleInput.value),
              maxTitheLevel: maxTitheLevelSelect.value,
              titheContributions,
              resourceGeneration,
              influenceValue: Number(infInput.value),
              visionRange: Number(visionInput.value),
              overviewRange: Number(overviewInput.value),
              rawStock,
              productStorageByPlayerId,
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

function renderFleetList(
  domain: FleetDomain,
  list: HTMLDivElement,
  query: string,
): void {
  list.innerHTML = "";

  const fleets = runtime.fleets
    .filter((fleet) => fleet.domain === domain)
    .sort((a, b) => a.id - b.id);
  for (const fleet of fleets) {
    const searchText = [
      fleet.id,
      fleet.ownerPlayerId,
      fleet.stance,
      fleet.domain,
      fleet.position.q,
      fleet.position.r,
    ].join(" ");
    if (!matchesSearch(searchText, query)) {
      continue;
    }

    const item = document.createElement("details");
    item.className = "item item-collapsible";

    const title = document.createElement("summary");
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
              ownerPlayerId: Number(ownerSelect.value),
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

    list.appendChild(item);
  }
}

function renderFleets(): void {
  renderFleetList("SPACE", fleetsList, fleetsSearch.value);
  renderFleetList("GROUND", armiesList, armiesSearch.value);
}

function renderResourceConversionRates(): void {
  resourceConversionRates.replaceChildren();
  for (const productKey of PRODUCT_RESOURCE_KEYS) {
    const row = document.createElement("div");
    row.className = "resource-editor-row";
    const recipe = PRODUCT_RECIPES[productKey];
    const label = document.createElement("label");
    label.textContent = `${productKey} ← ${recipe.input}`;
    const input = createNumberInput(runtime.productConversionRates[productKey]);
    input.value = runtime.productConversionRates[productKey].toFixed(2);
    input.min = "0.01";
    input.step = "0.01";
    input.dataset.conversionProductKey = productKey;
    row.append(label, input);
    resourceConversionRates.append(row);
  }
}

async function saveResourceConversionRates(): Promise<void> {
  const rates: ProductConversionRates = { ...DEFAULT_PRODUCT_CONVERSION_RATES };
  for (const input of resourceConversionRates.querySelectorAll<HTMLInputElement>(
    "input[data-conversion-product-key]",
  )) {
    const productKey = input.dataset.conversionProductKey;
    const rate = Number(input.value);
    if (!productKey || !PRODUCT_RESOURCE_KEYS.includes(productKey as (typeof PRODUCT_RESOURCE_KEYS)[number])) {
      continue;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      appendEvent(`Conversion rate for ${productKey} must be positive`);
      return;
    }
    const roundedRate = roundConversionRate(rate);
    if (roundedRate <= 0) {
      appendEvent(`Conversion rate for ${productKey} is too small after rounding`);
      return;
    }
    rates[productKey as (typeof PRODUCT_RESOURCE_KEYS)[number]] = roundedRate;
  }

  try {
    await apiRequest("/api/admin/product-conversion-rates", {
      method: "PUT",
      body: JSON.stringify({ rates }),
    });
    appendEvent("Resource conversion rates updated");
    await loadAllData();
  } catch (error) {
    appendEvent(`Conversion rate update failed: ${(error as Error).message}`);
  }
}

function renderAll(): void {
  syncAddPlayerFactionSelect();
  syncPlayerIdSelects();
  syncArmyDestinations();
  renderPlayers();
  renderFactions();
  renderPlanets();
  renderFleets();
  renderRelationsLists();
  renderResourceConversionRates();
}

async function addPlayer(): Promise<void> {
  try {
    await apiRequest("/api/admin/players", {
      method: "POST",
      body: JSON.stringify({
        name: addPlayerName.value.trim(),
        color: addPlayerColor.value,
        alignment: addPlayerAlignment.value,
        factionId: addPlayerFaction.value ? Number(addPlayerFaction.value) : undefined,
        canTakePlanetResources: addPlayerCanTakeResources.checked,
        username: addPlayerUsername.value.trim() || undefined,
        password: addPlayerPassword.value || undefined,
      }),
    });
    appendEvent(`Player ${addPlayerName.value.trim()} created`);
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
        code: addFactionId.value.trim(),
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
    const resourceGeneration = Object.fromEntries(
      selectedChipValues(addPlanetGeneration).map((key) => [key, 1]),
    );
    await apiRequest("/api/admin/planets", {
      method: "POST",
      body: JSON.stringify({
        name: addPlanetName.value.trim(),
        id: addPlanetId.value.trim(),
        q: Number(addPlanetQ.value),
        r: Number(addPlanetR.value),
        worldType: addPlanetWorldType.value,
        worldTags: selectedChipValues(addPlanetWorldTags),
        population: Number(addPlanetPopulation.value),
        morale: Number(addPlanetMorale.value),
        titheLevel: "ADEPTUS_NON",
        maxTitheLevel: addPlanetMaxTitheLevel.value,
        tithePaid: Number(addPlanetTithePaid.value),
        titheContributions: {},
        resourceGeneration,
        rawStock: readResourceEditor(addPlanetRawStock),
        productStorageByPlayerId: {},
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
        ownerPlayerId: Number(addFleetOwner.value),
        q: Number(addFleetQ.value),
        r: Number(addFleetR.value),
        combatPower: Number(addFleetPower.value),
        health: Number(addFleetHealth.value),
        influence: Number(addFleetInfluence.value),
        actionPoints: Number(addFleetAp.value),
        visionRange: Number(addFleetVision.value),
        capacity: Number(addFleetCapacity.value),
        stance: addFleetStance.value,
        domain: "SPACE",
        inventory,
      }),
    });
    appendEvent("Fleet created");
    await loadAllData();
  } catch (error) {
    appendEvent(`Fleet create failed: ${(error as Error).message}`);
  }
}

async function addArmy(): Promise<void> {
  try {
    if (!addArmyOwner.value || !addArmyDestination.value) {
      throw new Error("Army owner and destination are required");
    }
    const kind = addArmyDestinationKind.value === "FLEET" ? "FLEET" : "PLANET";
    const destinationId = Number(addArmyDestination.value);
    const destination = kind === "FLEET"
      ? { kind, fleetId: destinationId }
      : { kind, planetId: destinationId };
    await apiRequest("/api/admin/armies", {
      method: "POST",
      body: JSON.stringify({
        ownerPlayerId: Number(addArmyOwner.value),
        destination,
        combatPower: Number(addArmyPower.value),
        health: Number(addArmyHealth.value),
        influence: Number(addArmyInfluence.value),
        visionRange: Number(addArmyVision.value),
        stance: addArmyStance.value,
      }),
    });
    appendEvent("Army created");
    await loadAllData();
  } catch (error) {
    appendEvent(`Army create failed: ${(error as Error).message}`);
  }
}

async function mutateRelation(remove: boolean): Promise<void> {
  if (!relPlayerA.value || !relPlayerB.value) {
    appendEvent("Relation mutation failed: player ids are required");
    return;
  }

  const payload = {
    type: relType.value,
    playerAId: Number(relPlayerA.value),
    playerBId: Number(relPlayerB.value),
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
  let me: SessionInfo;
  try {
    me = await apiRequest<SessionInfo>("/api/me", {
      method: "GET",
    });
  } catch (error) {
    setSession(null);
    setStatus(`Session restore failed: ${(error as Error).message}`);
    return;
  }

  if (me.role !== "admin") {
    setSession(null);
    setStatus("Session is not admin");
    return;
  }

  setSession(me);
  setStatus(`Connected to ${apiBase}`);

  try {
    await loadAllData();
  } catch (error) {
    const message = (error as Error).message;
    appendEvent(`Admin data reload failed: ${message}`);
    setStatus(`Authenticated as ${me.username}; data reload failed: ${message}`);
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

addArmyBtn.addEventListener("click", () => {
  void addArmy();
});

addArmyDestinationKind.addEventListener("change", syncArmyDestinations);

addRelationBtn.addEventListener("click", () => {
  void mutateRelation(false);
});

removeRelationBtn.addEventListener("click", () => {
  void mutateRelation(true);
});

saveResourceConversionBtn.addEventListener("click", () => {
  void saveResourceConversionRates();
});

playersSearch.addEventListener("input", () => {
  renderPlayers();
});

factionsSearch.addEventListener("input", () => {
  renderFactions();
});

planetsSearch.addEventListener("input", () => {
  renderPlanets();
});

fleetsSearch.addEventListener("input", () => {
  renderFleets();
});

armiesSearch.addEventListener("input", () => {
  renderFleets();
});

relationsSearch.addEventListener("input", () => {
  renderRelationsLists();
});

initStaticSelects();
setPanelsVisible(false);
renderAll();
void restoreSession();
import { initLocalization } from "./i18n";

initLocalization();
