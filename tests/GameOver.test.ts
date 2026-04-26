import { describe, it, expect, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';
import { GameState } from '../src/models/GameState';
import { Worm } from '../src/models/Worm';

describe('GamePresenter - checkGameOver logic', () => {
  it('should not trigger game over if game is not running', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.stop(); // sets isRunning = false
    
    const result = (presenter as any).checkGameOver();
    expect(result).toBeUndefined();
  });

  it('should not trigger game over if there are no players yet', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.start(); // sets isRunning = true
    presenter.state.players = []; // Force empty array
    
    const result = (presenter as any).checkGameOver();
    expect(result).toBeUndefined();
  });

  it('should trigger victory for team1 if team2 worm dies', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.start();
    
    const worm1 = new Worm(1, 100, 100, 'team1', 'soldier', []);
    const worm2 = new Worm(2, 200, 100, 'team2', 'soldier', []);
    
    presenter.state.players = [worm1, worm2];
    
    // Simulate team2 worm dying
    worm2.health = 0;
    
    const result = (presenter as any).checkGameOver();
    expect(result).toBe('team1');
  });

  it('should trigger draw if both worms die simultaneously', () => {
    const presenter = new GamePresenter(800, 600);
    presenter.start();
    
    const worm1 = new Worm(1, 100, 100, 'team1', 'soldier', []);
    const worm2 = new Worm(2, 200, 100, 'team2', 'soldier', []);
    
    presenter.state.players = [worm1, worm2];
    
    // Simulate both worms dying (e.g. mutual explosion)
    worm1.health = 0;
    worm2.health = 0;
    
    const result = (presenter as any).checkGameOver();
    expect(result).toBe('draw');
  });
});
