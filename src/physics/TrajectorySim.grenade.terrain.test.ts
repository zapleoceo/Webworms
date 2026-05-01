import { describe, expect, it } from 'vitest';
import { simulateTrajectory } from './TrajectorySim';

describe('TrajectorySim grenade terrain', () => {
  it('hits a thin wall without tunneling', () => {
    const terrain = {
      width: 800,
      height: 600,
      getMaterial: (x: number, y: number) => {
        if (y < 0 || y >= 600) return 0;
        if (x === 200) return 1;
        return 0;
      }
    };

    const res = simulateTrajectory(
      terrain as any,
      {
        mode: 'grenade',
        start: { x: 120, y: 120 },
        velocity: { x: 520, y: 0 },
        radius: 7,
        dt: 1 / 30,
        gravity: 195,
        wind: 0,
        windMultiplier: 0,
        grenade: { fuseSeconds: 0.35, restitution: 0.45, friction: 0.85, stopSpeed: 18 }
      } as any,
      { x: 700, y: 120 },
      10
    );

    expect(res.hitTerrain).toBe(true);
    expect(res.end.x).toBeLessThan(280);
  });
});
