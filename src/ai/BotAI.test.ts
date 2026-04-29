import { describe, expect, it } from 'vitest';
import { chooseBotAction } from './BotAI';
import { gunMuzzlePosition, simulateTrajectory, type TerrainQuery } from './PhysicsHelper';
import { WEAPONS } from '../models/Weapon';

const makeRng = (seq: number[]) => {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i++;
    return v;
  };
};

const emptyTerrain = (): TerrainQuery => ({
  width: 2000,
  height: 1200,
  isSolid: () => false
});

describe('BotAI', () => {
  it('chooses a reasonable shot on flat terrain', () => {
    const rng = makeRng([0.42, 0.13, 0.87, 0.55, 0.21]);
    const world = { gravity: 195, wind: 0, terrain: emptyTerrain() };
    const shooter = {
      id: 's',
      team: 'team2' as const,
      x: 200,
      y: 500,
      height: 10,
      health: 100,
      equipmentIds: ['bazooka'],
      weaponCooldowns: { bazooka: 0 }
    };
    const enemy = {
      id: 't',
      team: 'team1' as const,
      x: 520,
      y: 520,
      height: 10,
      health: 100,
      equipmentIds: [],
      weaponCooldowns: {}
    };

    const action = chooseBotAction('hard', rng, world, shooter, [enemy]);
    expect(action).not.toBeNull();
    expect(action?.weaponIndex).toBe(0);

    const a = action!;
    const global = a.facingRight ? a.aimAngle : (Math.PI - a.aimAngle);
    const muzzle = gunMuzzlePosition(shooter, global);
    const speed = a.power * 4.2 * (WEAPONS.bazooka.speedModifier || 1);
    const res = simulateTrajectory(
      world.terrain,
      {
        start: muzzle,
        velocity: { x: Math.cos(global) * speed, y: Math.sin(global) * speed },
        gravity: world.gravity,
        wind: world.wind,
        windMultiplier: WEAPONS.bazooka.windMultiplier,
        radius: 3,
        dt: 1 / 60,
        maxTime: 2.2
      },
      { x: enemy.x, y: enemy.y },
      10
    );

    expect(res.minDistToTarget).toBeLessThan(120);
  });
});

