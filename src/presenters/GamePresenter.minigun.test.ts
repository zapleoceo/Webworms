import { describe, expect, test } from 'vitest';
import { GamePresenter } from './GamePresenter';
import { Worm } from '../models/Worm';

describe('GamePresenter (minigun)', () => {
  test('limits minigun shots per turn', () => {
    const presenter = new GamePresenter(800, 600) as any;
    const worm = new Worm(100, 200, false, 'P', 'soldier', ['minigun'], 'team1');
    presenter.state.players = [worm];
    presenter.state.currentPlayerIndex = 0;
    presenter.turnTimeLeft = 30;
    presenter.activeInputs.add('fire');

    const dt = 1 / 60;
    for (let i = 0; i < 2000; i++) {
      presenter.processActiveInputs(dt);
      worm.weaponCooldowns.minigun = Math.max(0, (worm.weaponCooldowns.minigun || 0) - dt);
    }

    expect(presenter.state.projectiles.length).toBe(25);
    expect(presenter.shotsFiredThisTurnByWeaponId.minigun).toBe(25);
  });

  test('does not spawn minigun bullets when turn time is over', () => {
    const presenter = new GamePresenter(800, 600) as any;
    const worm = new Worm(100, 200, false, 'P', 'soldier', ['minigun'], 'team1');
    presenter.state.players = [worm];
    presenter.state.currentPlayerIndex = 0;
    presenter.turnTimeLeft = 0;
    presenter.activeInputs.add('fire');

    const dt = 1 / 60;
    for (let i = 0; i < 200; i++) {
      presenter.processActiveInputs(dt);
      worm.weaponCooldowns.minigun = Math.max(0, (worm.weaponCooldowns.minigun || 0) - dt);
    }

    expect(presenter.state.projectiles.length).toBe(0);
  });
});

