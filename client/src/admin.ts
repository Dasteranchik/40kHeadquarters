import "./admin.css";

import type { Fleet, FleetStance, Planet, Player } from "../../src/types";

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
const planetsPanel = document.getElementById("planetsPanel") as HTMLElement;
const fleetsPanel = document.getElementById("fleetsPanel") as HTMLElement;
const relationsPanel = document.getElementById("relationsPanel") as HTMLElement;

const addPlayerId = document.getElementById("addPlayerId") as HTMLInputElement;
const addPlayerName = document.getElementById("addPlayerName") as HTMLInputElement;
const addPlayerUsername = document.getElementById("addPlayerUsername") as HTMLInputElement;
const addPlayerPassword = document.getElementById("addPlayerPassword") as HTMLInputElement;
const addPlayerBtn = document.getElementById("addPlayerBtn") as HTMLButtonElement;
const playersList = document.getElementById("playersList") as HTMLDivElement;

const addPlanetId = document.getElementById("addPlanetId") as HTMLInputElement;
const addPlanetQ = document.getElementById("addPlanetQ") as HTMLInputElement;
const addPlanetR = document.getElementById("addPlanetR") as HTMLInputElement;
const addPlanetRes = document.getElementById("addPlanetRes") as HTMLInputElement;
const addPlanetInf = document.getElementById("addPlanetInf") as HTMLInputElement;
const addPlanetVision = document.getElementById("addPlanetVision") as HTMLInputElement;
const addPlanetBtn = document.getElementById("addPlanetBtn") as HTMLButtonElement;
const planetsList = document.getElementById("planetsList") as HTMLDivElement;

const addFleetId = document.getElementById("addFleetId") as HTMLInputElement;
const addFleetOwner = document.getElementById("addFleetOwner") as HTMLInputElement;
const addFleetQ = document.getElementById("addFleetQ") as HTMLInputElement;
const addFleetR = document.getElementById("addFleetR") as HTMLInputElement;
const addFleetPower = document.getElementById("addFleetPower") as HTMLInputElement;
const addFleetHealth = document.getElementById("addFleetHealth") as HTMLInputElement;
const addFleetInfluence = document.getElementById("addFleetInfluence") as HTMLInputElement;
const addFleetAp = document.getElementById("addFleetAp") as HTMLInputElement;
const addFleetVision = document.getElementById("addFleetVision") as HTMLInputElement;
const addFleetCapacity = document.getElementById("addFleetCapacity") as HTMLInputElement;
const addFleetStance = document.getElementById("addFleetStance") as HTMLSelectElement;
const addFleetBtn = document.getElementById("addFleetBtn") as HTMLButtonElement;
const fleetsList = document.getElementById("fleetsList") as HTMLDivElement;

const relType = document.getElementById("relType") as HTMLSelectElement;
const relPlayerA = document.getElementById("relPlayerA") as HTMLInputElement;
const relPlayerB = document.getElementById("relPlayerB") as HTMLInputElement;
const addRelationBtn = document.getElementById("addRelationBtn") as HTMLButtonElement;
const removeRelationBtn = document.getElementById("removeRelationBtn") as HTMLButtonElement;
const alliancesList = document.getElementById("alliancesList") as HTMLUListElement;
const warsList = document.getElementById("warsList") as HTMLUListElement;

const runtime: AdminState = {
  session: null,
  players: [],
  planets: [],
  fleets: [],
  alliances: [],
  wars: [],
};

function setPanelsVisible(visible: boolean): void {
  for (const panel of [adminPanel, planetsPanel, fleetsPanel, relationsPanel]) {
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

async function loadAllData(): Promise<void> {
  if (!runtime.session) {
    return;
  }

  const [playersResp, planetsResp, fleetsResp, relationsResp] = await Promise.all([
    apiRequest<{ players: AdminPlayer[] }>("/api/admin/players", { method: "GET" }),
    apiRequest<{ planets: Planet[] }>("/api/admin/planets", { method: "GET" }),
    apiRequest<{ fleets: Fleet[] }>("/api/admin/fleets", { method: "GET" }),
    apiRequest<{ alliances: RelationPair[]; wars: RelationPair[] }>("/api/admin/relations", {
      method: "GET",
    }),
  ]);

  runtime.players = playersResp.players;
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
    title.textContent = `${player.id} (${player.name})`;
    item.appendChild(title);

    const nameInput = createInput(player.name);
    const resourcesInput = createNumberInput(player.resources);
    const usernameInput = createInput(player.login?.username ?? "");
    const passwordInput = createInput(player.login?.password ?? "");

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Name", nameInput),
      createLabeledField("Resources", resourcesInput),
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

function renderPlanets(): void {
  planetsList.innerHTML = "";

  for (const planet of runtime.planets) {
    const item = document.createElement("div");
    item.className = "item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${planet.id} [${planet.position.q},${planet.position.r}]`;
    item.appendChild(title);

    const qInput = createNumberInput(planet.position.q);
    const rInput = createNumberInput(planet.position.r);
    const resInput = createNumberInput(planet.resourceProduction);
    const infInput = createNumberInput(planet.influenceValue);
    const visionInput = createNumberInput(planet.visionRange);

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Q", qInput),
      createLabeledField("R", rInput),
      createLabeledField("Resource Production", resInput),
      createLabeledField("Influence Value", infInput),
      createLabeledField("Vision Range", visionInput),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/planets/${encodeURIComponent(planet.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              q: Number(qInput.value),
              r: Number(rInput.value),
              resourceProduction: Number(resInput.value),
              influenceValue: Number(infInput.value),
              visionRange: Number(visionInput.value),
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

    const ownerInput = createInput(fleet.ownerPlayerId);
    const qInput = createNumberInput(fleet.position.q);
    const rInput = createNumberInput(fleet.position.r);
    const powerInput = createNumberInput(fleet.combatPower);
    const healthInput = createNumberInput(fleet.health);
    const influenceInput = createNumberInput(fleet.influence);
    const apInput = createNumberInput(fleet.actionPoints);
    const visionInput = createNumberInput(fleet.visionRange);
    const capacityInput = createNumberInput(fleet.capacity);

    const stanceSelect = document.createElement("select");
    for (const stance of ["ATTACK", "DEFENSE"] as FleetStance[]) {
      const option = document.createElement("option");
      option.value = stance;
      option.textContent = stance;
      if (stance === fleet.stance) {
        option.selected = true;
      }
      stanceSelect.appendChild(option);
    }

    const fields = document.createElement("div");
    fields.className = "grid";
    fields.append(
      createLabeledField("Owner Player ID", ownerInput),
      createLabeledField("Q", qInput),
      createLabeledField("R", rInput),
      createLabeledField("Combat Power", powerInput),
      createLabeledField("Health", healthInput),
      createLabeledField("Influence", influenceInput),
      createLabeledField("Action Points", apInput),
      createLabeledField("Vision Range", visionInput),
      createLabeledField("Capacity", capacityInput),
      createLabeledField("Stance", stanceSelect),
    );
    item.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "actions";

    const updateBtn = createActionButton("Update");
    updateBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await apiRequest(`/api/admin/fleets/${encodeURIComponent(fleet.id)}`, {
            method: "PUT",
            body: JSON.stringify({
              ownerPlayerId: ownerInput.value.trim(),
              q: Number(qInput.value),
              r: Number(rInput.value),
              combatPower: Number(powerInput.value),
              health: Number(healthInput.value),
              influence: Number(influenceInput.value),
              actionPoints: Number(apInput.value),
              visionRange: Number(visionInput.value),
              capacity: Number(capacityInput.value),
              stance: stanceSelect.value,
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
  renderPlayers();
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

async function addPlanet(): Promise<void> {
  try {
    await apiRequest("/api/admin/planets", {
      method: "POST",
      body: JSON.stringify({
        id: addPlanetId.value.trim(),
        q: Number(addPlanetQ.value),
        r: Number(addPlanetR.value),
        resourceProduction: Number(addPlanetRes.value),
        influenceValue: Number(addPlanetInf.value),
        visionRange: Number(addPlanetVision.value || "1"),
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
    await apiRequest("/api/admin/fleets", {
      method: "POST",
      body: JSON.stringify({
        id: addFleetId.value.trim(),
        ownerPlayerId: addFleetOwner.value.trim(),
        q: Number(addFleetQ.value),
        r: Number(addFleetR.value),
        combatPower: Number(addFleetPower.value),
        health: Number(addFleetHealth.value),
        influence: Number(addFleetInfluence.value),
        actionPoints: Number(addFleetAp.value),
        visionRange: Number(addFleetVision.value),
        capacity: Number(addFleetCapacity.value),
        stance: addFleetStance.value,
      }),
    });
    appendEvent(`Fleet ${addFleetId.value.trim()} created`);
    await loadAllData();
  } catch (error) {
    appendEvent(`Fleet create failed: ${(error as Error).message}`);
  }
}

async function mutateRelation(remove: boolean): Promise<void> {
  const payload = {
    type: relType.value,
    playerAId: relPlayerA.value.trim(),
    playerBId: relPlayerB.value.trim(),
  };

  try {
    await apiRequest("/api/admin/relations", {
      method: remove ? "DELETE" : "POST",
      body: JSON.stringify(payload),
    });
    appendEvent(`Relation ${remove ? "removed" : "added"}: ${payload.playerAId}/${payload.playerBId} ${payload.type}`);
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

setPanelsVisible(false);
renderAll();
void restoreSession();

