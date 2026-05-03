import { expect, test } from 'vitest';
import { chooseBotActionDebug } from '../BotAI';
import { DEFAULT_BOT_CONFIG } from '../BotConfig';
import { analyzePit } from '../PitAnalyzer';

type GridTerrain = { width: number; height: number; grid: Uint8Array; isSolid: (x: number, y: number) => boolean };

const shouldRun = typeof (globalThis as any).process !== 'undefined' && (globalThis as any).process?.env?.RUN_AIVAI_SIM === '1';
const t = shouldRun ? test : test.skip;

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

const makeEmptyTerrain = (): GridTerrain => {
  const t = makeTerrain(2000, 1200);
  t.isSolid = () => false;
  return t;
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

const makePitTerrain = (pitWidth: number, depth: number): { t: GridTerrain; groundY: number } => {
  const t = makeTerrain(900, 560);
  const groundY = 340;
  fillRect(t, 0, groundY, t.width - 1, t.height - 1);
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

const evalAttack = (seed: number, terrain: GridTerrain, shooterX: number, shooterY: number, targetX: number, targetY: number): { dmg: 0 | 1; goal: 0 | 1 } => {
  const rng = mulberry32(seed);
  const world: any = { gravity: 195, wind: 0, terrain, teamAmmo: { team1: { grenade: 3 }, team2: { grenade: 3 } } };
  const shooter: any = { id: 's', team: 'team1', x: shooterX, y: shooterY, width: 18, height: 18, health: 100, equipmentIds: ['grenade', 'bazooka', 'shotgun', 'handgun', 'ninja_rope'], weaponCooldowns: {} };
  const enemy: any = { id: 'e', team: 'team2', x: targetX, y: targetY, width: 18, height: 18, health: 100, equipmentIds: [], weaponCooldowns: {} };
  const t0 = performance.now();
  const res = chooseBotActionDebug(rng, world, shooter, [enemy], [shooter], DEFAULT_BOT_CONFIG, 'hard', [], { deadlineMs: t0 + 95, plateauEvalWindow: 820 });
  if (!res) return { dmg: 0, goal: 0 };
  const expected = (res.trace as any)?.chosen?.expectedDamage || 0;
  const dmg = expected > 0.12 ? 1 : 0;
  const goal = expected > 0.04 ? 1 : 0;
  return { dmg: dmg as 0 | 1, goal: goal as 0 | 1 };
};

const evalEscape = (terrain: GridTerrain, x: number, y: number): { dmg: 0 | 1; goal: 0 | 1 } => {
  const pit = analyzePit(terrain as any, { x, y, width: 18, height: 18, ropeRemaining: 1 });
  return { dmg: 0, goal: pit.isTrapped ? 1 : 0 };
};

t('aivai sim KPI', { timeout: 60000 }, () => {
  const empty = makeEmptyTerrain();
  const pitN = makePitTerrain(26, 170);
  const pitW = makePitTerrain(56, 150);

  const turns: Array<{ dmg: 0 | 1; goal: 0 | 1 }> = [];
  for (let i = 0; i < 22; i++) turns.push(evalAttack(1000 + i, empty, 200, 500, 520, 520));
  for (let i = 0; i < 8; i++) turns.push(evalAttack(2000 + i, pitW.t, 260, pitW.groundY - 10, 420, pitW.groundY + 90));
  for (let i = 0; i < 6; i++) turns.push(evalAttack(3000 + i, pitN.t, 660, pitN.groundY - 10, 420, pitN.groundY + 110));
  for (let i = 0; i < 4; i++) turns.push(evalEscape(pitN.t, 420, pitN.groundY + 140));

  const dmgRate = turns.reduce((a, t) => a + t.dmg, 0) / turns.length;
  const goalRate = turns.reduce((a, t) => a + t.goal, 0) / turns.length;
  console.log('[aivai-sim] turns', turns.length, 'damageRate', dmgRate.toFixed(3), 'goalRate', goalRate.toFixed(3));
  expect(dmgRate).toBeGreaterThanOrEqual(0.5);
  expect(goalRate).toBeGreaterThanOrEqual(0.8);
});
