import { describe, expect, it } from 'vitest';
import { DEFAULT_BOT_CONFIG } from '../BotConfig';
import { mulberry32 } from '../../utils/SeededRng';
import { planWithMcts } from './MctsPlanner';

describe('planWithMcts', () => {
  it('returns a plan in a simple scenario', () => {
    const w = 320;
    const h = 200;
    const terrain = {
      width: w,
      height: h,
      isSolid: (x: number, y: number) => {
        if (y < 0) return false;
        if (x < 0 || x >= w || y >= h) return true;
        return y >= 140;
      }
    };
    const world = { gravity: 300, wind: 0, terrain, teamAmmo: { team1: { grenade: 15 }, team2: { grenade: 15 } } as any };
    const shooter: any = {
      id: 's',
      team: 'team2',
      x: 80,
      y: 120,
      width: 10,
      height: 10,
      health: 100,
      speedMultiplier: 1,
      equipmentIds: ['bazooka', 'shotgun', 'minigun', 'homing_missile', 'heavy_gun', 'handgun', 'grenade', 'plasma_gun', 'flamethrower', 'ninja_rope'],
      weaponCooldowns: {}
    };
    const enemy: any = { ...shooter, id: 'e', team: 'team1', x: 240, y: 120 };
    const rng = mulberry32(123);

    const plan = planWithMcts({
      rng,
      world: world as any,
      shooter,
      enemies: [enemy],
      allies: [shooter],
      botCfg: DEFAULT_BOT_CONFIG,
      difficulty: 'easy',
      moveSeconds: 6,
      ropeAttachBudget: 0,
      shotMemory: []
    });

    expect(plan).toBeTruthy();
    expect(plan?.action || plan?.moveTo).toBeTruthy();
  });
});

