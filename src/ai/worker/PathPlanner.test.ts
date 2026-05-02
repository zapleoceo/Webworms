import { describe, expect, it } from 'vitest';
import { findWaypointPath } from './PathPlanner';

describe('findWaypointPath', () => {
  it('finds a jump path around a wall', () => {
    const w = 320;
    const h = 200;
    const terrain = {
      width: w,
      height: h,
      isSolid: (x: number, y: number) => {
        if (y < 0) return false;
        if (x < 0 || x >= w || y >= h) return true;
        if (y >= 140) return true;
        if (x >= 160 && x <= 164 && y >= 110 && y < 140) return true;
        return false;
      }
    };

    const start = { x: 120, y: 120 };
    const goal = { x: 220, y: 120 };
    const path = findWaypointPath(terrain as any, start, goal, 10, 10, 16, false);

    expect(path).toBeTruthy();
    expect(path?.waypoints?.length).toBeGreaterThan(0);
    expect(path?.primitive).toBe('jump');
    const last = path?.waypoints[path.waypoints.length - 1];
    expect(last?.x).toBeGreaterThan(180);
  });
});

