import type { IncomingMessage, ServerResponse } from "node:http";

import type { UnitVariant } from "../../unitVariantDomain";
import { readJsonBody, writeJson } from "../transport";
import type { AdminHandlerDeps } from "./deps";
import { requireAdminPlanning } from "./deps";

interface UnitVariantBody {
  name?: unknown;
  domain?: unknown;
  description?: unknown;
}

export interface UnitVariantAdminHandlers {
  handleListUnitVariants(req: IncomingMessage, res: ServerResponse): void;
  handleAddUnitVariant(req: IncomingMessage, res: ServerResponse): Promise<void>;
  handleUpdateUnitVariant(req: IncomingMessage, res: ServerResponse, id: string): Promise<void>;
  handleDeleteUnitVariant(req: IncomingMessage, res: ServerResponse, id: string): void;
}

export function createUnitVariantAdminHandlers(deps: AdminHandlerDeps): UnitVariantAdminHandlers {
  function handleListUnitVariants(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) return;
    writeJson(res, 200, { unitVariants: Object.values(deps.state.unitVariants).sort((a, b) => a.id - b.id) });
  }

  async function handleAddUnitVariant(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) return;
    const body = await readJsonBody<UnitVariantBody>(req);
    if (!body || typeof body.name !== "string" || !body.name.trim()
      || (body.domain !== "SPACE" && body.domain !== "GROUND")
      || (body.description !== undefined && typeof body.description !== "string")) {
      writeJson(res, 400, { error: "Invalid UnitVariant payload" });
      return;
    }
    const description = typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : undefined;
    const variant: UnitVariant = {
      id: deps.state.nextIds.unitVariant++,
      name: body.name.trim(),
      domain: body.domain,
      ...(description ? { description } : {}),
    };
    deps.state.unitVariants[variant.id] = variant;
    deps.auditAdminMutation(req, {
      operation: "CREATE_UNIT_VARIANT", entityType: "UNIT_VARIANT", entityId: variant.id, after: variant,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 201, { unitVariant: variant });
  }

  async function handleUpdateUnitVariant(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) return;
    const current = deps.state.unitVariants[id];
    if (!current) { writeJson(res, 404, { error: "UnitVariant not found" }); return; }
    const body = await readJsonBody<UnitVariantBody>(req);
    if (!body
      || (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim()))
      || (body.domain !== undefined && body.domain !== "SPACE" && body.domain !== "GROUND")
      || (body.description !== undefined && typeof body.description !== "string")) {
      writeJson(res, 400, { error: "Invalid UnitVariant payload" }); return;
    }
    const nextDomain = body.domain ?? current.domain;
    const usedBy = Object.values(deps.state.fleets).find((unit) => unit.unitVariantId === current.id);
    if (usedBy && nextDomain !== current.domain) {
      writeJson(res, 409, { error: `UnitVariant is assigned to unit ${usedBy.id}; clear assignments before changing domain` });
      return;
    }
    const before = structuredClone(current);
    if (typeof body.name === "string") current.name = body.name.trim();
    current.domain = nextDomain;
    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (description) current.description = description;
      else delete current.description;
    }
    deps.auditAdminMutation(req, {
      operation: "UPDATE_UNIT_VARIANT", entityType: "UNIT_VARIANT", entityId: current.id, before, after: current,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 200, { unitVariant: current });
  }

  function handleDeleteUnitVariant(req: IncomingMessage, res: ServerResponse, id: string): void {
    if (!requireAdminPlanning(req, res, deps)) return;
    const variant = deps.state.unitVariants[id];
    if (!variant) { writeJson(res, 404, { error: "UnitVariant not found" }); return; }
    for (const unit of Object.values(deps.state.fleets)) {
      if (unit.unitVariantId === variant.id) delete unit.unitVariantId;
    }
    delete deps.state.unitVariants[id];
    deps.auditAdminMutation(req, {
      operation: "DELETE_UNIT_VARIANT", entityType: "UNIT_VARIANT", entityId: variant.id, before: variant,
    });
    deps.persistDatabase(); deps.broadcastState(); writeJson(res, 200, { removedUnitVariantId: variant.id });
  }

  return { handleListUnitVariants, handleAddUnitVariant, handleUpdateUnitVariant, handleDeleteUnitVariant };
}

