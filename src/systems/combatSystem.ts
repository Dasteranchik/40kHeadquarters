import { coordKey } from "../hex";
import { CombatReport, Fleet, FleetStance, GameState, Player } from "../types";
import { salvageDestroyedUnits } from "./shipwreckSystem";
import { applyFormationDamage } from "./unitCompositionSystem";
import { synchronizeUnitProjection } from "./unitEffectSystem";

function isAtWar(players: Record<string, Player>, a: number, b: number): boolean {
  if (a === b) {
    return false;
  }

  return players[a].wars.includes(b) || players[b].wars.includes(a);
}

function orderedFleetsById(fleets: Record<string, Fleet>): Fleet[] {
  return Object.values(fleets).sort((a, b) => a.id - b.id);
}

function groupFleetsByTile(state: GameState): Map<string, Fleet[]> {
  const byTile = new Map<string, Fleet[]>();

  for (const fleet of orderedFleetsById(state.fleets)) {
    if (fleet.domain === "GROUND" && fleet.carrierFleetId) {
      continue;
    }
    const key = coordKey(fleet.position);
    const list = byTile.get(key);
    if (list) {
      list.push(fleet);
      continue;
    }

    byTile.set(key, [fleet]);
  }

  return byTile;
}

function normalizedStance(stance: FleetStance | undefined): FleetStance {
  return stance === "DEFENSE" ? "DEFENSE" : "ATTACK";
}

function oneOnOneDamage(attacker: Fleet, defender: Fleet): number {
  const attackerStance = normalizedStance(attacker.stance);
  const defenderStance = normalizedStance(defender.stance);

  if (attackerStance === "ATTACK" && defenderStance === "ATTACK") {
    return Math.max(0, Math.floor(attacker.combatPower));
  }

  return Math.max(0, Math.floor(attacker.combatPower / 2));
}

function splitDamage(attacker: Fleet, enemyCount: number): number {
  const power = Math.max(0, Math.floor(attacker.combatPower));
  const stance = normalizedStance(attacker.stance);

  const raw =
    stance === "ATTACK"
      ? Math.floor(power / enemyCount)
      : Math.floor(power / enemyCount / 2);

  return Math.max(1, raw);
}

function hostileFleetsFor(
  players: Record<string, Player>,
  fleet: Fleet,
  tileFleets: Fleet[],
): Fleet[] {
  return tileFleets.filter(
    (other) =>
      other.id !== fleet.id &&
      isAtWar(players, fleet.ownerPlayerId, other.ownerPlayerId),
  );
}

export function resolveCombat(state: GameState): CombatReport {
  for (const unit of Object.values(state.fleets)) synchronizeUnitProjection(state, unit.id);
  const damageByFleetId = new Map<number, number>();
  const attackerIdsByFleetId = new Map<number, Set<number>>();
  const fleetsByTile = groupFleetsByTile(state);

  for (const tileFleets of fleetsByTile.values()) {
    if (tileFleets.length < 2) {
      continue;
    }

    for (const attacker of tileFleets) {
      const enemies = hostileFleetsFor(state.players, attacker, tileFleets);
      if (enemies.length === 0) {
        continue;
      }

      if (enemies.length === 1) {
        const target = enemies[0];
        const damage = oneOnOneDamage(attacker, target);
        if (damage <= 0) {
          continue;
        }

        damageByFleetId.set(
          target.id,
          (damageByFleetId.get(target.id) ?? 0) + damage,
        );
        const attackerIds = attackerIdsByFleetId.get(target.id) ?? new Set<number>();
        attackerIds.add(attacker.id);
        attackerIdsByFleetId.set(target.id, attackerIds);
        continue;
      }

      const damagePerEnemy = splitDamage(attacker, enemies.length);
      for (const target of enemies) {
        damageByFleetId.set(
          target.id,
          (damageByFleetId.get(target.id) ?? 0) + damagePerEnemy,
        );
        const attackerIds = attackerIdsByFleetId.get(target.id) ?? new Set<number>();
        attackerIds.add(attacker.id);
        attackerIdsByFleetId.set(target.id, attackerIds);
      }
    }
  }

  const damageEvents: CombatReport["damageEvents"] = [];
  const destroyedFleetIds: number[] = [];
  const sortedDamage = [...damageByFleetId.entries()].sort(([a], [b]) =>
    a - b,
  );

  for (const [fleetId, damage] of sortedDamage) {
    const fleet = state.fleets[fleetId];
    if (!fleet) {
      continue;
    }

    const hasFormations = (fleet.formationIds ?? []).length > 0;
    const applied = hasFormations ? applyFormationDamage(state, fleetId, damage) : null;
    if (!applied) {
      // TODO(UNIT-VARIANT-MIGRATION): old Units without Formation instances
      // retain their legacy combat pool until an explicit conversion exists.
      fleet.health -= damage;
    }
    damageEvents.push({
      fleetId,
      attackerFleetIds: [...(attackerIdsByFleetId.get(fleetId) ?? [])],
      damage: applied?.actualLostHealth ?? damage,
      healthAfter: fleet.health,
    });

    if (fleet.health <= 0 || (hasFormations && (fleet.formationIds ?? []).length === 0)) {
      destroyedFleetIds.push(fleetId);
    }
  }

  const allDestroyed = new Set(destroyedFleetIds);
  for (const army of Object.values(state.fleets)) {
    if (army.domain === "GROUND" && army.carrierFleetId && allDestroyed.has(army.carrierFleetId)) {
      allDestroyed.add(army.id);
    }
  }
  const finalDestroyedFleetIds = [...allDestroyed].sort((a, b) => a - b);
  const destroyedUnits = finalDestroyedFleetIds
    .map((fleetId) => state.fleets[fleetId])
    .filter((unit): unit is Fleet => Boolean(unit));
  const createdShipwreckIds = salvageDestroyedUnits(state, destroyedUnits).map((wreck) => wreck.id);
  for (const fleetId of finalDestroyedFleetIds) delete state.fleets[fleetId];

  return {
    damageEvents,
    destroyedFleetIds: finalDestroyedFleetIds,
    createdShipwreckIds,
  };
}
