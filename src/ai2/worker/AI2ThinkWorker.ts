import type { BotConfig } from '../../ai/BotConfig';
import type { AIDifficulty } from '../../ai/AIDifficulty';
import { chooseBotActionDebug, chooseBotPlan, type BotPlan, type BotWormSnapshot } from '../../ai/BotAI';
import { mulberry32 } from '../../utils/SeededRng';
import { findWaypointPath } from '../../ai/worker/PathPlanner';
import { applyDfEventsToGrid, type TerrainDfEvent } from '../../ai/worker/TerrainPatches';
import { planAI2 } from '../planner/AI2Planner';

type TerrainPayload = { width: number; height: number; grid: ArrayBuffer };
type WormPayload = BotWormSnapshot;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

type SurfaceCaches = {
  version: number;
  w: number;
  h: number;
  surface: Map<number, number | null>;
  edge: Map<number, number>;
  cover: Map<number, number>;
};

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
let terrainCacheVersion: number = 0;

const caches: SurfaceCaches = {
  version: -1,
  w: 0,
  h: 0,
  surface: new Map(),
  edge: new Map(),
  cover: new Map()
};

const resetCaches = (w: number, h: number) => {
  caches.version = terrainCacheVersion;
  caches.w = w;
  caches.h = h;
  caches.surface.clear();
  caches.edge.clear();
  caches.cover.clear();
};

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
      terrainCacheVersion++;
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
      terrainCacheVersion++;
      if (!res.ok) {
        terrainGrid = null;
        terrainW = 0;
        terrainH = 0;
        terrainDfEventIndex = 0;
        terrainRevision = 0;
        terrainCacheVersion++;
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

    if (caches.version !== terrainCacheVersion || caches.w !== w || caches.h !== h) resetCaches(w, h);

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

    const rngPlan = mulberry32((msg.rngSeed | 0) ^ 0x51d2e27);
    const planRng = () => rngPlan();

    const ropeAttachBudget = clamp(Math.round(msg.ropeRemaining || 0), 0, 12);
    const moveSeconds = clamp(Number(msg.executeSeconds) || 0, 0.1, 8);
    const surfaceYAtCached = (x: number, y0: number): number | null => {
      const px = clamp(Math.round(x), 0, w - 1);
      const yb = clamp(Math.round(y0 / 32), 0, Math.ceil(h / 32));
      const key = px + yb * (w + 1);
      if (caches.surface.has(key)) return caches.surface.get(key) as any;
      const start = clamp(Math.round(y0), 0, h - 1);
      let found: number | null = null;
      for (let yy = start; yy < h; yy++) if (terrain.isSolid(px, yy)) { found = yy; break; }
      if (found === null) for (let yy = 0; yy < start; yy++) if (terrain.isSolid(px, yy)) { found = yy; break; }
      caches.surface.set(key, found);
      return found;
    };
    const edgePenaltyAtCached = (x: number, groundY: number): number => {
      const px = clamp(Math.round(x), 0, w - 1);
      const gy = clamp(Math.round(groundY), 0, h - 1);
      const key = px + gy * (w + 1);
      const prev = caches.edge.get(key);
      if (prev !== undefined) return prev;
      const borderMargin = 72;
      if (x < borderMargin || x > (w - borderMargin)) { caches.edge.set(key, 1200); return 1200; }
      const sampleDx = 38;
      const left = surfaceYAtCached(x - sampleDx, groundY);
      const right = surfaceYAtCached(x + sampleDx, groundY);
      if (left === null || right === null) { caches.edge.set(key, 1200); return 1200; }
      const dropL = left - groundY;
      const dropR = right - groundY;
      const maxDrop = Math.max(dropL, dropR);
      let out = 0;
      if (maxDrop <= 60) out = 0;
      else if (maxDrop >= 220) out = 1200;
      else if (maxDrop >= 120) out = Math.min(1200, 240 + (maxDrop - 120) * 4.2);
      else out = Math.min(700, 80 + (maxDrop - 60) * 2.2);
      caches.edge.set(key, out);
      return out;
    };
    const coverScoreCached = (x: number, y: number, dir: -1 | 1): number => {
      const px = clamp(Math.round(x), 0, w - 1);
      const py = clamp(Math.round(y), 0, h - 1);
      const dirBit = dir === 1 ? 1 : 0;
      const key = (px + py * (w + 1)) * 2 + dirBit;
      const prev = caches.cover.get(key);
      if (prev !== undefined) return prev;
      let c = 0;
      for (let i = 1; i <= 6; i++) {
        const xx = clamp(Math.round(x + dir * i * 16), 0, w - 1);
        if (terrain.isSolid(xx, py)) c++;
      }
      caches.cover.set(key, c);
      return c;
    };
    const ai2 = planAI2({
      rng: planRng,
      world: world as any,
      shooter: shooter as any,
      enemies: enemies as any,
      allies: allies as any,
      botCfg: msg.botCfg,
      difficulty: msg.difficulty,
      executeSeconds: moveSeconds,
      ropeRemaining: ropeAttachBudget,
      shotMemory: msg.shotMemory || [],
      bestPractices: msg.bestPractices,
      mapSeed: msg.mapSeed,
      seedBins: msg.seedBins,
      deadlineMs,
      onProgress: progress('utility_top'),
      sampler: { surfaceYAt: surfaceYAtCached, edgePenaltyAt: edgePenaltyAtCached, coverScore: coverScoreCached }
    });

    let plan: BotPlan | null = ai2.plan as any;
    let debug: any | null = ai2.debug || null;
    if (!plan) {
      const rngDbg = mulberry32((msg.rngSeed | 0) ^ 0x19bd2a1);
      const fallback = chooseBotActionDebug(rngDbg, world as any, shooter as any, enemies as any, allies as any, msg.botCfg, msg.difficulty, msg.shotMemory || [], { deadlineMs, plateauEvalWindow, onProgress: progress('final_shot'), bestPractices: msg.bestPractices, mapSeed: msg.mapSeed, seedBins: msg.seedBins });
      const dig = chooseBotPlan(rngDbg, world as any, shooter as any, enemies as any, allies as any, msg.botCfg, moveSeconds, ropeAttachBudget, msg.difficulty, msg.shotMemory || []);
      plan = dig || (fallback ? { moveTo: undefined, action: fallback.action, intent: 'attack' } as any : null);
      debug = debug || fallback?.trace || null;
    }

    if (plan?.moveTo) {
      const path = findWaypointPath(
        world.terrain as any,
        { x: shooter.x, y: shooter.y },
        { x: plan.moveTo.x, y: plan.moveTo.y },
        shooter.width || 10,
        shooter.height || 10,
        16,
        (msg.ropeRemaining || 0) > 0
      );
      if (!path) {
        plan = { ...plan, moveTo: undefined };
      } else {
        (plan as any).movePath = { waypoints: path.waypoints, primitive: path.primitive };
      }
    }

    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: plan ? 1 : 0, ms: performance.now() - t0, plan: plan || null, debug };
    ctx.postMessage(out);
  } catch {
    const out: PlanResponse = { kind: 'planResult', jobId: msg.jobId, ok: 0, ms: performance.now() - t0, plan: null, debug: null };
    ctx.postMessage(out);
  }
};
