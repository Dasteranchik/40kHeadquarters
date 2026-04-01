import { coordKey } from "../hex";
import { CombatReport, Fleet, FleetStance, GameState, Player } from "../types";

function isAtWar(players: Record<string, Player>, a: string, b: string): boolean {
  if (a === b) {
    return false;
  }

  return players[a].wars.includes(b) || players[b].wars.includes(a);
}

function orderedFleetsById(fleets: Record<string, Fleet>): Fleet[] {
  return Object.values(fleets).sort((a, b) => a.id.localeCompare(b.id));
}

function groupFleetsByTile(state: GameState): Map<string, Fleet[]> {
  const byTile = new Map<string, Fleet[]>();

  for (const fleet of orderedFleetsById(state.fleets)) {
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
  const damageByFleetId = new Map<string, number>();
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
        continue;
      }

      const damagePerEnemy = splitDamage(attacker, enemies.length);
      for (const target of enemies) {
        damageByFleetId.set(
          target.id,
          (damageByFleetId.get(target.id) ?? 0) + damagePerEnemy,
        );
      }
    }
  }

  const damageEvents: CombatReport["damageEvents"] = [];
  const destroyedFleetIds: string[] = [];
  const sortedDamage = [...damageByFleetId.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [fleetId, damage] of sortedDamage) {
    const fleet = state.fleets[fleetId];
    if (!fleet) {
      continue;
    }

    fleet.health -= damage;
    damageEvents.push({
      fleetId,
      damage,
      healthAfter: fleet.health,
    });

    if (fleet.health <= 0) {
      destroyedFleetIds.push(fleetId);
    }
  }

  for (const fleetId of destroyedFleetIds) {
    delete state.fleets[fleetId];
  }

  return {
    damageEvents,
    destroyedFleetIds,
  };
}