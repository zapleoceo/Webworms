import type { BotConfig } from '../BotConfig';
import { chooseBotActionDebug, chooseBotPlan, type BotPlan, type BotWormSnapshot } from '../BotAI';
import type { AIDifficulty } from '../AIDifficulty';
import { mulberry32 } from '../../utils/SeededRng';

type TerrainPayload = { width: number; height: number; grid: ArrayBuffer };
type WormPayload = BotWormSnapshot;

type PlanRequest = {
  kind: 'plan';
  jobId: string;
  rngSeed: number;
  difficulty: AIDifficulty;
  gravity: number;
  wind: number;
  terrain: TerrainPayload;
  worms: WormPayload[];
  shooterId: string;
  botCfg: BotConfig;
  executeSeconds: number;
  ropeRemaining: number;
  shotMemory?: Array<{ stateKey: string; shotKey: string; noRes: number; ff: number; targetId?: string; lastT?: number }>;
};

type PlanResponse = {
  kind: 'planResult';
  jobId: string;
  ok: 1 | 0;
  ms: number;
  plan: BotPlan | null;
  debug: any | null;
};

const ctx = self as any;

ctx.onmessage = (evt: MessageEvent<PlanRequest>) => {
  const msg = evt.data;
  if (!msg || msg.kind !== 'plan') return;

  const t0 = performance.now();
  try {
    const grid = new Uint8Array(msg.terrain.grid);
    const w = msg.terrain.width;
    const h = msg.terrain.height;

    const terrain = {
      width: w,
      height: h,
      isSolid: (x: number, y: number) => {
        if (y < 0) return false;
        if (x < 0 || x >= w || y >= h) return true;
        return grid[y * w + x] > 0;
      }
    };

    const world = { gravity: msg.gravity, wind: msg.wind, terrain };
    const worms = Array.isArray(msg.worms) ? msg.worms : [];
    const shooter = worms.find((x) => x.id === msg.shooterId) || null;
    if (!shooter) {
      const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
      ctx.postMessage(out);
      return;
    }
    const enemies = worms.filter((w0) => w0.team !== shooter.team && w0.health > 0);
    const allies = worms.filter((w0) => w0.team === shooter.team && w0.health > 0);

    const seed = (msg.rngSeed >>> 0) || 1;
    const rngPlan = mulberry32(seed);
    const rngDbg = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const plan = chooseBotPlan(rngPlan, world as any, shooter, enemies, allies, msg.botCfg, msg.executeSeconds, msg.ropeRemaining, msg.difficulty, msg.shotMemory || []);
    const debug = chooseBotActionDebug(rngDbg, world as any, shooter, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || []);
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: plan ? 1 : 0, ms: performance.now() - t0, plan: plan || null, debug };
    ctx.postMessage(out);
  } catch {
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
    ctx.postMessage(out);
  }
};
