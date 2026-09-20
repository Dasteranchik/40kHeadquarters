import { PRODUCT_RESOURCE_KEYS } from "../../../src/planetDomain";
import type { PlayerProductStorages, ResourceStore } from "../../../src/types";

interface PlayerOption {
  id: number;
  name: string;
}

export function createInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.value = value;
  return input;
}

export function createNumberInput(value: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  return input;
}

export function createSelect(value: string, options: string[]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue === value;
    select.appendChild(option);
  }
  return select;
}

export function createChipSelector(
  options: readonly string[],
  selected: readonly string[],
): HTMLDivElement {
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

export function selectedChipValues(selector: HTMLElement): string[] {
  return Array.from(
    selector.querySelectorAll<HTMLElement>(".chip-toggle.is-selected"),
    (chip) => chip.dataset.value!,
  );
}

export function createResourceEditor(
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

export function readResourceEditor(editor: HTMLElement): ResourceStore {
  const store: ResourceStore = {};
  for (const input of editor.querySelectorAll<HTMLInputElement>("input[data-resource-key]")) {
    const amount = Math.max(0, Math.round((Number(input.value) || 0) * 100) / 100);
    if (amount > 0) store[input.dataset.resourceKey!] = amount;
  }
  return store;
}

export function createPlayerProductStorageEditor(
  players: readonly PlayerOption[],
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
      createResourceEditor(PRODUCT_RESOURCE_KEYS, storages[String(player.id)] ?? {}),
    );
    container.append(section);
  }
  return container;
}

export function readPlayerProductStorages(editor: HTMLElement): PlayerProductStorages {
  const storages: PlayerProductStorages = {};
  for (const section of editor.querySelectorAll<HTMLElement>("[data-player-product-storage]")) {
    const playerId = section.dataset.playerProductStorage;
    const resourceEditor = section.querySelector<HTMLElement>(".resource-editor");
    if (!playerId || !resourceEditor) continue;
    storages[playerId] = readResourceEditor(resourceEditor);
  }
  return storages;
}

export function createLabeledField(labelText: string, control: HTMLElement): HTMLDivElement {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}

export function createActionButton(label: string, className?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
  return button;
}

export function parseJsonObjectInput(value: string): Record<string, number> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
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

export function toJsonCompact(value: unknown): string {
  const json = JSON.stringify(value);
  return json === "{}" ? "" : json;
}

export function matchesSearch(haystack: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return !trimmed || haystack.toLowerCase().includes(trimmed);
}

export function populateSelect(select: HTMLSelectElement, values: string[]): void {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    return option;
  }));
}
