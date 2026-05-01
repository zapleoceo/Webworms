import { describe, expect, it } from 'vitest';
import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';

describe('PhysicsEngine minimum explosion damage', () => {
  it('applies at least 1 HP when in explosion radius (even at edge)', () => {
    const state = new GameState(200, 200);
    const engine = new PhysicsEngine();
    const worm = new Worm(15, 0, false, 'P', 'soldier', ['bazooka'], 'team1');
    worm.width = 10;
    worm.height = 10;
    worm.health = 100;
    worm.maxHealth = 100;
    state.players = [worm];

    engine.explodeAt(
      state,
      0,
      0,
      { weaponId: 'bazooka', damage: 10, explosionRadius: 10, knockback: 0, crater: false, owner: null },
      1.0
    );

    expect(worm.health).toBe(99);
  });
});

