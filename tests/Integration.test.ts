import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';

describe('Integration Test', () => {
  it('simulates a full game loop cycle', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.init();

    const player = presenter.state.getCurrentPlayer()!;
    const initialY = player.y;
    
    // Simulate one loop step
    presenter.update(0.1);
    
    // Gravity should have pulled player down
    expect(player.y).toBeGreaterThan(initialY);

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
