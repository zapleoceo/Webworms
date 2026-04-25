import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsEngine } from '../src/presenters/PhysicsEngine';
import { GameState } from '../src/models/GameState';
import { Worm } from '../src/models/Worm';
import { Projectile } from '../src/models/Projectile';

describe('PhysicsEngine', () => {
  let engine: PhysicsEngine;
  let state: GameState;

  beforeEach(() => {
    engine = new PhysicsEngine();
    state = new GameState(100, 100);
  });

  it('applies gravity to worm', () => {
    const worm = new Worm(50, 50);
    state.addPlayer(worm);
    
    engine.update(state, 1); // 1 second
    
    // vy = gravity * dt
    expect(worm.vy).toBe(200);
    // Position y updates
    expect(worm.y).toBeGreaterThan(50);
  });

  it('handles ground collision', () => {
    // Solid floor at y=80 and below
    for(let x=0; x<100; x++) {
      for(let y=80; y<100; y++) {
        state.landscape.setSolid(x, y, true);
      }
    }
    
    const worm = new Worm(50, 75);
    worm.vy = 50; // falling fast
    state.addPlayer(worm);
    
    engine.update(state, 0.1);
    
    expect(worm.vy).toBe(0); // Stop falling
    expect(worm.y).toBeLessThan(80); // Pushed up from ground
  });

  it('updates projectile and handles explosion', () => {
    const proj = new Projectile(50, 50, 0, 50); // moving down
    state.projectiles.push(proj);
    
    // Create thick ground
    for(let x=0; x<100; x++) {
      for(let y=60; y<100; y++) {
        state.landscape.setSolid(x, y, true);
      }
    }
    
    // Update in small steps to not clip through floor
    for(let i=0; i<10; i++) {
      engine.update(state, 0.1);
    }
    
    // Projectile hits ground and explodes
    expect(proj.active).toBe(false);
    expect(state.projectiles.length).toBe(0); // removed from list
    // Check crater
    expect(state.landscape.isSolid(50, 60)).toBe(false);
  });
});
