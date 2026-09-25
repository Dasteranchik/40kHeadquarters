import type { GameState } from "../../src/types";
import { t } from "./i18n";

const apiBase = new URLSearchParams(location.search).get("api") ?? `http://${location.hostname}:8080`;
const node = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const field = (id: string) => node<HTMLInputElement>(id);
const choice = (id: string) => node<HTMLSelectElement>(id);
const status = node<HTMLElement>("modelStatus");
let state: GameState | null = null;

async function api<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(apiBase + path, {
    method, credentials: "include", headers: { "Content-Type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
async function mutate(path: string, method: string, payload?: unknown): Promise<void> {
  try { await api(path, method, payload); status.textContent = t("Saved"); await load(); }
  catch (error) { status.textContent = t(error instanceof Error ? error.message : String(error)); }
}
const csv = (value: string): string[] => [...new Set(value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean))];
function options(id: string, values: Array<[string, string]>): void {
  const target = choice(id);
  const selected = target.value;
  target.replaceChildren();
  for (const [value, label] of values) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; target.append(option);
  }
  if (values.some(([value]) => value === selected)) target.value = selected;
}
function listing(id: string, items: Array<{ label: string; edit: () => void; remove: () => void }>): void {
  const target = node<HTMLElement>(id);
  target.replaceChildren();
  for (const item of items) {
    const row = document.createElement("div"); row.className = "list-row";
    const label = document.createElement("span"); label.textContent = item.label;
    const edit = document.createElement("button"); edit.textContent = t("Select"); edit.onclick = item.edit;
    const remove = document.createElement("button"); remove.textContent = t("Delete"); remove.onclick = item.remove;
    row.append(label, edit, remove); target.append(row);
  }
}
function renderDefinitions(game: GameState): void {
  const tags = Object.values(game.tags ?? {}).sort((a, b) => a.id.localeCompare(b.id));
  listing("modelTagsList", tags.map((tag) => ({ label: `${tag.id}: ${tag.name} ← ${tag.parentTagIds.join(", ")}`,
    edit: () => { field("modelTagId").value = tag.id; field("modelTagName").value = tag.name;
      field("modelTagDescription").value = tag.description ?? "";
      field("modelTagParents").value = tag.parentTagIds.join(", "); },
    remove: () => void mutate(`/api/admin/tags/${encodeURIComponent(tag.id)}`, "DELETE"),
  })));
  for (const id of ["modelRelationA", "modelRelationB"]) options(id, tags.map((tag) => [tag.id, `${tag.id}: ${tag.name}`]));
  listing("modelRelationsList", (game.tagRelations ?? []).map((rel) => ({
    label: `${rel.tagAId} / ${rel.tagBId}: ${rel.relation}`,
    edit: () => { choice("modelRelationA").value = rel.tagAId; choice("modelRelationB").value = rel.tagBId;
      choice("modelRelationKind").value = rel.relation; },
    remove: () => void mutate("/api/admin/tag-relations", "DELETE", rel),
  })));
  const kinds = Object.values(game.itemKinds ?? {}).sort((a, b) => a.id.localeCompare(b.id));
  listing("modelKindsList", kinds.map((kind) => ({ label: `${kind.id}: ${kind.name} [${kind.type}]`,
    edit: () => { field("modelKindId").value = kind.id; choice("modelKindType").value = kind.type;
      field("modelKindName").value = kind.name; field("modelKindTags").value = kind.tags.join(", ");
      field("modelKindDescription").value = kind.description ?? "";
      field("modelKindPower").value = kind.baseCombatPower === undefined ? "" : String(kind.baseCombatPower);
      field("modelKindHealth").value = kind.maxHealth === undefined ? "" : String(kind.maxHealth);
      field("modelKindCommander").checked = kind.commanderCapable === true;
      field("modelKindNavigator").checked = kind.isNavigator === true;
      choice("modelKindWarpVisibility").value = kind.warpVisibility === null || kind.warpVisibility === undefined
        ? "" : String(kind.warpVisibility);
      field("modelKindConfiguration").value = JSON.stringify(kind.configuration ?? {});
      field("modelKindEffects").value = JSON.stringify(kind.effects ?? []); },
    remove: () => void mutate(`/api/admin/item-kinds/${encodeURIComponent(kind.id)}`, "DELETE"),
  })));
  options("modelFormationKind", kinds.filter((kind) => kind.type === "PRODUCT" && kind.maxHealth !== undefined)
    .map((kind) => [kind.id, `${kind.id}: ${kind.name}`]));
  options("modelNewCommanderKind", kinds.filter((kind) => kind.type === "ARTIFACT" && kind.commanderCapable)
    .map((kind) => [kind.id, `${kind.id}: ${kind.name}`]));
  listing("modelDoctrinesList", Object.values(game.doctrines ?? {}).map((doctrine) => ({
    label: `${doctrine.id}: ${doctrine.name}`,
    edit: () => { field("modelDoctrineId").value = doctrine.id;
      field("modelDoctrineName").value = doctrine.name;
      field("modelDoctrineDescription").value = doctrine.description;
      field("modelDoctrineRequirements").value = JSON.stringify(doctrine.tagRequirements);
      field("modelDoctrineEffects").value = JSON.stringify(doctrine.effects); },
    remove: () => void mutate(`/api/admin/doctrines/${encodeURIComponent(doctrine.id)}`, "DELETE"),
  })));
}
async function renderUnit(): Promise<void> {
  if (!state) return;
  const unitId = Number(choice("modelUnitSelect").value);
  const unit = state.fleets[unitId];
  if (!unit) return;
  field("modelUnitName").value = unit.name ?? "";
  field("modelUnitMorale").value = String(unit.morale ?? 0);
  const { derived } = await api<{ derived: object }>(`/api/admin/units/${unitId}`);
  node<HTMLElement>("modelUnitDetails").textContent = JSON.stringify({
    id: unit.id, name: unit.name, type: unit.domain, owner: unit.ownerPlayerId,
    morale: unit.morale, commander: unit.commanderArtifactId ? state.artifacts[unit.commanderArtifactId] : null,
    formations: (unit.formationIds ?? []).map((id) => state?.formations?.[id]),
    attachedArtifacts: (unit.attachedArtifactIds ?? []).map((id) => state?.artifacts[id]),
    doctrines: unit.assignedDoctrineIds, ...derived,
  }, null, 2);
  options("modelFormationSelect", (unit.itemInventory.productIds ?? []).map((id) => [id, `${id}: ${state?.formations?.[id]?.name ?? ""}`]));
  options("modelAttachedFormationSelect", (unit.formationIds ?? []).map((id) => [id, `${id}: ${state?.formations?.[id]?.name ?? ""}`]));
  options("modelArtifactSelect", unit.itemInventory.artifactIds.map((id) => [id, `${id}: ${state?.artifacts[id]?.name ?? ""}`]));
  field("modelDoctrineSelect").value = (unit.assignedDoctrineIds ?? []).join(", ");
}
async function load(): Promise<void> {
  if (document.body.dataset.adminAuthenticated !== "true") return;
  try {
    state = (await api<{ state: GameState }>("/api/state")).state;
    renderDefinitions(state);
    options("modelNewUnitOwner", Object.values(state.players).sort((a, b) => a.id - b.id)
      .map((player) => [String(player.id), `#${player.id} ${player.name}`]));
    options("modelUnitSelect", Object.values(state.fleets).sort((a, b) => a.id - b.id)
      .map((unit) => [String(unit.id), `#${unit.id} ${unit.name ?? unit.domain}`]));
    await renderUnit();
  } catch (error) { status.textContent = t(error instanceof Error ? error.message : String(error)); }
}
node<HTMLButtonElement>("modelSaveTag").onclick = () => void mutate(
  `/api/admin/tags/${encodeURIComponent(field("modelTagId").value.trim().toUpperCase())}`, "PUT",
  { name: field("modelTagName").value.trim(), description: field("modelTagDescription").value.trim(),
    parentTagIds: csv(field("modelTagParents").value) },
);
node<HTMLButtonElement>("modelSaveRelation").onclick = () => void mutate("/api/admin/tag-relations", "PUT", {
  tagAId: choice("modelRelationA").value, tagBId: choice("modelRelationB").value,
  relation: choice("modelRelationKind").value,
});
node<HTMLButtonElement>("modelSaveKind").onclick = () => {
  try {
    const type = choice("modelKindType").value;
    const payload = { type, name: field("modelKindName").value.trim(),
      description: field("modelKindDescription").value.trim(),
      tags: csv(field("modelKindTags").value),
      configuration: JSON.parse(field("modelKindConfiguration").value),
      ...(type === "PRODUCT" ? { baseCombatPower: Number(field("modelKindPower").value),
        maxHealth: Number(field("modelKindHealth").value) } : {}),
      ...(type === "ARTIFACT" ? { commanderCapable: field("modelKindCommander").checked,
        isNavigator: field("modelKindNavigator").checked,
        warpVisibility: choice("modelKindWarpVisibility").value === "" ? null
          : Number(choice("modelKindWarpVisibility").value),
        effects: JSON.parse(field("modelKindEffects").value) } : {}),
    };
    void mutate(`/api/admin/item-kinds/${encodeURIComponent(field("modelKindId").value.trim().toUpperCase())}`, "PUT", payload);
  } catch (error) { status.textContent = String(error); }
};
node<HTMLButtonElement>("modelSaveDoctrine").onclick = () => {
  try {
    void mutate(`/api/admin/doctrines/${encodeURIComponent(field("modelDoctrineId").value.trim().toUpperCase())}`, "PUT", {
      name: field("modelDoctrineName").value.trim(), description: field("modelDoctrineDescription").value.trim(),
      tagRequirements: JSON.parse(field("modelDoctrineRequirements").value),
      effects: JSON.parse(field("modelDoctrineEffects").value),
    });
  } catch (error) { status.textContent = String(error); }
};
choice("modelUnitSelect").onchange = () => void renderUnit();
node<HTMLButtonElement>("modelCreateUnit").onclick = () => void mutate("/api/admin/units", "POST", {
  name: field("modelNewUnitName").value.trim() || undefined,
  ownerPlayerId: Number(choice("modelNewUnitOwner").value), domain: choice("modelNewUnitDomain").value,
  q: Number(field("modelNewUnitQ").value), r: Number(field("modelNewUnitR").value),
  commanderKindId: choice("modelNewCommanderKind").value,
  formationKindIds: csv(field("modelNewFormationKinds").value),
});
node<HTMLButtonElement>("modelSaveUnit").onclick = () => void mutate(
  `/api/admin/fleets/${Number(choice("modelUnitSelect").value)}`, "PUT",
  { name: field("modelUnitName").value.trim(), morale: Number(field("modelUnitMorale").value) },
);
node<HTMLButtonElement>("modelCreateFormation").onclick = () => void mutate("/api/admin/formations", "POST", {
  kind: choice("modelFormationKind").value,
  owner: { kind: "FLEET", fleetId: Number(choice("modelUnitSelect").value) },
  ...(field("modelFormationHealth").value ? { currentHealth: Number(field("modelFormationHealth").value) } : {}),
});
for (const [buttonId, action, key, source] of [
  ["modelAttachFormation", "attach-formation", "formationId", "modelFormationSelect"],
  ["modelExtractFormation", "extract-formation", "formationId", "modelAttachedFormationSelect"],
  ["modelAttachArtifact", "attach-artifact", "artifactId", "modelArtifactSelect"],
  ["modelDetachArtifact", "detach-artifact", "artifactId", "modelArtifactSelect"],
  ["modelReplaceCommander", "replace-commander", "artifactId", "modelArtifactSelect"],
] as const) {
  node<HTMLButtonElement>(buttonId).onclick = () => {
    const unitId = Number(choice("modelUnitSelect").value);
    void mutate(`/api/admin/units/${unitId}/${action}`, "POST", {
      [key]: choice(source).value,
      ...(action === "extract-formation" ? { destination: { kind: "FLEET", fleetId: unitId } } : {}),
    });
  };
}
node<HTMLButtonElement>("modelAssignDoctrines").onclick = () => void mutate(
  `/api/admin/units/${Number(choice("modelUnitSelect").value)}/doctrines`, "POST",
  { ids: csv(field("modelDoctrineSelect").value) },
);
new MutationObserver(() => {
  const visible = document.body.dataset.adminAuthenticated === "true";
  node<HTMLElement>("newModelPanel").classList.toggle("hidden", !visible);
  node<HTMLElement>("modelUnitPanel").classList.toggle("hidden", !visible);
  if (visible) void load();
}).observe(document.body, { attributes: true, attributeFilter: ["data-admin-authenticated"] });
void load();
