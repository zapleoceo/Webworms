import { expect, test } from 'vitest';
import { chooseBotActionDebug } from '../BotAI';
import { DEFAULT_BOT_CONFIG } from '../BotConfig';

type GridTerrain = { width: number; height: number; grid: Uint8Array; isSolid: (x: number, y: number) => boolean };

const mulberry32 = (a: number) => () => {
  let x = (a += 0x6d2b79f5);
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

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
  const pitWidth = 28;
  const depth = 170;
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

test('BotAI prefers grenade on trapped target in a pit', () => {
  const { t, groundY } = makePitTerrain();
  const rng = mulberry32(1337);
  const world: any = { gravity: 195, wind: 0, terrain: t, teamAmmo: { team1: { grenade: 3 }, team2: { grenade: 3 } } };
  const shooter: any = { id: 's', team: 'team1', x: 280, y: groundY - 10, width: 18, height: 18, health: 100, equipmentIds: ['grenade', 'bazooka', 'shotgun', 'handgun'], weaponCooldowns: {} };
  const enemy: any = { id: 'e', team: 'team2', x: 420, y: groundY + 120, width: 18, height: 18, health: 100, equipmentIds: [], weaponCooldowns: {} };
  const res = chooseBotActionDebug(rng, world, shooter, [enemy], [shooter], DEFAULT_BOT_CONFIG, 'hard', []);
  expect(res).not.toBeNull();
  expect((res as any).trace?.chosen?.weaponId).toBe('grenade');
});

