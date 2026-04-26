import type { Fleet, FleetStance, GameState } from "../../../src/types";
import { collectRelationPairs } from "../../../src/utils/relations";
import type { SessionInfo } from "../session";

type Nullable<T> = T | null;

export interface HudElements {
  userValueEl: HTMLElement;
  authStateEl: HTMLParagraphElement;
  playerInfoEl: HTMLParagraphElement;
  adminSection: HTMLElement;
  turnNumberEl: HTMLElement;
  phaseValueEl: HTMLElement;
  resourceValueEl: HTMLElement;
  selectedFleetLine: HTMLParagraphElement;
  selectedFleetDetailsEl: HTMLPreElement;
  pathLine: HTMLParagraphElement;
  submitMoveBtn: HTMLButtonElement;
  clearPathBtn: HTMLButtonElement;
  setAttackBtn: HTMLButtonElement;
  setDefenseBtn: HTMLButtonElement;
  warBtn: HTMLButtonElement;
  allyBtn: HTMLButtonElement;
  readyBtn: HTMLButtonElement;
  endTurnBtn: HTMLButtonElement;
  targetSelect: HTMLSelectElement;
  adminFleetOwnerSelect: HTMLSelectElement;
  adminPlayerList: HTMLElement;
  adminPlanetList: HTMLElement;
  adminFleetList: HTMLElement;
  alliancesListEl: HTMLUListElement;
  warsListEl: HTMLUListElement;
}

export function formatStore(store: Record<string, number>): string {
  const entries = Object.entries(store).filter(([, value]) => Number(value) > 0);
  if (entries.length === 0) {
    return "-";
  }

  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${Math.trunc(value)}`)
    .join(", ");
}

export function buildSelectedFleetDetails(fleet: Fleet, stance: FleetStance): string {
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
    `Domain: ${fleet.domain}`,
    `Inventory: ${formatStore(fleet.inventory)}`,
    `Stance: ${stance}`,
    `Stance Pending: ${isPendingStance ? "yes" : "no"}`,
  ].join("\n");
}

export function updateStanceButtons(
  elements: HudElements,
  selected: Nullable<Fleet>,
  stance: FleetStance | null,
): void {
  const { setAttackBtn, setDefenseBtn } = elements;
  if (!selected || !stance || setAttackBtn.disabled || setDefenseBtn.disabled) {
    setAttackBtn.classList.remove("is-active");
    setDefenseBtn.classList.remove("is-active");
    return;
  }

  setAttackBtn.classList.toggle("is-active", stance === "ATTACK");
  setDefenseBtn.classList.toggle("is-active", stance === "DEFENSE");
}

export function updateRelationsWindow(
  elements: HudElements,
  state: GameState | null,
): void {
  if (!state) {
    fillRelationList(elements.alliancesListEl, [], "none");
    fillRelationList(elements.warsListEl, [], "none");
    return;
  }

  const alliances = collectRelationPairs(state.players, "alliances").map(
    (pair) => `${pair.playerAId} <-> ${pair.playerBId}`,
  );
  const wars = collectRelationPairs(state.players, "wars").map(
    (pair) => `${pair.playerAId} vs ${pair.playerBId}`,
  );

  fillRelationList(elements.alliancesListEl, alliances, "none");
  fillRelationList(elements.warsListEl, wars, "none");
}

export function updateAuthView(
  elements: HudElements,
  session: SessionInfo | null,
): void {
  if (!session) {
    elements.userValueEl.textContent = "-";
    elements.authStateEl.textContent = "Not logged in";
    elements.playerInfoEl.textContent = "Player: -";
    elements.adminSection.classList.add("admin-hidden");
    return;
  }

  elements.userValueEl.textContent = `${session.username} (${session.role})`;
  elements.authStateEl.textContent = `Logged as ${session.username}`;
  elements.playerInfoEl.textContent = `Player: ${session.playerId ?? "n/a"}`;
  if (session.role === "admin") {
    elements.adminSection.classList.remove("admin-hidden");
  } else {
    elements.adminSection.classList.add("admin-hidden");
  }
}

export function refreshTargetOptions(
  elements: HudElements,
  state: GameState,
  activePlayerId: string | null,
): void {
  const { targetSelect } = elements;
  const current = targetSelect.value;
  const otherPlayers = Object.values(state.players)
    .map((player) => player.id)
    .filter((id) => id !== activePlayerId);

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

export function refreshAdminFleetOwnerOptions(
  elements: HudElements,
  state: GameState,
): void {
  const { adminFleetOwnerSelect } = elements;
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

export function renderAdminLists(
  elements: HudElements,
  state: GameState,
  onDeletePath: (path: string) => void,
): void {
  elements.adminPlayerList.innerHTML = "";
  for (const player of Object.values(state.players)) {
    elements.adminPlayerList.appendChild(
      createEntityItem(`${player.id} (${player.name})`, () => {
        onDeletePath(`/api/admin/players/${encodeURIComponent(player.id)}`);
      }),
    );
  }

  elements.adminPlanetList.innerHTML = "";
  for (const planet of Object.values(state.planets)) {
    elements.adminPlanetList.appendChild(
      createEntityItem(
        `${planet.id} [${planet.position.q},${planet.position.r}] +${planet.resourceProduction} vr:${planet.visionRange}`,
        () => {
          onDeletePath(`/api/admin/planets/${encodeURIComponent(planet.id)}`);
        },
      ),
    );
  }

  elements.adminFleetList.innerHTML = "";
  for (const fleet of Object.values(state.fleets)) {
    elements.adminFleetList.appendChild(
      createEntityItem(
        `${fleet.id} (${fleet.ownerPlayerId}) [${fleet.position.q},${fleet.position.r}] ${fleet.stance}`,
        () => {
          onDeletePath(`/api/admin/fleets/${encodeURIComponent(fleet.id)}`);
        },
      ),
    );
  }
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
