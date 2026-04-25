import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';

describe('Integration Test', () => {
  it('simulates a full game loop cycle', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.init();

    const player = presenter.state.getCurrentPlayer()!;
    // Player is spawned via getSafeSpawn so they are already on the ground
    const initialY = player.y;
    
    // Jump to see physics working
    presenter.handleInput('jump', true);
    presenter.update(0.1);
    
    // Jump should have pulled player up
    expect(player.y).toBeLessThan(initialY);

    // Charge and fire
    presenter.handleInput('fire', true); // charge
    player.aimPower = 50; // mock charge
    presenter.handleInput('fire', false); // release
    
    expect(presenter.state.projectiles.length).toBe(1);
    
    // Projectile moves
    const proj = presenter.state.projectiles[0];
    const initialProjX = proj.x;
    
    presenter.update(0.1);
    
    expect(proj.x).not.toBe(initialProjX);
  });
});
