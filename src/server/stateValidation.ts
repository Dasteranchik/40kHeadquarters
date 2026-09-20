import { isPasswordHash } from "../auth/password";
import { CURRENT_SCHEMA_VERSION, type DocumentSnapshot } from "../storage/snapshot";

export class StateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateValidationError";
  }
}

export function validateDocumentSnapshot(snapshot: DocumentSnapshot): void {
  if (snapshot.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new StateValidationError("Candidate has an unsupported schema version");
  }
  if (!Number.isInteger(snapshot.gameState.turnNumber) || snapshot.gameState.turnNumber < 0) {
    throw new StateValidationError("Candidate has an invalid turn number");
  }
  if (!(["PLANNING", "RESOLUTION", "UPDATE"] as const).includes(snapshot.gameState.phase)) {
    throw new StateValidationError("Candidate has an invalid game phase");
  }
  for (const [username, account] of Object.entries(snapshot.accounts)) {
    if (username !== account.username || !username) {
      throw new StateValidationError(`Candidate has an invalid account key: ${username}`);
    }
    if (account.role !== "admin" && account.role !== "player") {
      throw new StateValidationError(`Candidate has an invalid account role: ${username}`);
    }
    if (!isPasswordHash(account.passwordHash)) {
      throw new StateValidationError(`Candidate contains a non-hashed password: ${username}`);
    }
    if (
      account.role === "player"
      && (!account.playerId || !snapshot.gameState.players[account.playerId])
    ) {
      throw new StateValidationError(`Candidate account references an unknown player: ${username}`);
    }
  }
  for (const [token, session] of Object.entries(snapshot.sessions ?? {})) {
    const account = snapshot.accounts[session.username];
    if (
      token !== session.token
      || !account
      || account.role !== session.role
      || account.playerId !== session.playerId
    ) {
      throw new StateValidationError(`Candidate contains an invalid session: ${token}`);
    }
  }
}
