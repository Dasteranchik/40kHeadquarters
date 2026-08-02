export interface SessionInfo {
  username: string;
  role: "admin" | "player";
  playerId?: number;
  expiresAt: number;
}
