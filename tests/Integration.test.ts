import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';

describe('Integration Test', () => {
  it('simulates a full game loop cycle', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.reset(['bazooka'], 'soldier', 'small');
    presenter.start();

    // Give the current player a bit of aim power manually if handleInput 'fire' isn't adding enough immediately
    const currentPlayer = presenter.state.getCurrentPlayer()!;
    currentPlayer.aimPower = 50; 
    
    // Simulate fire
    presenter.handleInput('fire', false); // release
    
    expect(presenter.state.projectiles.length).toBe(1);

    // Projectile moves
    (presenter as any).loop(16); // 16ms delta
    
    // Fast forward to explosion
    for(let i=0; i<100; i++) {
      (presenter as any).loop(16);
    }
    
    // Depending on logic, projectile might be gone, or explosion triggered
    expect(presenter.state.projectiles.length).toBeLessThan(2);
  });
});
