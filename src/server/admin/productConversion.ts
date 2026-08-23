import type { IncomingMessage, ServerResponse } from "http";

import {
  DEFAULT_PRODUCT_CONVERSION_RATES,
  PRODUCT_RESOURCE_KEYS,
  roundConversionRate,
} from "../../planetDomain";
import type { ProductConversionRates } from "../../planetDomain";
import type { UpdateProductConversionRatesRequest } from "../contracts";
import { readJsonBody, writeJson } from "../transport";
import type { AdminHandlerDeps } from "./deps";
import { requireAdminPlanning } from "./deps";

export interface ProductConversionAdminHandlers {
  handleGetProductConversionRates: (req: IncomingMessage, res: ServerResponse) => void;
  handleUpdateProductConversionRates: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<void>;
}

function parseRates(value: unknown): ProductConversionRates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const allowedKeys = new Set<string>(PRODUCT_RESOURCE_KEYS);
  if (Object.keys(source).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const rates: ProductConversionRates = { ...DEFAULT_PRODUCT_CONVERSION_RATES };
  for (const key of PRODUCT_RESOURCE_KEYS) {
    const rate = source[key];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    const roundedRate = roundConversionRate(rate);
    if (roundedRate <= 0) {
      return null;
    }
    rates[key] = roundedRate;
  }

  return rates;
}

export function createProductConversionAdminHandlers(
  deps: AdminHandlerDeps,
): ProductConversionAdminHandlers {
  function handleGetProductConversionRates(
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    writeJson(res, 200, { rates: deps.state.productConversionRates });
  }

  async function handleUpdateProductConversionRates(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<UpdateProductConversionRatesRequest>(req);
    const rates = parseRates(body?.rates);
    if (!rates) {
      writeJson(res, 400, {
        error: "rates must contain one positive finite number for every product",
      });
      return;
    }

    deps.state.productConversionRates = rates;
    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { rates });
  }

  return {
    handleGetProductConversionRates,
    handleUpdateProductConversionRates,
  };
}
