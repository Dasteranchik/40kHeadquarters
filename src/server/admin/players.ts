import { IncomingMessage, ServerResponse } from "http";

import { Player } from "../../types";
import { removeFromArray } from "../../utils/relations";
import { isFiniteNumber, isPlayerAlignment, isValidId } from "../../utils/validation";
import {
  Account,
  AddPlayerRequest,
  UpdatePlayerRequest,
} from "../contracts";
import { clearAllianceProposalsForPlayer } from "../immediateDiplomacy";
import { readJsonBody, writeJson } from "../transport";
import { AdminHandlerDeps, requireAdminPlanning } from "./deps";
import {
  findPlayerAccount,
  getDefaultFactionId,
  removeAccountsForPlayer,
} from "./helpers";

export interface PlayerAdminHandlers {
  handleAddPlayer: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDeletePlayer: (req: IncomingMessage, res: ServerResponse, playerId: string) => void;
  handleListPlayers: (req: IncomingMessage, res: ServerResponse) => void;
  handleUpdatePlayer: (
    req: IncomingMessage,
    res: ServerResponse,
    playerId: string,
  ) => Promise<void>;
}

export function createPlayerAdminHandlers(deps: AdminHandlerDeps): PlayerAdminHandlers {
  async function handleAddPlayer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const body = await readJsonBody<AddPlayerRequest>(req);
    if (!body || typeof body.id !== "string" || typeof body.name !== "string") {
      writeJson(res, 400, { error: "Invalid player payload" });
      return;
    }

    if (!isValidId(body.id)) {
      writeJson(res, 400, { error: "Player id must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (deps.state.players[body.id]) {
      writeJson(res, 409, { error: "Player id already exists" });
      return;
    }

    if (body.alignment !== undefined && !isPlayerAlignment(body.alignment)) {
      writeJson(res, 400, { error: "alignment must be IMPERIAL or NON_IMPERIAL" });
      return;
    }

    if (body.factionId !== undefined && !isValidId(body.factionId)) {
      writeJson(res, 400, { error: "factionId must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (body.factionId !== undefined && !deps.state.factions[body.factionId]) {
      writeJson(res, 400, { error: "factionId is invalid" });
      return;
    }

    const defaultFactionId = body.factionId ?? getDefaultFactionId(deps.state);
    if (!defaultFactionId) {
      writeJson(res, 400, { error: "No factions configured" });
      return;
    }

    const username = body.username ?? body.id;
    const password = body.password ?? body.id;

    if (!isValidId(username)) {
      writeJson(res, 400, { error: "Username must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (deps.accounts.has(username)) {
      writeJson(res, 409, { error: "Username already exists" });
      return;
    }

    const player: Player = {
      id: body.id,
      name: body.name,
      resources: 100,
      alliances: [],
      wars: [],
      exploredTiles: [],
      alignment: body.alignment ?? "NON_IMPERIAL",
      factionId: defaultFactionId,
      intelFragments: {},
    };

    deps.state.players[player.id] = player;
    deps.accounts.set(username, {
      username,
      password,
      role: "player",
      playerId: player.id,
    });

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 201, { player, login: { username, password } });
  }

  function handleDeletePlayer(req: IncomingMessage, res: ServerResponse, playerId: string): void {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const player = deps.state.players[playerId];
    if (!player) {
      writeJson(res, 404, { error: "Player not found" });
      return;
    }

    delete deps.state.players[playerId];

    for (const other of Object.values(deps.state.players)) {
      removeFromArray(other.alliances, playerId);
      removeFromArray(other.wars, playerId);
    }

    for (const [fleetId, fleet] of Object.entries(deps.state.fleets)) {
      if (fleet.ownerPlayerId === playerId) {
        delete deps.state.fleets[fleetId];
      }
    }

    for (const [actionId, action] of deps.pendingActions.entries()) {
      if (action.playerId === playerId) {
        deps.pendingActions.delete(actionId);
      }
    }

    deps.readyPlayers.delete(playerId);
    removeAccountsForPlayer(deps.accounts, playerId);
    deps.removeSessionsForPlayer(playerId);
    clearAllianceProposalsForPlayer(deps.pendingAllianceProposals, playerId);
    deps.state.pendingInformantActions = deps.state.pendingInformantActions.filter(
      (entry) => entry.playerId !== playerId,
    );
    deps.state.pendingTitheChanges = deps.state.pendingTitheChanges.filter(
      (entry) => entry.requestedByPlayerId !== playerId,
    );

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, { removedPlayerId: playerId });
  }

  function handleListPlayers(req: IncomingMessage, res: ServerResponse): void {
    if (!deps.requireAdmin(req, res)) {
      return;
    }

    const loginByPlayerId = new Map<string, { username: string; password: string }>();
    for (const account of deps.accounts.values()) {
      if (account.role === "player" && account.playerId) {
        loginByPlayerId.set(account.playerId, {
          username: account.username,
          password: account.password,
        });
      }
    }

    const players = Object.values(deps.state.players)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((player) => ({
        ...player,
        login: loginByPlayerId.get(player.id) ?? null,
      }));

    writeJson(res, 200, { players });
  }

  async function handleUpdatePlayer(
    req: IncomingMessage,
    res: ServerResponse,
    playerId: string,
  ): Promise<void> {
    if (!requireAdminPlanning(req, res, deps)) {
      return;
    }

    const player = deps.state.players[playerId];
    if (!player) {
      writeJson(res, 404, { error: "Player not found" });
      return;
    }

    const body = await readJsonBody<UpdatePlayerRequest>(req);
    if (!body) {
      writeJson(res, 400, { error: "Invalid player payload" });
      return;
    }

    if (body.name !== undefined && typeof body.name !== "string") {
      writeJson(res, 400, { error: "name must be a string" });
      return;
    }

    if (body.resources !== undefined && !isFiniteNumber(body.resources)) {
      writeJson(res, 400, { error: "resources must be a number" });
      return;
    }

    if (body.username !== undefined && typeof body.username !== "string") {
      writeJson(res, 400, { error: "username must be a string" });
      return;
    }

    if (body.password !== undefined && typeof body.password !== "string") {
      writeJson(res, 400, { error: "password must be a string" });
      return;
    }

    if (body.alignment !== undefined && !isPlayerAlignment(body.alignment)) {
      writeJson(res, 400, { error: "alignment must be IMPERIAL or NON_IMPERIAL" });
      return;
    }

    if (body.factionId !== undefined && !isValidId(body.factionId)) {
      writeJson(res, 400, { error: "factionId must match [a-zA-Z0-9_-]{2,32}" });
      return;
    }

    if (body.factionId !== undefined && !deps.state.factions[body.factionId]) {
      writeJson(res, 400, { error: "factionId is invalid" });
      return;
    }

    if (body.name !== undefined) {
      player.name = body.name.trim() || player.name;
    }

    if (body.resources !== undefined) {
      player.resources = Math.max(0, Math.trunc(body.resources));
    }

    if (body.alignment !== undefined) {
      player.alignment = body.alignment;
    }

    if (body.factionId !== undefined) {
      player.factionId = body.factionId;
    }

    let entry = findPlayerAccount(deps.accounts, playerId);
    if (!entry) {
      if (deps.accounts.has(playerId)) {
        writeJson(res, 409, { error: "Default username is occupied by another account" });
        return;
      }

      const fallback: Account = {
        username: playerId,
        password: playerId,
        role: "player",
        playerId,
      };
      deps.accounts.set(fallback.username, fallback);
      entry = [fallback.username, fallback];
    }

    const [currentUsername, currentAccount] = entry;
    const requestedUsername = body.username?.trim();
    if (requestedUsername !== undefined) {
      if (!requestedUsername || !isValidId(requestedUsername)) {
        writeJson(res, 400, { error: "Username must match [a-zA-Z0-9_-]{2,32}" });
        return;
      }

      if (requestedUsername !== currentUsername && deps.accounts.has(requestedUsername)) {
        writeJson(res, 409, { error: "Username already exists" });
        return;
      }
    }

    const nextUsername = requestedUsername ?? currentUsername;
    const nextPassword = body.password ?? currentAccount.password;

    if (nextUsername !== currentUsername) {
      deps.accounts.delete(currentUsername);
    }

    deps.accounts.set(nextUsername, {
      username: nextUsername,
      password: nextPassword,
      role: "player",
      playerId,
    });

    const login = findPlayerAccount(deps.accounts, playerId)?.[1] ?? null;

    deps.persistDatabase();
    deps.broadcastState();
    writeJson(res, 200, {
      player,
      login: login
        ? {
            username: login.username,
            password: login.password,
          }
        : null,
    });
  }

  return {
    handleAddPlayer,
    handleDeletePlayer,
    handleListPlayers,
    handleUpdatePlayer,
  };
}
