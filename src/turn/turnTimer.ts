import { DEFAULT_TURN_DURATION_MS, type TurnTimerState } from "../turnTimerDomain";
import type { GameState } from "../types";

type TimerHandle = ReturnType<typeof setTimeout>;

export interface TurnTimerScheduler {
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
}

export interface TurnTimerController {
  restore: () => void;
  startNewPlanning: (persist?: boolean, schedule?: boolean) => void;
  cancel: () => void;
  getDeadline: () => TurnTimerState;
}

export interface TurnTimerDeps {
  state: GameState;
  onElapsed: () => void;
  persist: () => void;
  now?: () => number;
  scheduler?: TurnTimerScheduler;
}

export function createTurnTimerController(deps: TurnTimerDeps): TurnTimerController {
  const now = deps.now ?? Date.now;
  const scheduler = deps.scheduler ?? {
    setTimer: setTimeout,
    clearTimer: clearTimeout,
  };
  let handle: TimerHandle | null = null;
  let elapsedQueued = false;
  let scheduleGeneration = 0;

  function cancel(): void {
    scheduleGeneration += 1;
    if (handle) scheduler.clearTimer(handle);
    handle = null;
    elapsedQueued = false;
  }

  function scheduleExistingDeadline(): void {
    if (deps.state.phase !== "PLANNING" || handle || elapsedQueued) return;
    const remaining = deps.state.turnTimer.turnEndsAt - now();
    if (remaining <= 0) {
      const generation = scheduleGeneration;
      elapsedQueued = true;
      queueMicrotask(() => {
        if (!elapsedQueued || generation !== scheduleGeneration) return;
        elapsedQueued = false;
        deps.onElapsed();
      });
      return;
    }
    const generation = scheduleGeneration;
    handle = scheduler.setTimer(() => {
      if (generation !== scheduleGeneration) return;
      handle = null;
      deps.onElapsed();
    }, remaining);
  }

  function restore(): void {
    cancel();
    scheduleExistingDeadline();
  }

  function startNewPlanning(persist = true, schedule = true): void {
    cancel();
    const startedAt = now();
    const durationMs = Math.max(
      1,
      Math.trunc(deps.state.turnTimer.durationMs || DEFAULT_TURN_DURATION_MS),
    );
    deps.state.turnTimer = {
      durationMs,
      turnStartedAt: startedAt,
      turnEndsAt: startedAt + durationMs,
    };
    if (persist) deps.persist();
    if (schedule) scheduleExistingDeadline();
  }

  return {
    restore,
    startNewPlanning,
    cancel,
    getDeadline: () => ({ ...deps.state.turnTimer }),
  };
}
