import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsEngine } from '../src/presenters/PhysicsEngine';
import { GameState } from '../src/models/GameState';
import { Worm } from '../src/models/Worm';
import { Projectile } from '../src/models/Projectile';
import { WEAPONS } from '../src/models/Weapon';
import { PhysicsProp } from '../src/models/PhysicsProp';

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
    const engine = new PhysicsEngine();
    const state = new GameState(100, 100);
    const worm = new Worm(50, 80);
    // Give it a huge initial velocity so that EVEN with the grounded check, it counts as falling
    // But since it starts at 80 and ground is at 90, it will hit ground in the first frame
    worm.vy = 800; 
    // Start it a bit higher so it actually falls and hits the ground during update
    worm.y = 50;
    // Set health manually because Worm constructor sets it based on class
    worm.health = 100;
    state.addPlayer(worm);

    // Create ground
    for (let x = 0; x < 100; x++) {
      for (let y = 90; y < 100; y++) {
        state.landscape.setSolid(x, y, true);
      }
    }

    engine.update(state, 0.1);
    
    expect(worm.y).toBeLessThan(101); // Should be pushed up or rest on top
    expect(worm.vy).toBe(0); // Stop falling
    expect(worm.health).toBeLessThan(100); // Took fall damage
  });

  it('prevents props from rolling up steep slopes easily', () => {
    const engine = new PhysicsEngine();
    const state = new GameState(100, 100);
    const prop = new PhysicsProp(50, 50, 'rock');
    
    // Give prop high horizontal speed towards a wall
    prop.vx = 200;
    // ensure gravity works
    prop.vy = 100;
    state.props.push(prop);
    
    // Create a steep wall at x=60
    for (let y = 0; y < 100; y++) {
      state.landscape.setSolid(60, y, true);
    }
    // Floor
    for (let x = 0; x < 100; x++) {
      state.landscape.setSolid(x, 90, true);
    }

    prop.y = 80;
    prop.x = 55;
    
    // Engine update should detect the wall/slope and drain velocity or bounce
    // Provide a small dt loop to simulate rolling into the wall
    engine.update(state, 0.1);
    engine.update(state, 0.1);
    
    // Velocity should be severely reduced or reversed
    expect(prop.vx).toBeLessThan(100); 
  });

  it('updates projectile and handles explosion', () => {
    const proj = new Projectile(50, 50, 0, 50, WEAPONS['bazooka']); // moving down
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
