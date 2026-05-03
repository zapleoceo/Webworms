import { describe, expect, it } from 'vitest';
import { GamePresenter } from '../presenters/GamePresenter';
import { GameState } from '../models/GameState';
import { Worm } from '../models/Worm';
import { BotTurnController } from './BotTurnController';
import { DEFAULT_BOT_CONFIG } from '../ai/BotConfig';

type Team = 'team1' | 'team2';

const makeWorm = (x: number, y: number, team: Team, name: string) => {
  const w = new Worm(x, y, false, name, 'soldier', ['bazooka', 'grenade', 'handgun'], team);
  w.width = 18;
  w.height = 18;
  w.health = 100;
  w.maxHealth = 100;
  return w;
};

describe('BotTurnController dig_escape safety', () => {
  it('does not fire dig_escape when enemy is within 180px', () => {
    const presenter = new GamePresenter(800, 600) as any;
    presenter.updateMobileWeaponIcon = () => {};
    presenter.isRunning = true;
    presenter.isHost = true;
    presenter.matchDuration = 0;
    presenter.maxTurnTime = 30;
    presenter.turnTimeLeft = 30;

    const state = new GameState(1200, 900) as any;
    state.mode = 'aivai';
    state.mapSeed = 1;
    state.wind = 0;
    state.windTarget = 0;
    state.botConfig = {
      ...DEFAULT_BOT_CONFIG,
      reserveSeconds: 0.3,
      dig: { ...(DEFAULT_BOT_CONFIG as any).dig, enabled: true }
    };
    for (let y = 700; y < 900; y++) for (let x = 0; x < 1200; x++) state.landscape.grid[y * 1200 + x] = 1;
    state.landscape.revision++;

    const shooter = makeWorm(600, 690, 'team1', 'S');
    const enemy = makeWorm(740, 690, 'team2', 'E');
    state.players = [shooter, enemy];
    state.currentPlayerIndex = 0;
    state.getCurrentPlayer = () => state.players[state.currentPlayerIndex] || null;
    presenter.state = state;

    const bot = new BotTurnController({ team1: 'hard', team2: 'hard' }) as any;

    let fired = 0;
    presenter.fireWeapon = () => { fired += 1; };
    presenter.handleInput = () => {};

    bot.firedThisTurn = false;
    const ok = bot.tryDigEscape(presenter, shooter, 'right');
    expect(ok).toBe(false);
    expect(fired).toBe(0);
  });
});

