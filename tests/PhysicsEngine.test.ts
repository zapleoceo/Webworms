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
    
    // Position y updates (falls to ground or off map)
    expect(worm.y).toBeGreaterThan(50);
  });

  it('handles ground collision and fall damage', () => {
    // Solid floor at y=80 and below
    for(let x=0; x<100; x++) {
      for(let y=80; y<100; y++) {
        state.landscape.setSolid(x, y, true);
      }
    }
    
    const worm = new Worm(50, 75);
    worm.vy = engine.safeFallSpeed + 50; // falling too fast (takes damage)
    state.addPlayer(worm);
    
    // Simulate physics in small steps
    engine.update(state, 0.05);
    
    expect(worm.y).toBeLessThan(80); // Pushed up from ground
    expect(worm.vy).toBe(0); // Stop falling
    expect(worm.health).toBeLessThan(100); // Took fall damage
  });

  it('prevents walking up steep slopes', () => {
    // Create a 90 degree wall at x=60
    for(let x=60; x<100; x++) {
      for(let y=50; y<100; y++) {
        state.landscape.setSolid(x, y, true);
      }
    }
    // Floor at y=80
    for(let x=0; x<60; x++) {
      for(let y=80; y<100; y++) {
        state.landscape.setSolid(x, y, true);
      }
    }

    const worm = new Worm(55, 75); // Walking towards wall
    worm.vx = 100; // moving right
    state.addPlayer(worm);
    
    engine.update(state, 0.1);
    
    expect(worm.x).toBeLessThan(60); // Could not pass wall
    expect(worm.vx).toBe(0); // Speed killed by wall
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
