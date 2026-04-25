import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';

describe('GamePresenter', () => {
  let presenter: GamePresenter;

  beforeEach(() => {
    presenter = new GamePresenter(800, 600);
    presenter.init();
  });

  it('initializes state correctly', () => {
    expect(presenter.state.players.length).toBe(2);
    expect(presenter.state.landscape.width).toBe(800);
  });

  it('handles input and fires weapon', () => {
    const player = presenter.state.getCurrentPlayer()!;
    
    // Jump
    presenter.handleInput('jump', true);
    expect(player.vy).toBeLessThan(0); // Going up
    expect(player.isJumping).toBe(true);

    // Charge weapon
    presenter.handleInput('fire', true);
    presenter.update(0.5); // update loop for 0.5 seconds
    
    expect(player.aimPower).toBeGreaterThan(0);
    expect(player.aimPower).toBe(51); // 1 (initial) + 100 power/sec * 0.5s

    // Fire weapon
    presenter.handleInput('fire', false);
    expect(presenter.state.projectiles.length).toBe(1);
    expect(player.aimPower).toBe(0); // Reset
  });
});
