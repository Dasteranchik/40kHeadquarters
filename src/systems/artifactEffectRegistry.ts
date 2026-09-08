import type { ArtifactEffect, ArtifactInstance } from "../itemDomain";
import type { GameState } from "../types";
import type { ItemActor } from "./itemSystem";

export interface ArtifactEffectContext {
  state: GameState;
  actor: ItemActor;
  artifact: ArtifactInstance;
  effect: ArtifactEffect;
}

export interface ArtifactUseResult {
  ok: boolean;
  consumed: boolean;
  message: string;
}

export type ArtifactEffectHandler = (
  context: ArtifactEffectContext,
) => { ok: boolean; message: string };

const handlers = new Map<string, ArtifactEffectHandler>();

export function registerArtifactEffect(
  effectCode: string,
  handler: ArtifactEffectHandler,
): void {
  handlers.set(effectCode, handler);
}

export function useArtifact(
  state: GameState,
  actor: ItemActor,
  artifactId: string,
): ArtifactUseResult {
  const artifact = state.artifacts[artifactId];
  if (!artifact?.useEffect) {
    return { ok: false, consumed: false, message: "Artifact has no Use action" };
  }
  if (artifact.cooldownUntilTurn && artifact.cooldownUntilTurn > state.turnNumber) {
    return { ok: false, consumed: false, message: "Artifact is on cooldown" };
  }
  const handler = handlers.get(artifact.useEffect.effectCode);
  if (!handler) {
    return {
      ok: false,
      consumed: false,
      message: `Unknown artifact effect: ${artifact.useEffect.effectCode}`,
    };
  }
  const result = handler({ state, actor, artifact, effect: artifact.useEffect });
  if (!result.ok) return { ...result, consumed: false };
  if (artifact.cooldownTurns && artifact.cooldownTurns > 0) {
    artifact.cooldownUntilTurn = state.turnNumber + artifact.cooldownTurns;
  }
  return { ok: true, consumed: artifact.consumable, message: result.message };
}
