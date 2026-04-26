import type { Fleet, GameState, HexCoord, Planet, Tile } from "../../../src/types";

type Nullable<T> = T | null;

export interface HexContextMenuElements {
  stageEl: HTMLDivElement;
  menuEl: HTMLDivElement;
  titleEl: HTMLElement;
  bodyEl: HTMLDivElement;
}

export interface HexContextMenuDeps {
  elements: HexContextMenuElements;
  getActivePlayerId: () => string | null;
  getSelectedFleetId: () => string | null;
  getTile: (state: GameState, coord: HexCoord) => Nullable<Tile>;
  fleetsAtCoord: (state: GameState, coord: HexCoord) => Fleet[];
  onOwnFleetSelected: (fleetId: string) => void;
}

export interface HexContextMenuController {
  hide: () => void;
  isOpen: () => boolean;
  open: (state: GameState, coord: HexCoord, clientX: number, clientY: number) => void;
}

export function createHexContextMenuController(
  deps: HexContextMenuDeps,
): HexContextMenuController {
  function hide(): void {
    deps.elements.menuEl.classList.add("menu-hidden");
    deps.elements.bodyEl.innerHTML = "";
  }

  function isOpen(): boolean {
    return !deps.elements.menuEl.classList.contains("menu-hidden");
  }

  function open(
    state: GameState,
    coord: HexCoord,
    clientX: number,
    clientY: number,
  ): void {
    const playerId = deps.getActivePlayerId();
    const tile = deps.getTile(state, coord);
    if (!playerId || !tile) {
      hide();
      return;
    }

    const fleets = sortFleetsForMenu(deps.fleetsAtCoord(state, coord), playerId);
    const planet = tile.planetId ? state.planets[tile.planetId] : null;
    if (fleets.length === 0 && !planet) {
      hide();
      return;
    }

    deps.elements.titleEl.textContent = `Hex ${coord.q},${coord.r}`;
    deps.elements.bodyEl.innerHTML = "";

    if (planet) {
      deps.elements.bodyEl.appendChild(createPlanetNote(planet));
    }

    let ownSelectableCount = 0;
    for (const fleet of fleets) {
      const isOwn = fleet.ownerPlayerId === playerId;
      const isSelected = deps.getSelectedFleetId() === fleet.id;
      deps.elements.bodyEl.appendChild(
        createFleetRow(fleet, isOwn, isSelected, () => {
          deps.onOwnFleetSelected(fleet.id);
        }, () => {
          ownSelectableCount += 1;
        }),
      );
    }

    if (ownSelectableCount === 0) {
      const note = document.createElement("p");
      note.className = "hex-context-note";
      note.textContent = "No controllable fleets in this hex";
      deps.elements.bodyEl.appendChild(note);
    }

    deps.elements.menuEl.classList.remove("menu-hidden");
    position(deps.elements, clientX, clientY);
  }

  return {
    hide,
    isOpen,
    open,
  };
}

function position(
  elements: HexContextMenuElements,
  clientX: number,
  clientY: number,
): void {
  const stageRect = elements.stageEl.getBoundingClientRect();
  const margin = 8;
  const startX = clientX - stageRect.left + 10;
  const startY = clientY - stageRect.top + 10;
  const maxX = Math.max(
    margin,
    stageRect.width - elements.menuEl.offsetWidth - margin,
  );
  const maxY = Math.max(
    margin,
    stageRect.height - elements.menuEl.offsetHeight - margin,
  );
  const left = Math.min(Math.max(margin, startX), maxX);
  const top = Math.min(Math.max(margin, startY), maxY);

  elements.menuEl.style.left = `${left}px`;
  elements.menuEl.style.top = `${top}px`;
}

function sortFleetsForMenu(fleets: Fleet[], playerId: string): Fleet[] {
  return [...fleets].sort((a, b) => {
    const ownOrder = Number(b.ownerPlayerId === playerId) - Number(a.ownerPlayerId === playerId);
    if (ownOrder !== 0) {
      return ownOrder;
    }

    return a.id.localeCompare(b.id);
  });
}

function createPlanetNote(planet: Planet): HTMLParagraphElement {
  const planetNote = document.createElement("p");
  planetNote.className = "hex-context-note";
  planetNote.textContent = `Planet ${planet.id}: ${planet.worldType}`;
  return planetNote;
}

function createFleetRow(
  fleet: Fleet,
  isOwn: boolean,
  isSelected: boolean,
  onSelect: () => void,
  onOwnRow: () => void,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `hex-context-row${isOwn ? " hex-context-row-own" : ""}`;

  const meta = document.createElement("div");
  meta.className = "hex-context-meta";

  const name = document.createElement("div");
  name.className = "hex-context-name";
  name.textContent = `${fleet.id}${isOwn ? " (you)" : ` (${fleet.ownerPlayerId})`}`;

  const stats = document.createElement("div");
  stats.className = "hex-context-stats";
  stats.textContent = `CP ${Math.round(fleet.combatPower)} | HP ${Math.max(0, Math.round(fleet.health))}`;

  meta.append(name, stats);
  row.appendChild(meta);

  if (isOwn) {
    onOwnRow();

    const selectBtn = document.createElement("button");
    selectBtn.className = `hex-context-select${isSelected ? " hex-context-selected" : ""}`;
    selectBtn.textContent = isSelected ? "Selected" : "Select";
    selectBtn.disabled = isSelected;
    selectBtn.type = "button";
    selectBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect();
    });

    row.appendChild(selectBtn);
  }

  return row;
}
