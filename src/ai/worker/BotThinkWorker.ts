import type { BotConfig } from '../BotConfig';
import { chooseBotActionDebug, chooseBotPlan, type BotPlan, type BotWormSnapshot } from '../BotAI';
import type { AIDifficulty } from '../AIDifficulty';
import { mulberry32 } from '../../utils/SeededRng';
import { planWithMcts } from '../mcts/MctsPlanner';
import { findWaypointPath } from './PathPlanner';
import { applyDfEventsToGrid, type TerrainDfEvent } from './TerrainPatches';

type TerrainPayload = { width: number; height: number; grid: ArrayBuffer };
type WormPayload = BotWormSnapshot;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

type TerrainInitRequest = {
  kind: 'terrainInit';
  width: number;
  height: number;
  grid: ArrayBuffer;
  dfEventIndex: number;
  revision: number;
};

type TerrainPatchRequest = {
  kind: 'terrainPatch';
  fromEventIndex: number;
  toEventIndex: number;
  events: TerrainDfEvent[];
  revision: number;
};

type PlanRequest = {
  kind: 'plan';
  jobId: string;
  rngSeed: number;
  difficulty: AIDifficulty;
  mapSeed?: number;
  gravity: number;
  wind: number;
  teamAmmo?: any;
  terrain?: TerrainPayload;
  worms: WormPayload[];
  shooterId: string;
  botCfg: BotConfig;
  executeSeconds: number;
  ropeRemaining: number;
  shotMemory?: Array<{ stateKey: string; shotKey: string; noRes: number; ff: number; targetId?: string; lastT?: number }>;
  bestPractices?: any;
  seedBins?: Array<{ weaponIndex: number; angleBin: number; powerBin: number }>;
};

type PlanResponse = {
  kind: 'planResult';
  jobId: string;
  ok: 1 | 0;
  ms: number;
  plan: BotPlan | null;
  debug: any | null;
};

type PlanProgress = {
  kind: 'planProgress';
  jobId: string;
  ms: number;
  stage: string;
  bestScore: number;
  comboCount: number;
  evals: number;
};

const ctx = self as any;

let terrainW: number = 0;
let terrainH: number = 0;
let terrainGrid: Uint8Array | null = null;
let terrainDfEventIndex: number = 0;
let terrainRevision: number = 0;

ctx.onmessage = (evt: MessageEvent<TerrainInitRequest | TerrainPatchRequest | PlanRequest>) => {
  const msg = evt.data as any;
  if (!msg || typeof msg.kind !== 'string') return;

  if (msg.kind === 'terrainInit') {
    try {
      terrainW = Number(msg.width) || 0;
      terrainH = Number(msg.height) || 0;
      if (!Number.isFinite(terrainW) || !Number.isFinite(terrainH) || terrainW <= 0 || terrainH <= 0) return;
      terrainGrid = new Uint8Array(msg.grid);
      terrainDfEventIndex = Number(msg.dfEventIndex) || 0;
      terrainRevision = Number(msg.revision) || 0;
    } catch {}
    return;
  }

  if (msg.kind === 'terrainPatch') {
    try {
      if (!terrainGrid || terrainW <= 0 || terrainH <= 0) return;
      const events: TerrainDfEvent[] = Array.isArray(msg.events) ? msg.events : [];
      const res = applyDfEventsToGrid(terrainGrid, terrainW, terrainH, events);
      terrainDfEventIndex = Number(msg.toEventIndex) || terrainDfEventIndex;
      terrainRevision = Number(msg.revision) || terrainRevision;
      if (!res.ok) {
        terrainGrid = null;
        terrainW = 0;
        terrainH = 0;
        terrainDfEventIndex = 0;
        terrainRevision = 0;
      }
    } catch {}
    return;
  }

  if (msg.kind !== 'plan') return;

  const t0 = performance.now();
  try {
    const budgetMs = Math.max(35, Math.min(120, (Number(msg.executeSeconds) || 0) * 6 + 55));
    const deadlineMs = t0 + budgetMs;
    const plateauEvalWindow = 820;
    const progress = (stage: string) => (p: { bestScore: number; comboCount: number; evals: number }) => {
      const out: PlanProgress = { kind: 'planProgress', jobId: msg.jobId, ms: performance.now() - t0, stage, bestScore: p.bestScore, comboCount: p.comboCount, evals: p.evals };
      ctx.postMessage(out);
    };
    let grid: Uint8Array | null = null;
    let w = 0;
    let h = 0;
    if (msg.terrain && msg.terrain.grid) {
      grid = new Uint8Array(msg.terrain.grid);
      w = msg.terrain.width;
      h = msg.terrain.height;
    } else if (terrainGrid) {
      grid = terrainGrid;
      w = terrainW;
      h = terrainH;
    }
    if (!grid || !w || !h) {
      const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
      ctx.postMessage(out);
      return;
    }

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
    const worms: WormPayload[] = Array.isArray(msg.worms) ? msg.worms : [];
    const shooter = worms.find((x: WormPayload) => x.id === msg.shooterId) || null;
    if (!shooter) {
      const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
      ctx.postMessage(out);
      return;
    }
    const enemies = worms.filter((w0: WormPayload) => w0.team !== shooter.team && w0.health > 0);
    const allies = worms.filter((w0: WormPayload) => w0.team === shooter.team && w0.health > 0);

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
      const cur = chooseBotActionDebug(rngPlan, world as any, shooter, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || [], { deadlineMs, plateauEvalWindow, onProgress: progress('cur_shot'), bestPractices: msg.bestPractices, mapSeed: msg.mapSeed, seedBins: msg.seedBins });
      const curExpected = (cur?.trace as any)?.chosen?.expectedDamage || 0;
      if (!(cur && curExpected > 0.15)) {
        const maxSpeed = 22.75 * (shooter.speedMultiplier || 1);
        const span = Math.max(180, Math.min(740, maxSpeed * Math.max(0.3, msg.executeSeconds) + (msg.ropeRemaining > 0 ? 200 : 0)));
        const minX = Math.max(30, shooter.x - span);
        const maxX = Math.min(world.terrain.width - 30, shooter.x + span);
        let bestFound = false;
        let bestX = shooter.x;
        let bestY = shooter.y;
        let bestAction: any = null;
        let bestScore = -Infinity;

        const movePenalty = (msg.botCfg?.scoring?.movePenaltyPerPx ?? 0.08) * 0.55;
        const shotCache = new Map<string, any | null>();
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

        const edgePenaltyAt = (x: number, groundY: number): number => {
          const borderMargin = 72;
          if (x < borderMargin || x > (w - borderMargin)) return 1200;
          const sampleDx = 38;
          const left = surfaceYAt(x - sampleDx, groundY);
          const right = surfaceYAt(x + sampleDx, groundY);
          if (left === null || right === null) return 1200;
          const dropL = left - groundY;
          const dropR = right - groundY;
          const maxDrop = Math.max(dropL, dropR);
          if (maxDrop <= 60) return 0;
          if (maxDrop >= 220) return 1200;
          if (maxDrop >= 120) return Math.min(1200, 240 + (maxDrop - 120) * 4.2);
          return Math.min(700, 80 + (maxDrop - 60) * 2.2);
        };

        const evalX = (x: number) => {
          const groundY = surfaceYAt(x, shooter.y);
          if (groundY === null) return;
          const yy = clamp(groundY - (shooter.height || 10) / 2 - 1, 25, h - 25);
          const k = `${Math.round(x)}|${Math.round(yy)}`;
          let res = shotCache.get(k);
          if (res === undefined) {
            const movedShooter = { ...shooter, x, y: yy };
            res = chooseBotActionDebug(rngPlan, world as any, movedShooter as any, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || [], { deadlineMs, plateauEvalWindow, onProgress: progress('move_shot'), bestPractices: msg.bestPractices, mapSeed: msg.mapSeed, seedBins: msg.seedBins });
            shotCache.set(k, res || null);
          }
          if (!res) return;
          const expected = (res.trace as any)?.chosen?.expectedDamage || 0;
          const edgePenalty = edgePenaltyAt(x, groundY);
          let allyPenalty = 0;
          for (const a of allies) {
            if (!a || a.health <= 0 || a.id === shooter.id) continue;
            const dx = Math.abs(a.x - x);
            const dy = Math.abs(a.y - yy);
            if (dx < 26 && dy < 34) allyPenalty += 260;
            else if (dx < 56 && dy < 70) allyPenalty += 70;
            if (edgePenalty >= 200 && dx < 90 && dy < 90) allyPenalty += 220;
          }
          const s = res.score - Math.abs(x - shooter.x) * movePenalty - edgePenalty - allyPenalty - (expected <= 0.01 ? 120 : 0);
          if (!bestFound || s > bestScore) {
            bestFound = true;
            bestX = x;
            bestY = yy;
            bestAction = res.action;
            bestScore = s;
          }
        };

        const coarseN: number = 9;
        if (maxX - minX < 8) {
          evalX(shooter.x);
        } else {
          for (let i = 0; i < coarseN; i++) {
            const t = coarseN === 1 ? 0.5 : i / (coarseN - 1);
            evalX(minX + (maxX - minX) * t);
          }
        }

        if (bestFound) {
          const refineSpan = 96;
          const refineStep = 32;
          const rMin = Math.max(minX, bestX - refineSpan);
          const rMax = Math.min(maxX, bestX + refineSpan);
          for (let x = rMin; x <= rMax + 0.001; x += refineStep) evalX(x);
        }

        if (bestFound && bestAction) {
          plan.action = { weaponIndex: bestAction.weaponIndex, facingRight: bestAction.facingRight, aimAngle: bestAction.aimAngle, power: bestAction.power, targetId: bestAction.targetId };
          plan.moveTo = { x: bestX, y: bestY };
        }
      }

      if (plan.moveTo) {
        const path = findWaypointPath(terrain as any, { x: shooter.x, y: shooter.y }, { x: plan.moveTo.x, y: plan.moveTo.y }, shooter.width || 10, shooter.height || 10, 16, msg.ropeRemaining > 0);
        if (path && path.waypoints.length > 0) {
          plan.movePath = { waypoints: path.waypoints, primitive: path.primitive };
        } else {
          delete (plan as any).moveTo;
          delete (plan as any).movePath;
        }
      }
    }
    const debugShooter = (() => {
      if (plan?.moveTo) return { ...shooter, x: plan.moveTo.x, y: plan.moveTo.y };
      return shooter;
    })();
    const debug = chooseBotActionDebug(rngDbg, world as any, debugShooter as any, enemies, allies, msg.botCfg, msg.difficulty, msg.shotMemory || [], { deadlineMs, plateauEvalWindow, onProgress: progress('final_shot'), seedBins: msg.seedBins });
    if (plan && debug?.action) {
      plan.action = { weaponIndex: debug.action.weaponIndex, facingRight: debug.action.facingRight, aimAngle: debug.action.aimAngle, power: debug.action.power, targetId: debug.action.targetId };
    }
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: plan ? 1 : 0, ms: performance.now() - t0, plan: plan || null, debug };
    ctx.postMessage(out);
  } catch {
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
    ctx.postMessage(out);
  }
};
