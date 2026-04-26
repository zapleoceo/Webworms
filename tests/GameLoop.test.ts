import { describe, it, expect, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';
import { Worm } from '../src/models/Worm';

describe('GamePresenter - game loop and state updates', () => {
  it('should call onStateUpdate when looping', () => {
    const presenter = new GamePresenter(800, 600);
    const mockOnStateUpdate = vi.fn();
    presenter.onStateUpdate = mockOnStateUpdate;
    
    // Simulate game running
    presenter.start();
    
    // Since requestAnimationFrame isn't available in standard Node test env without polyfills,
    // we manually call loop step.
    (presenter as any).loop(16);
    
    expect(mockOnStateUpdate).toHaveBeenCalledWith(presenter.state);
  });

  it('should trigger onGameOver correctly and pass stats', () => {
    const presenter = new GamePresenter(800, 600);
    const mockOnGameOver = vi.fn();
    presenter.onGameOver = mockOnGameOver;
    
    const worm1 = new Worm(1, 100, 100, 'team1', 'soldier', []);
    const worm2 = new Worm(2, 200, 100, 'team2', 'soldier', []);
    
    presenter.state.players = [worm1, worm2];
    presenter.state.players[0].damageDealt = 150;
    presenter.state.players[1].damageDealt = 50;
    
    presenter.start(); // isRunning = true
    
    // Kill worm2
    worm2.health = 0;
    
    // Manual loop call to trigger checkGameOver inside loop
    (presenter as any).loop(16);
    
    expect(mockOnGameOver).toHaveBeenCalledWith('team1', { p1Dmg: 150, p2Dmg: 50 });
    expect((presenter as any).isRunning).toBe(false);
  });
});
