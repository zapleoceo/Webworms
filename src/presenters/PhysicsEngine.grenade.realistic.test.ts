import { describe, expect, it } from 'vitest';
import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { GrenadeWeapon } from '../equipment/items/GrenadeWeapon';
import { WEAPONS } from '../models/Weapon';

describe('PhysicsEngine grenade realistic', () => {
  it('does not tunnel through a 1px wall', () => {
    const state = new GameState(400, 220);
    for (let y = 0; y < state.height; y++) {
      state.landscape.grid[y * state.width + 200] = 1;
    }
    state.landscape.revision++;

    const engine = new PhysicsEngine();
    state.wind = 0;
    state.windTarget = 0;

    const g = GrenadeWeapon.createProjectile(120, 120, 520, 0, WEAPONS.grenade);
    g.windMultiplier = 0;
    (g as any).owner = null;
    state.projectiles.push(g as any);

    for (let i = 0; i < 18; i++) engine.update(state, 1 / 60);

    expect(g.x).toBeLessThan(230);
  });

  it('slides down a slope instead of jittering in place', () => {
    const state = new GameState(500, 260);
    for (let x = 0; x < state.width; x++) {
      const yLine = Math.floor(190 + (x - 120) * 0.25);
      for (let y = yLine; y < state.height; y++) {
        state.landscape.grid[y * state.width + x] = 1;
      }
    }
    state.landscape.revision++;

    const engine = new PhysicsEngine();
    state.wind = 0;
    state.windTarget = 0;

    const g = GrenadeWeapon.createProjectile(140, 150, 0, 0, WEAPONS.grenade);
    g.windMultiplier = 0;
    g.fuseRemaining = 6;
    (g as any).owner = null;
    state.projectiles.push(g as any);

    for (let i = 0; i < 120; i++) engine.update(state, 1 / 60);

    expect(g.x).toBeGreaterThan(170);
  });
});

