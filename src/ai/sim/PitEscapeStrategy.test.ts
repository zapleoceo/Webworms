import { expect, test } from 'vitest';
import { BotTurnController } from '../../controllers/BotTurnController';
import { DEFAULT_BOT_CONFIG } from '../BotConfig';
import { analyzePit } from '../PitAnalyzer';

type GridTerrain = { width: number; height: number; grid: Uint8Array; isSolid: (x: number, y: number) => boolean };

const makeTerrain = (w: number, h: number): GridTerrain => {
  const grid = new Uint8Array(w * h);
  const isSolid = (x: number, y: number) => {
    if (y < 0) return false;
    if (x < 0 || x >= w || y >= h) return true;
    return grid[Math.floor(y) * w + Math.floor(x)] > 0;
  };
  return { width: w, height: h, grid, isSolid };
};

const fillRect = (t: GridTerrain, x0: number, y0: number, x1: number, y1: number) => {
  const xa = Math.max(0, Math.min(t.width - 1, Math.floor(Math.min(x0, x1))));
  const xb = Math.max(0, Math.min(t.width - 1, Math.floor(Math.max(x0, x1))));
  const ya = Math.max(0, Math.min(t.height - 1, Math.floor(Math.min(y0, y1))));
  const yb = Math.max(0, Math.min(t.height - 1, Math.floor(Math.max(y0, y1))));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) t.grid[y * t.width + x] = 1;
  }
};

const makePitTerrain = (): { t: GridTerrain; groundY: number } => {
  const t = makeTerrain(900, 560);
  const groundY = 340;
  fillRect(t, 0, groundY, t.width - 1, t.height - 1);
  const pitWidth = 26;
  const depth = 180;
  const x0 = 420 - pitWidth / 2;
  const x1 = 420 + pitWidth / 2;
  const top = groundY;
  const bottom = Math.min(t.height - 2, groundY + depth);
  for (let y = top; y < bottom; y++) {
    for (let x = Math.floor(x0 + 2); x <= Math.floor(x1 - 2); x++) {
      if (x < 0 || x >= t.width) continue;
      t.grid[y * t.width + x] = 0;
    }
  }
  return { t, groundY };
};

test('PitAnalyzer detects trapped in narrow pit', () => {
  const { t, groundY } = makePitTerrain();
  const pit = analyzePit(t as any, { x: 420, y: groundY + 140, width: 18, height: 18, ropeRemaining: 1 });
  expect(pit.isTrapped).toBe(true);
  expect(pit.depthPx).toBeGreaterThan(80);
});

test('BotTurnController does not dig-escape when the wall is too close (self-unsafe)', () => {
  const { t, groundY } = makePitTerrain();
  const landscape: any = { width: t.width, height: t.height, revision: 1, dfEvents: [], getMaterial: (x: number, y: number) => (t.isSolid(x, y) ? 1 : 0) };
  const p0: any = { team: 'team1', x: 420, y: groundY + 140, width: 18, height: 18, health: 100, equipmentIds: ['bazooka', 'grenade'], weaponCooldowns: {}, facingRight: true, aimAngle: 0, aimPower: 60, ropeActive: false };
  const e0: any = { team: 'team2', x: 720, y: groundY - 10, width: 18, height: 18, health: 100, equipmentIds: ['bazooka', 'grenade'], weaponCooldowns: {}, facingRight: false, aimAngle: 0, aimPower: 60, ropeActive: false };
  const inputs: any[] = [];
  const botConfig = { ...DEFAULT_BOT_CONFIG, ropeAttachLimit: { easy: 0, medium: 0, hard: 0 } };
  const state: any = {
    mode: 'aivai',
    width: t.width,
    height: t.height,
    mapSeed: 11,
    wind: 0,
    teamAmmo: { team1: { grenade: 3 }, team2: { grenade: 3 } },
    botConfig,
    landscape,
    players: [p0, e0],
    currentPlayerIndex: 0,
    getCurrentPlayer: () => p0,
    projectiles: []
  };
  const presenter: any = {
    isRunning: true,
    isHost: true,
    state,
    physics: { gravity: 195, lastExplosionAt: -999 },
    matchDuration: 0,
    maxTurnTime: 30,
    turnTimeLeft: 18,
    deltaTime: 1 / 60,
    handleInput: (k: string, v: any, _immediate?: any, extra?: any) => { inputs.push([k, v, extra]); }
  };
  const ctrl = new BotTurnController({ team1: 'hard', team2: 'hard' });
  const ok = (ctrl as any).tryDigEscape(presenter, p0, 'left');
  void inputs;
  expect(ok).toBe(false);
});
