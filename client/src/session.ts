export interface SessionInfo {
  token: string;
  username: string;
  role: "admin" | "player";
  playerId?: string;
  expiresAt: number;
}

export const SESSION_STORAGE_KEY = "hq_session";
