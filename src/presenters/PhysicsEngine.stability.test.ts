import { describe, expect, test } from 'vitest';
import { GameState } from '../models/GameState';
import { Landscape } from '../models/Landscape';
import { PhysicsEngine } from './PhysicsEngine';
import { Projectile } from '../models/Projectile';
import { WEAPONS } from '../models/Weapon';
import { PhysicsProp } from '../models/PhysicsProp';

function fillGround(land: Landscape, groundY: number) {
  for (let y = groundY; y < land.height; y++) {
    for (let x = 0; x < land.width; x++) {
      land.setMaterial(x, y, 1);
    }
  }
}

function isBoxInsideTerrain(land: Landscape, cx: number, cy: number, hw: number, hh: number): boolean {
  const left = Math.floor(cx - hw);
  const right = Math.floor(cx + hw);
  const top = Math.floor(cy - hh);
  const bottom = Math.floor(cy + hh);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (land.getMaterial(x, y) > 0) return true;
    }
  }
  return false;
}

describe('PhysicsEngine stability', () => {
  test('dt spike does not keep worm embedded in terrain after resolution', () => {
    const state = new GameState(300, 300);
    state.landscape = new Landscape(300, 300);
    fillGround(state.landscape, 200);

    const worm: any = {
      x: 150,
      y: 230,
      vx: 0,
      vy: 0,
      width: 12,
      height: 20,
      health: 100,
      isJumping: false,
      isFallingSoundPlaying: false,
      walkCycle: 0,
      ropeActive: false,
      ropeLength: 0,
      ropeCastTime: 0
    };
    state.players = [worm];
    state.currentPlayerIndex = 0;

    const prop = new PhysicsProp(150, 230, 'rock');
    prop.vx = 0;
    prop.vy = 0;
    state.props = [prop];

    const physics = new PhysicsEngine();
    physics.update(state, 0.2);

    expect(isBoxInsideTerrain(state.landscape, worm.x, worm.y, 6, 10)).toBe(false);
  });

  test('fast projectile does not tunnel through thin wall', () => {
    const state = new GameState(300, 300);
    state.landscape = new Landscape(300, 300);
    fillGround(state.landscape, 290);
    for (let y = 0; y < 290; y++) {
      state.landscape.setMaterial(150, y, 1);
    }
    state.players = [];
    state.currentPlayerIndex = -1 as any;

    const proj = new Projectile(50, 140, 2200, 0, WEAPONS.bazooka);
    proj.radius = 3;
    state.projectiles = [proj];

    const physics = new PhysicsEngine();
    physics.update(state, 0.12);

    expect(state.projectiles.length).toBe(0);
    expect(state.explosions.length).toBeGreaterThan(0);
  });
});

