export const DEFAULT_TURN_DURATION_MS = 60 * 60 * 1000;

export interface TurnTimerState {
  durationMs: number;
  turnStartedAt: number;
  turnEndsAt: number;
}

export type TurnFinishReason = "TIMER" | "ADMIN_OVERRIDE";
