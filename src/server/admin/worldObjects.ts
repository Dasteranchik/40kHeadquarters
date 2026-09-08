import type { IncomingMessage, ServerResponse } from "http";

import {
  isKnowledgeCode,
  type ArtifactEffect,
  type ArtifactInstance,
  type InventoryLocation,
  type JsonValue,
} from "../../itemDomain";
import { isResourceKey } from "../../planetDomain";
import { createEmptyShop, type DisappearingItemRef, type ShopOwnerRef } from "../../shopDomain";
import { appendAudit } from "../../systems/auditSystem";
import { resolveItemInventory } from "../../systems/itemSystem";
import { isUnitTag } from "../../unitDomain";
import {
  isStationCapability,
  type Anomaly,
  type Station,
} from "../../worldObjectDomain";
import type { Session } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import type { AdminHandlerDeps } from "./deps";
import { getTileAt, parseIntelFragments, parseResourceStore } from "./helpers";

export interface WorldObjectAdminHandlers {
  handleListStations: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddStation: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleUpdateStation: (req: IncomingMessage, res: ServerResponse, id: string) => Promise<void>;
  handleDeleteStation: (req: IncomingMessage, res: ServerResponse, id: string) => void;
  handleListShipwrecks: (req: IncomingMessage, res: ServerResponse) => void;
  handleListAnomalies: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddAnomaly: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleUpdateShop: (
    req: IncomingMessage,
    res: ServerResponse,
    kind: string,
    id: string,
  ) => Promise<void>;
  handleAddItem: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeleteArtifact: (req: IncomingMessage, res: ServerResponse, id: string) => void;
  handleListAudit: (req: IncomingMessage, res: ServerResponse) => void;
  handleListTurnSnapshots: (req: IncomingMessage, res: ServerResponse) => void;
  handleRollbackTurnSnapshot: (
    req: IncomingMessage,
    res: ServerResponse,
    snapshotId: string,
  ) => void;
}

function requirePlanningAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AdminHandlerDeps,
): Session | null {
  const session = deps.requireAdmin(req, res);
  if (!session) return null;
  if (!deps.ensurePlanningPhase(res)) return null;
  return session;
}

function isPositionValid(deps: AdminHandlerDeps, q: unknown, r: unknown): q is number {
  return Number.isFinite(q) && Number.isFinite(r) && Boolean(getTileAt(deps.state, {
    q: Math.trunc(Number(q)),
    r: Math.trunc(Number(r)),
  }));
}

function parseCapabilities(value: unknown): Station["capabilities"] | null {
  if (!Array.isArray(value) || value.some((entry) => !isStationCapability(entry))) return null;
  return [...new Set(value)];
}

function parseTags(value: unknown): Station["tags"] | null {
  if (!Array.isArray(value) || value.some((entry) => !isUnitTag(entry))) return null;
  return [...new Set(value)];
}

function parseInventoryLocation(value: unknown): InventoryLocation | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  const positive = (entry: unknown): entry is number => Number.isInteger(entry) && Number(entry) > 0;
  switch (ref.kind) {
    case "FLEET": return positive(ref.fleetId) ? { kind: "FLEET", fleetId: ref.fleetId } : null;
    case "PLANET_STORAGE": return positive(ref.planetId) && positive(ref.playerId)
      ? { kind: "PLANET_STORAGE", planetId: ref.planetId, playerId: ref.playerId }
      : null;
    case "PLANET_SHOP": return positive(ref.planetId)
      ? { kind: "PLANET_SHOP", planetId: ref.planetId }
      : null;
    case "STATION_STORAGE": return positive(ref.stationId) && positive(ref.playerId)
      ? { kind: "STATION_STORAGE", stationId: ref.stationId, playerId: ref.playerId }
      : null;
    case "STATION_SHOP": return positive(ref.stationId)
      ? { kind: "STATION_SHOP", stationId: ref.stationId }
      : null;
    case "SHIPWRECK": return positive(ref.shipwreckId)
      ? { kind: "SHIPWRECK", shipwreckId: ref.shipwreckId }
      : null;
    default: return null;
  }
}

function parseDisappearingItems(value: unknown): DisappearingItemRef[] | null {
  if (!Array.isArray(value)) return null;
  const result: DisappearingItemRef[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as { kind?: unknown; code?: unknown };
    if (entry.kind === "RESOURCE" && isResourceKey(entry.code)) {
      result.push({ kind: "RESOURCE", code: entry.code });
    } else if (entry.kind === "KNOWLEDGE" && isKnowledgeCode(entry.code)) {
      result.push({ kind: "KNOWLEDGE", code: entry.code });
    } else if (entry.kind === "ARTIFACT_DEFINITION" && typeof entry.code === "string" && entry.code) {
      result.push({ kind: "ARTIFACT_DEFINITION", code: entry.code });
    } else return null;
  }
  return result;
}

function parseArtifactEffect(value: unknown): ArtifactEffect | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.effectCode !== "string" || !candidate.effectCode.trim()
    || !candidate.params || typeof candidate.params !== "object" || Array.isArray(candidate.params)) {
    return null;
  }
  return {
    effectCode: candidate.effectCode.trim(),
    params: structuredClone(candidate.params) as Record<string, JsonValue>,
  };
}

function resolveShopOwner(deps: AdminHandlerDeps, kind: string, id: number) {
  const owner: ShopOwnerRef | null = kind === "PLANET"
    ? { kind: "PLANET", id }
    : kind === "STATION"
      ? { kind: "STATION", id }
      : null;
  if (!owner) return null;
  if (owner.kind === "PLANET") return deps.state.planets[id]?.shop ?? null;
  const station = deps.state.stations[id];
  return station?.capabilities.includes("SHOP") ? station.shop : null;
}

export function createWorldObjectAdminHandlers(
  deps: AdminHandlerDeps,
): WorldObjectAdminHandlers {
  function handleListStations(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, { stations: Object.values(deps.state.stations).sort((a, b) => a.id - b.id) });
  }

  async function handleAddStation(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const body = await readJsonBody<Record<string, unknown>>(req);
    const capabilities = parseCapabilities(body?.capabilities);
    const tags = parseTags(body?.tags ?? []);
    if (!body || typeof body.name !== "string" || !body.name.trim()
      || !isPositionValid(deps, body.q, body.r) || !capabilities || !tags) {
      writeJson(res, 400, { error: "Invalid station payload" });
      return;
    }
    const position = { q: Math.trunc(Number(body.q)), r: Math.trunc(Number(body.r)) };
    if (getTileAt(deps.state, position)?.terrainType === "OBSTACLE") {
      writeJson(res, 400, { error: "Cannot place station on obstacle tile" });
      return;
    }
    const generation = body.resourceGeneration === undefined ? {} : parseResourceStore(body.resourceGeneration, true);
    const rawStock = body.rawStock === undefined ? {} : parseResourceStore(body.rawStock, true);
    const fragments = body.infoFragments === undefined ? {} : parseIntelFragments(body.infoFragments);
    const overviewRange = Number(body.overviewRange ?? 0);
    const fleetCombatPower = Number(body.fleetCombatPower ?? 0);
    const armyCombatPower = Number(body.armyCombatPower ?? 0);
    if (!generation || !rawStock || !fragments
      || !Number.isFinite(overviewRange)
      || !Number.isFinite(fleetCombatPower)
      || !Number.isFinite(armyCombatPower)) {
      writeJson(res, 400, { error: "Invalid station stores" });
      return;
    }
    const station: Station = {
      id: deps.state.nextIds.station++,
      name: body.name.trim(),
      position,
      capabilities,
      tags: capabilities.includes("TAGS") ? tags : [],
      resourceGeneration: generation,
      rawStock,
      productStorageByPlayerId: {},
      itemStorageByPlayerId: {},
      shop: createEmptyShop(),
      infoFragments: fragments,
      overviewRange: Math.max(0, Math.trunc(overviewRange)),
      fleetCombatPower: Math.max(0, Math.trunc(fleetCombatPower)),
      armyCombatPower: Math.max(0, Math.trunc(armyCombatPower)),
    };
    deps.state.stations[station.id] = station;
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "CREATE_STATION",
      entityType: "STATION", entityId: station.id, after: station,
    });
    deps.persistDatabase(); deps.broadcastState();
    writeJson(res, 201, { station });
  }

  async function handleUpdateStation(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const station = deps.state.stations[id];
    if (!station) { writeJson(res, 404, { error: "Station not found" }); return; }
    const body = await readJsonBody<Record<string, unknown>>(req);
    if (!body) { writeJson(res, 400, { error: "Invalid station payload" }); return; }
    const before = structuredClone(station);
    const draft = structuredClone(station);
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) { writeJson(res, 400, { error: "Invalid name" }); return; }
      draft.name = body.name.trim();
    }
    if (body.capabilities !== undefined) {
      const capabilities = parseCapabilities(body.capabilities);
      if (!capabilities) { writeJson(res, 400, { error: "Invalid capabilities" }); return; }
      draft.capabilities = capabilities;
      if (!capabilities.includes("TAGS")) draft.tags = [];
    }
    if (body.tags !== undefined) {
      const tags = parseTags(body.tags);
      if (!tags || !draft.capabilities.includes("TAGS")) { writeJson(res, 400, { error: "TAGS capability is required" }); return; }
      draft.tags = tags;
    }
    if (body.resourceGeneration !== undefined) {
      const generation = parseResourceStore(body.resourceGeneration, true);
      if (!generation || !draft.capabilities.includes("RESOURCE_GENERATION")) {
        writeJson(res, 400, { error: "RESOURCE_GENERATION capability is required" }); return;
      }
      draft.resourceGeneration = generation;
    }
    if (body.rawStock !== undefined) {
      const rawStock = parseResourceStore(body.rawStock, true);
      if (!rawStock || !draft.capabilities.includes("RAW_STOCK")) {
        writeJson(res, 400, { error: "RAW_STOCK capability is required" }); return;
      }
      draft.rawStock = rawStock;
    }
    if (body.infoFragments !== undefined) {
      const fragments = parseIntelFragments(body.infoFragments);
      if (!fragments || !draft.capabilities.includes("INFO_FRAGMENTS")) {
        writeJson(res, 400, { error: "INFO_FRAGMENTS capability is required" }); return;
      }
      draft.infoFragments = fragments;
    }
    if (body.q !== undefined || body.r !== undefined) {
      const q = body.q ?? draft.position.q;
      const r = body.r ?? draft.position.r;
      if (!isPositionValid(deps, q, r)) { writeJson(res, 400, { error: "Invalid position" }); return; }
      const position = { q: Math.trunc(Number(q)), r: Math.trunc(Number(r)) };
      if (getTileAt(deps.state, position)?.terrainType === "OBSTACLE") {
        writeJson(res, 400, { error: "Cannot place station on obstacle tile" }); return;
      }
      draft.position = position;
    }
    const numericFields = ["overviewRange", "fleetCombatPower", "armyCombatPower"] as const;
    for (const field of numericFields) {
      if (body[field] !== undefined) {
        if (!Number.isFinite(body[field])) { writeJson(res, 400, { error: `${field} must be numeric` }); return; }
        draft[field] = Math.max(0, Math.trunc(Number(body[field])));
      }
    }
    deps.state.stations[id] = draft;
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "UPDATE_STATION",
      entityType: "STATION", entityId: id, before, after: draft,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 200, { station: draft });
  }

  function handleDeleteStation(req: IncomingMessage, res: ServerResponse, id: string): void {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const station = deps.state.stations[id];
    if (!station) { writeJson(res, 404, { error: "Station not found" }); return; }
    delete deps.state.stations[id];
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "DELETE_STATION",
      entityType: "STATION", entityId: id, before: station,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 200, { removedStationId: id });
  }

  function handleListShipwrecks(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, { shipwrecks: Object.values(deps.state.shipwrecks) });
  }

  function handleListAnomalies(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, { anomalies: Object.values(deps.state.anomalies) });
  }

  async function handleAddAnomaly(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const body = await readJsonBody<Record<string, unknown>>(req);
    const tags = parseTags(body?.tags ?? []);
    if (!body || !isPositionValid(deps, body.q, body.r) || !tags || typeof body.informationRef !== "string") {
      writeJson(res, 400, { error: "Invalid anomaly payload" }); return;
    }
    const anomaly: Anomaly = {
      id: deps.state.nextIds.anomaly++,
      position: { q: Math.trunc(Number(body.q)), r: Math.trunc(Number(body.r)) },
      tags,
      informationRef: body.informationRef,
    };
    deps.state.anomalies[anomaly.id] = anomaly;
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "CREATE_ANOMALY",
      entityType: "ANOMALY", entityId: anomaly.id, after: anomaly,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 201, { anomaly });
  }

  async function handleUpdateShop(
    req: IncomingMessage, res: ServerResponse, kind: string, id: string,
  ): Promise<void> {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const shop = resolveShopOwner(deps, kind, Number(id));
    if (!shop) { writeJson(res, 404, { error: "Shop not found or disabled" }); return; }
    const body = await readJsonBody<Record<string, unknown>>(req);
    if (!body) { writeJson(res, 400, { error: "Invalid Shop payload" }); return; }
    const before = structuredClone(shop);
    const draft = structuredClone(shop);
    if (body.resources !== undefined) {
      const resources = parseResourceStore(body.resources, true);
      if (!resources) { writeJson(res, 400, { error: "Invalid Shop resources" }); return; }
      draft.resources = resources;
    }
    if (body.disappearingItems !== undefined) {
      const items = parseDisappearingItems(body.disappearingItems);
      if (!items) { writeJson(res, 400, { error: "Invalid disappearingItems" }); return; }
      draft.disappearingItems = items;
    }
    if (body.knowledge !== undefined) {
      if (!Array.isArray(body.knowledge) || body.knowledge.some((entry) => !isKnowledgeCode(entry))) {
        writeJson(res, 400, { error: "Invalid Shop Knowledge list" }); return;
      }
      draft.items.knowledge = [...new Set(body.knowledge)];
    }
    Object.assign(shop, draft);
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "UPDATE_SHOP",
      entityType: kind, entityId: id, before, after: draft,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 200, { shop });
  }

  async function handleAddItem(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const body = await readJsonBody<Record<string, unknown>>(req);
    const target = parseInventoryLocation(body?.target);
    if (!body || !target) { writeJson(res, 400, { error: "Invalid target inventory" }); return; }
    if (body.kind === "KNOWLEDGE") {
      if (!isKnowledgeCode(body.code)) { writeJson(res, 400, { error: "Invalid Knowledge code" }); return; }
      const inventory = resolveItemInventory(deps.state, target, true);
      if (!inventory) { writeJson(res, 400, { error: "Invalid target inventory" }); return; }
      if (!inventory.knowledge.includes(body.code)) inventory.knowledge.push(body.code);
      appendAudit(deps.state, {
        actor: { kind: "ADMIN", account: session.username }, operation: "ADD_KNOWLEDGE",
        entityType: target.kind, entityId: JSON.stringify(target), after: body.code,
      });
      deps.persistDatabase(); deps.broadcastState(); writeJson(res, 201, { knowledge: body.code }); return;
    }
    if (body.kind !== "ARTIFACT" || typeof body.definitionCode !== "string" || !body.definitionCode
      || typeof body.name !== "string" || !body.name) {
      writeJson(res, 400, { error: "Invalid Artifact payload" }); return;
    }
    const useEffect = body.useEffect === undefined ? undefined : parseArtifactEffect(body.useEffect);
    if (body.useEffect !== undefined && !useEffect) {
      writeJson(res, 400, { error: "Invalid Artifact useEffect" }); return;
    }
    const inventory = resolveItemInventory(deps.state, target, true);
    if (!inventory) { writeJson(res, 400, { error: "Invalid target inventory" }); return; }
    const id = `artifact-${deps.state.nextIds.artifact++}`;
    const artifact: ArtifactInstance = {
      id,
      definitionCode: body.definitionCode,
      name: body.name,
      owner: target,
      configuration: {},
      consumable: body.consumable === true,
      ...(useEffect ? { useEffect } : {}),
    };
    deps.state.artifacts[id] = artifact;
    inventory.artifactIds.push(id);
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "CREATE_ARTIFACT",
      entityType: "ARTIFACT", entityId: id, after: artifact,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 201, { artifact });
  }

  function handleDeleteArtifact(req: IncomingMessage, res: ServerResponse, id: string): void {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    const artifact = deps.state.artifacts[id];
    if (!artifact) { writeJson(res, 404, { error: "Artifact not found" }); return; }
    const inventory = resolveItemInventory(deps.state, artifact.owner);
    if (inventory) inventory.artifactIds = inventory.artifactIds.filter((entry) => entry !== id);
    delete deps.state.artifacts[id];
    appendAudit(deps.state, {
      actor: { kind: "ADMIN", account: session.username }, operation: "DELETE_ARTIFACT",
      entityType: "ARTIFACT", entityId: id, before: artifact,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 200, { removedArtifactId: id });
  }

  function handleListAudit(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, { audit: deps.state.audit });
  }

  function handleListTurnSnapshots(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, {
      snapshots: deps.listTurnSnapshots().map(({ gameState, ...metadata }) => ({
        ...metadata,
        phase: gameState.phase,
      })),
    });
  }

  function handleRollbackTurnSnapshot(
    req: IncomingMessage,
    res: ServerResponse,
    snapshotId: string,
  ): void {
    const session = requirePlanningAdmin(req, res, deps);
    if (!session) return;
    if (!deps.rollbackTurnSnapshot(snapshotId, session.username)) {
      writeJson(res, 409, { error: "Snapshot is unavailable or is not a safe PLANNING snapshot" });
      return;
    }
    writeJson(res, 200, { ok: true, snapshotId });
  }

  return {
    handleListStations, handleAddStation, handleUpdateStation, handleDeleteStation,
    handleListShipwrecks, handleListAnomalies, handleAddAnomaly, handleUpdateShop,
    handleAddItem, handleDeleteArtifact, handleListAudit,
    handleListTurnSnapshots, handleRollbackTurnSnapshot,
  };
}
