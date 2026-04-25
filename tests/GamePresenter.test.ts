import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GamePresenter } from '../src/presenters/GamePresenter';

describe('GamePresenter', () => {
  let presenter: GamePresenter;

  beforeEach(() => {
    // Mock the canvas rendering context
    const mockCanvas = {
      width: 800,
      height: 600,
      getContext: vi.fn().mockReturnValue({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        createImageData: vi.fn().mockReturnValue({ data: new Uint8Array(800 * 600 * 4) }),
        putImageData: vi.fn(),
        drawImage: vi.fn(),
      }),
      addEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;

    presenter = new GamePresenter(mockCanvas);
    presenter.init();
  });

  it('handles input and updates state', () => {
    presenter.start();
    
    // Explicitly initialize state and a player with valid coords
    presenter.state.players[0].x = 100;
    presenter.state.players[0].y = 100;
    presenter.state.players[0].vx = 0;
    presenter.state.players[0].vy = 0;
    const initialX = presenter.state.players[0].x;
    
    // Simulate active players to avoid NaN from uninitialized physics logic
    presenter.state.currentPlayerIndex = 0;
    
    // Provide a valid wind value so physics engine doesn't introduce NaN
    presenter.state.wind = 0;
    
    presenter.handleInput('right', true);
    presenter.update(0.1);
    
    expect(presenter.state.players[0].x).toBeGreaterThan(initialX);
  });

  it('handles shooting with cooldowns correctly', () => {
    presenter.start();
    const player = presenter.state.players[0];
    
    // Simulate charging weapon
    presenter.handleInput('fire', true);
    presenter.update(0.5); // Charge power
    
    expect(player.aimPower).toBeGreaterThan(0);
    
    // Release to fire
    presenter.handleInput('fire', false);
    
    // Power should reset, and a projectile should spawn
    expect(player.aimPower).toBe(0);
    expect(presenter.state.projectiles.length).toBeGreaterThan(0);
    
    const currentWeapon = player.getCurrentWeapon();
    expect(player.weaponCooldowns[currentWeapon.id]).toBeGreaterThan(0); // Cooldown should be active
  });

  it('rotates aim correctly', () => {
    presenter.start();
    presenter.state.currentPlayerIndex = 0; // Ensure current player logic is hit
    const player = presenter.state.players[0];
    player.aimAngle = 0;

    // Up = counter-clockwise = positive angle
    presenter.handleInput('up', true);
    presenter.update(0.1);
    expect(player.aimAngle).toBeGreaterThan(0);

    player.aimAngle = 0;
    presenter.handleInput('up', false); // stop up
    
    // Down = clockwise = negative angle
    presenter.handleInput('down', true);
    presenter.update(0.1);
    expect(player.aimAngle).toBe(360 - (90 * 0.1)); // Because 0 - 9 = -9, normalized to 351
  });
});
