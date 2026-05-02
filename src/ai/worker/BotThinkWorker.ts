import type { BotConfig } from '../BotConfig';
import { chooseBotActionDebug, chooseBotPlan, type BotPlan, type BotWormSnapshot } from '../BotAI';
import type { AIDifficulty } from '../AIDifficulty';
import { mulberry32 } from '../../utils/SeededRng';
import { planWithMcts } from '../mcts/MctsPlanner';
import { findWaypointPath } from './PathPlanner';

type TerrainPayload = { width: number; height: number; grid: ArrayBuffer };
type WormPayload = BotWormSnapshot;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

type PlanRequest = {
  kind: 'plan';
  jobId: string;
  rngSeed: number;
  difficulty: AIDifficulty;
  gravity: number;
  wind: number;
  teamAmmo?: any;
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

    const world = { gravity: msg.gravity, wind: msg.wind, terrain, teamAmmo: msg.teamAmmo };
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
    const mctsPlan = planWithMcts({
      rng: rngPlan,
      world: world as any,
      shooter,
      enemies,
      allies,
      botCfg: msg.botCfg,
      difficulty: msg.difficulty,
      moveSeconds: msg.executeSeconds,
      ropeAttachBudget: msg.ropeRemaining,
      shotMemory: msg.shotMemory || []
    });
    const plan0 = (mctsPlan as any) || chooseBotPlan(rngPlan, world as any, shooter, enemies, allies, msg.botCfg, msg.executeSeconds, msg.ropeRemaining, msg.difficulty, msg.shotMemory || []);
    const plan = plan0 ? { ...plan0 } : null;

    if (plan && enemies.length > 0) {
      const cur = chooseBotActionDebug(rngPlan, world as any, shooter, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || []);
      const curExpected = (cur?.trace as any)?.chosen?.expectedDamage || 0;
      if (!(cur && curExpected > 0.15)) {
        const maxSpeed = 22.75 * (shooter.speedMultiplier || 1);
        const span = Math.max(180, Math.min(740, maxSpeed * Math.max(0.3, msg.executeSeconds) + (msg.ropeRemaining > 0 ? 200 : 0)));
        const stepX = 32;
        const minX = Math.max(30, shooter.x - span);
        const maxX = Math.min(world.terrain.width - 30, shooter.x + span);
        let best: { x: number; y: number; action: any; score: number } | null = null;

        const movePenalty = (msg.botCfg?.scoring?.movePenaltyPerPx ?? 0.08) * 0.55;
        const surfaceYAt = (x: number, yHint: number): number | null => {
          const px = Math.floor(x);
          if (px < 0 || px >= w) return null;
          const y0 = Math.max(0, Math.min(h - 1, Math.floor(yHint)));
          for (let y = y0; y < h; y++) {
            if (terrain.isSolid(px, y)) return y;
          }
          for (let y = 0; y < y0; y++) {
            if (terrain.isSolid(px, y)) return y;
          }
          return null;
        };

        for (let x = minX; x <= maxX + 0.001; x += stepX) {
          const groundY = surfaceYAt(x, shooter.y);
          if (groundY === null) continue;
          const yy = clamp(groundY - (shooter.height || 10) / 2 - 1, 25, h - 25);
          const movedShooter = { ...shooter, x, y: yy };
          const res = chooseBotActionDebug(rngPlan, world as any, movedShooter as any, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || []);
          if (!res) continue;
          const expected = (res.trace as any)?.chosen?.expectedDamage || 0;
          const s = res.score - Math.abs(x - shooter.x) * movePenalty - (expected <= 0.01 ? 120 : 0);
          if (!best || s > best.score) best = { x, y: yy, action: res.action, score: s };
        }

        if (best) {
          plan.action = { weaponIndex: best.action.weaponIndex, facingRight: best.action.facingRight, aimAngle: best.action.aimAngle, power: best.action.power, targetId: best.action.targetId };
          plan.moveTo = { x: best.x, y: best.y };
        }
      }

      if (plan.moveTo) {
        const path = findWaypointPath(terrain as any, { x: shooter.x, y: shooter.y }, { x: plan.moveTo.x, y: plan.moveTo.y }, shooter.width || 10, shooter.height || 10, 16, msg.ropeRemaining > 0);
        if (path && path.waypoints.length > 0) {
          plan.movePath = { waypoints: path.waypoints, primitive: path.primitive };
        }
      }
    }
    const debug = chooseBotActionDebug(rngDbg, world as any, shooter, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || []);
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: plan ? 1 : 0, ms: performance.now() - t0, plan: plan || null, debug };
    ctx.postMessage(out);
  } catch {
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
    ctx.postMessage(out);
  }
};
