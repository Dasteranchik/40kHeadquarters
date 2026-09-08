import { IncomingMessage, ServerResponse } from "http";

import { setCorsHeaders, writeJson } from "./transport";

export interface ApiRouteHandlers {
  handleLogin: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleMe: (req: IncomingMessage, res: ServerResponse) => void;
  handleState: (req: IncomingMessage, res: ServerResponse) => void;
  handleLogout: (req: IncomingMessage, res: ServerResponse) => void;
  handleListPlayers: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddPlayer: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeletePlayer: (req: IncomingMessage, res: ServerResponse, playerId: string) => void;
  handleUpdatePlayer: (
    req: IncomingMessage,
    res: ServerResponse,
    playerId: string,
  ) => Promise<void>;
  handleListFactions: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddFaction: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeleteFaction: (req: IncomingMessage, res: ServerResponse, factionId: string) => void;
  handleUpdateFaction: (
    req: IncomingMessage,
    res: ServerResponse,
    factionId: string,
  ) => Promise<void>;
  handleListPlanets: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddPlanet: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeletePlanet: (req: IncomingMessage, res: ServerResponse, planetId: string) => void;
  handleUpdatePlanet: (
    req: IncomingMessage,
    res: ServerResponse,
    planetId: string,
  ) => Promise<void>;
  handleListFleets: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddFleet: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleAddArmy: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeleteFleet: (req: IncomingMessage, res: ServerResponse, fleetId: string) => void;
  handleUpdateFleet: (
    req: IncomingMessage,
    res: ServerResponse,
    fleetId: string,
  ) => Promise<void>;
  handleListRelations: (req: IncomingMessage, res: ServerResponse) => void;
  handleAddRelation: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeleteRelation: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleGetProductConversionRates: (req: IncomingMessage, res: ServerResponse) => void;
  handleUpdateProductConversionRates: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<void>;
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
  handleAdminEndTurn: (req: IncomingMessage, res: ServerResponse) => void;
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: ApiRouteHandlers,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (path === "/api/login" && method === "POST") {
    await handlers.handleLogin(req, res);
    return;
  }

  if (path === "/api/me" && method === "GET") {
    handlers.handleMe(req, res);
    return;
  }

  if (path === "/api/state" && method === "GET") {
    handlers.handleState(req, res);
    return;
  }

  if (path === "/api/logout" && method === "POST") {
    handlers.handleLogout(req, res);
    return;
  }

  if (path === "/api/admin/players" && method === "GET") {
    handlers.handleListPlayers(req, res);
    return;
  }

  if (path === "/api/admin/players" && method === "POST") {
    await handlers.handleAddPlayer(req, res);
    return;
  }

  if (path === "/api/admin/factions" && method === "GET") {
    handlers.handleListFactions(req, res);
    return;
  }

  if (path === "/api/admin/factions" && method === "POST") {
    await handlers.handleAddFaction(req, res);
    return;
  }

  if (path === "/api/admin/planets" && method === "GET") {
    handlers.handleListPlanets(req, res);
    return;
  }

  if (path === "/api/admin/planets" && method === "POST") {
    await handlers.handleAddPlanet(req, res);
    return;
  }

  if (path === "/api/admin/stations" && method === "GET") {
    handlers.handleListStations(req, res); return;
  }
  if (path === "/api/admin/stations" && method === "POST") {
    await handlers.handleAddStation(req, res); return;
  }
  if (path === "/api/admin/shipwrecks" && method === "GET") {
    handlers.handleListShipwrecks(req, res); return;
  }
  if (path === "/api/admin/anomalies" && method === "GET") {
    handlers.handleListAnomalies(req, res); return;
  }
  if (path === "/api/admin/anomalies" && method === "POST") {
    await handlers.handleAddAnomaly(req, res); return;
  }
  if (path === "/api/admin/items" && method === "POST") {
    await handlers.handleAddItem(req, res); return;
  }
  if (path === "/api/admin/audit" && method === "GET") {
    handlers.handleListAudit(req, res); return;
  }
  if (path === "/api/admin/turn-snapshots" && method === "GET") {
    handlers.handleListTurnSnapshots(req, res); return;
  }
  if (path === "/api/admin/end-turn" && method === "POST") {
    handlers.handleAdminEndTurn(req, res); return;
  }


  if (path === "/api/admin/fleets" && method === "GET") {
    handlers.handleListFleets(req, res);
    return;
  }

  if (path === "/api/admin/fleets" && method === "POST") {
    await handlers.handleAddFleet(req, res);
    return;
  }

  if (path === "/api/admin/armies" && method === "POST") {
    await handlers.handleAddArmy(req, res);
    return;
  }

  if (path === "/api/admin/relations" && method === "GET") {
    handlers.handleListRelations(req, res);
    return;
  }

  if (path === "/api/admin/relations" && method === "POST") {
    await handlers.handleAddRelation(req, res);
    return;
  }

  if (path === "/api/admin/relations" && method === "DELETE") {
    await handlers.handleDeleteRelation(req, res);
    return;
  }

  if (path === "/api/admin/product-conversion-rates" && method === "GET") {
    handlers.handleGetProductConversionRates(req, res);
    return;
  }

  if (path === "/api/admin/product-conversion-rates" && method === "PUT") {
    await handlers.handleUpdateProductConversionRates(req, res);
    return;
  }

  const factionMatch = path.match(/^\/api\/admin\/factions\/([^/]+)$/);
  if (factionMatch && method === "DELETE") {
    handlers.handleDeleteFaction(req, res, decodeURIComponent(factionMatch[1]));
    return;
  }

  if (factionMatch && method === "PUT") {
    await handlers.handleUpdateFaction(req, res, decodeURIComponent(factionMatch[1]));
    return;
  }

  const playerMatch = path.match(/^\/api\/admin\/players\/([^/]+)$/);
  if (playerMatch && method === "DELETE") {
    handlers.handleDeletePlayer(req, res, decodeURIComponent(playerMatch[1]));
    return;
  }

  if (playerMatch && method === "PUT") {
    await handlers.handleUpdatePlayer(req, res, decodeURIComponent(playerMatch[1]));
    return;
  }

  const planetMatch = path.match(/^\/api\/admin\/planets\/([^/]+)$/);
  if (planetMatch && method === "DELETE") {
    handlers.handleDeletePlanet(req, res, decodeURIComponent(planetMatch[1]));
    return;
  }

  if (planetMatch && method === "PUT") {
    await handlers.handleUpdatePlanet(req, res, decodeURIComponent(planetMatch[1]));
    return;
  }

  const fleetMatch = path.match(/^\/api\/admin\/fleets\/([^/]+)$/);
  if (fleetMatch && method === "DELETE") {
    handlers.handleDeleteFleet(req, res, decodeURIComponent(fleetMatch[1]));
    return;
  }

  if (fleetMatch && method === "PUT") {
    await handlers.handleUpdateFleet(req, res, decodeURIComponent(fleetMatch[1]));
    return;
  }

  const stationMatch = path.match(/^\/api\/admin\/stations\/([^/]+)$/);
  if (stationMatch && method === "DELETE") {
    handlers.handleDeleteStation(req, res, decodeURIComponent(stationMatch[1])); return;
  }
  if (stationMatch && method === "PUT") {
    await handlers.handleUpdateStation(req, res, decodeURIComponent(stationMatch[1])); return;
  }
  const shopMatch = path.match(/^\/api\/admin\/shops\/(PLANET|STATION)\/([^/]+)$/);
  if (shopMatch && method === "PUT") {
    await handlers.handleUpdateShop(req, res, shopMatch[1], decodeURIComponent(shopMatch[2])); return;
  }
  const artifactMatch = path.match(/^\/api\/admin\/artifacts\/([^/]+)$/);
  if (artifactMatch && method === "DELETE") {
    handlers.handleDeleteArtifact(req, res, decodeURIComponent(artifactMatch[1])); return;
  }
  const rollbackMatch = path.match(/^\/api\/admin\/turn-snapshots\/([^/]+)\/rollback$/);
  if (rollbackMatch && method === "POST") {
    handlers.handleRollbackTurnSnapshot(req, res, decodeURIComponent(rollbackMatch[1])); return;
  }

  writeJson(res, 404, { error: "Not found" });
}
