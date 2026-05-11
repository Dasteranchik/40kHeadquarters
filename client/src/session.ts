export interface SessionInfo {
  username: string;
  role: "admin" | "player";
  playerId?: string;
  expiresAt: number;
}
