import type { FleetDomain } from "./types";

export interface UnitVariant {
  id: number;
  name: string;
  domain: FleetDomain;
  description?: string;
}

