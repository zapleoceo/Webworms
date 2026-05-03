import { chooseBotActionDebug } from '../src/ai/BotAI';
import { DEFAULT_BOT_CONFIG } from '../src/ai/BotConfig';

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
    if (x < 0 || x >= w || y >= h) return false;
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

const makeFlat = (): { t: GridTerrain; groundY: number } => {
  const t = makeTerrain(900, 560);
  const groundY = 340;
  fillRect(t, 0, groundY, t.width - 1, t.height - 1);
  return { t, groundY };
};

const makePit = (pitWidth: number, depth: number): { t: GridTerrain; groundY: number } => {
  const base = makeFlat();
  const t = base.t;
  const groundY = base.groundY;
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

const evalAttack = (seed: number, terrain: GridTerrain, shooterX: number, shooterY: number, targetX: number, targetY: number) => {
  const rng = mulberry32(seed);
  const world: any = { gravity: 195, wind: 0, terrain, teamAmmo: { team1: { grenade: 3 }, team2: { grenade: 3 } } };
  const shooter: any = { id: 's', team: 'team1', x: shooterX, y: shooterY, width: 18, height: 18, health: 100, equipmentIds: ['grenade', 'bazooka', 'shotgun', 'handgun'], weaponCooldowns: {} };
  const enemy: any = { id: 'e', team: 'team2', x: targetX, y: targetY, width: 18, height: 18, health: 100, equipmentIds: [], weaponCooldowns: {} };
  const t0 = performance.now();
  const res = chooseBotActionDebug(rng, world, shooter, [enemy], [shooter], DEFAULT_BOT_CONFIG, 'hard', [], { deadlineMs: t0 + 520, plateauEvalWindow: 3600, mapSeed: 7 });
  const expected = res?.trace?.chosen?.expectedDamage ?? 0;
  const weaponId = res?.trace?.chosen?.weaponId ?? 'none';
  const rejected = (res as any)?.trace?.rejected || null;
  return { expected, weaponId, ok: !!res, rejected };
};

export const runAivaiKpi = () => {
  const flat = makeFlat();
  const pitW = makePit(56, 150);
  const pitN = makePit(28, 180);
  const turns: Array<{ expected: number; weaponId: string; label: string; ok: boolean; rejected: any }> = [];

  for (let i = 0; i < 16; i++) turns.push({ ...evalAttack(1000 + i, flat.t, 260, flat.groundY - 12, 520, flat.groundY - 12), label: 'flat' });
  for (let i = 0; i < 10; i++) turns.push({ ...evalAttack(2000 + i, pitW.t, 280, pitW.groundY - 12, 420, pitW.groundY + 110), label: 'pitW' });
  for (let i = 0; i < 10; i++) turns.push({ ...evalAttack(3000 + i, pitN.t, 640, pitN.groundY - 12, 420, pitN.groundY + 125), label: 'pitN' });

  const dmgSuccess10 = turns.filter(t => t.expected >= 10).length;
  const dmgSuccess8 = turns.filter(t => t.expected >= 8).length;
  const dmgSuccess2 = turns.filter(t => t.expected >= 2).length;
  const dmgRate = dmgSuccess2 / turns.length;
  const byWeapon: Record<string, number> = {};
  let okCount = 0;
  let sampleRejected: any = null;
  for (const x of turns) {
    byWeapon[x.weaponId] = (byWeapon[x.weaponId] || 0) + 1;
    if (x.ok) okCount += 1;
    if (!sampleRejected && x.ok && x.rejected) sampleRejected = x.rejected;
  }
  const goalRate = okCount / turns.length;
  return { turns: turns.length, okCount, dmgRate, goalRate, byWeapon, sampleRejected, dmgSuccess10, dmgSuccess8, dmgSuccess2 };
};
