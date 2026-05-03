import type { BotConfig } from '../../ai/BotConfig';
import type { AIDifficulty } from '../../ai/AIDifficulty';
import { chooseBotActionDebug, type BotPlan, type BotWormSnapshot } from '../../ai/BotAI';
import { buildLocalActionGraphV2, type ActionGraphEdgeV2, type SurfaceSamplerV2 } from '../graph/LocalActionGraph';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function planAI2(args: {
  rng: () => number;
  world: any;
  shooter: BotWormSnapshot;
  enemies: BotWormSnapshot[];
  allies: BotWormSnapshot[];
  botCfg: BotConfig;
  difficulty: AIDifficulty;
  executeSeconds: number;
  ropeRemaining: number;
  shotMemory: any[];
  bestPractices?: any;
  mapSeed?: number;
  seedBins?: Array<{ weaponIndex: number; angleBin: number; powerBin: number }>;
  deadlineMs: number;
  onProgress?: (p: { bestScore: number; comboCount: number; evals: number }) => void;
  sampler?: SurfaceSamplerV2;
}): { plan: BotPlan | null; debug: any } {
  const { rng, world, shooter, enemies, allies, botCfg, difficulty, executeSeconds } = args;
  const t = world?.terrain;
  const w = Number(t?.width) || 0;
  const padX = 520;
  const minX = clamp(shooter.x - padX, 0, w - 1);
  const maxX = clamp(shooter.x + padX, 0, w - 1);
  const graph = buildLocalActionGraphV2({ terrain: t, shooterX: shooter.x, shooterY: shooter.y, wormH: shooter.height || 10, minX, maxX, stepX: 56, sampler: args.sampler });
  const nodes = graph.nodes;
  const edges = graph.edges;

  const movePenalty = 0.07 + 0.022 * (Number(executeSeconds) || 0);
  const top: Array<{ x: number; y: number; score: number; edgePenalty: number; expected: number; action: any }> = [];

  const evalPos = (x: number, y: number, edgePenalty: number, cover: number) => {
    if (edgePenalty >= 900) return;
    const movedShooter = { ...shooter, x, y };
    const res = chooseBotActionDebug(rng, world as any, movedShooter as any, enemies as any, allies as any, botCfg, difficulty, args.shotMemory || [], {
      deadlineMs: args.deadlineMs,
      plateauEvalWindow: 820,
      bestPractices: args.bestPractices,
      mapSeed: args.mapSeed,
      seedBins: args.seedBins
    } as any);
    if (!res) return;
    const expected = (res.trace as any)?.chosen?.expectedDamage || 0;
    const s = res.score - Math.abs(x - shooter.x) * movePenalty - edgePenalty + cover * 3 - (expected <= 0.01 ? 120 : 0);
    top.push({ x, y, score: s, edgePenalty, expected, action: res.action });
    top.sort((a, b) => b.score - a.score);
    if (top.length > 6) top.length = 6;
    if (typeof args.onProgress === 'function') args.onProgress({ bestScore: top[0]?.score || 0, comboCount: 0, evals: (top as any).length });
  };

  evalPos(shooter.x, shooter.y, 0, 0);

  const maxCost = 5.2;
  const bestCost = new Array<number>(nodes.length).fill(Infinity);
  const open: number[] = [];
  if (nodes.length > 0) {
    bestCost[graph.startId] = 0;
    open.push(graph.startId);
  }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (bestCost[open[i]] < bestCost[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    const c0 = bestCost[cur];
    if (c0 > maxCost) continue;
    const e0: ActionGraphEdgeV2[] = edges[cur] || [];
    for (const e of e0) {
      const nc = c0 + e.cost;
      if (nc + 1e-9 < bestCost[e.to] && nc <= maxCost) {
        bestCost[e.to] = nc;
        open.push(e.to);
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (!Number.isFinite(bestCost[i]) || bestCost[i] > maxCost) continue;
    const n = nodes[i];
    const cover = n.coverL + n.coverR;
    evalPos(n.x, n.y, n.edgePenalty, cover);
    if (performance.now() > args.deadlineMs) break;
  }

  const best = top[0] || null;
  if (!best || !best.action) return { plan: null, debug: { top } };

  const plan: any = { intent: 'attack', moveTo: { x: best.x, y: best.y }, action: best.action };
  if (Math.abs(best.x - shooter.x) < 1.5 && Math.abs(best.y - shooter.y) < 1.5) delete plan.moveTo;
  return { plan, debug: { top, nodeCount: nodes.length, edgeCount: edges.reduce((s, e) => s + e.length, 0) } };
}
