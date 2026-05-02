import { chooseBotActionDebug, chooseBotPlan, type BotDecisionTrace, type BotWormSnapshot } from '../BotAI';
import { budgetForDifficulty } from './DifficultyBudgets';
import type { MctsAction, MctsContext, MctsPlan } from './MctsTypes';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const angleNorm = (a: number): number => {
  const TAU = Math.PI * 2;
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

const localAimFromGlobal = (global: number): { facingRight: boolean; aimAngle: number } => {
  const facingRight = Math.cos(global) >= 0;
  if (facingRight) return { facingRight: true, aimAngle: clamp(angleNorm(global), -Math.PI / 2, Math.PI / 2) };
  return { facingRight: false, aimAngle: clamp(angleNorm(Math.PI - global), -Math.PI / 2, Math.PI / 2) };
};

const surfaceY = (terrain: any, x: number): number | null => {
  const px = Math.floor(x);
  if (px < 0 || px >= terrain.width) return null;
  for (let y = 0; y < terrain.height; y++) {
    if (terrain.isSolid(px, y)) return y;
  }
  return null;
};

const shooterAt = (shooter: BotWormSnapshot, x: number, y: number): BotWormSnapshot => ({
  ...shooter,
  x,
  y
});

const topShotCandidates = (trace: BotDecisionTrace | undefined, max: number): Array<{ action: any; score: number; expectedDamage: number; targetId?: string }> => {
  const bestByWeaponId = (trace as any)?.bestByWeaponId || {};
  const list = Object.values(bestByWeaponId) as any[];
  list.sort((a, b) => (b?.score || 0) - (a?.score || 0));
  return list.slice(0, Math.max(0, max)).map(s => {
    const local = localAimFromGlobal(s.globalAngle);
    return {
      action: { weaponIndex: s.weaponIndex, facingRight: local.facingRight, aimAngle: local.aimAngle, power: s.power, targetId: s.targetId },
      score: s.score,
      expectedDamage: s.expectedDamage,
      targetId: s.targetId
    };
  });
};

const buildRootActions = (ctx: MctsContext): MctsAction[] => {
  const budget = budgetForDifficulty(ctx.difficulty);
  const actions: MctsAction[] = [];

  const shotRes = chooseBotActionDebug(ctx.rng, ctx.world, ctx.shooter, ctx.enemies, ctx.allies, ctx.botCfg, ctx.difficulty, ctx.shotMemory);
  if (shotRes?.trace) {
    const shots = topShotCandidates(shotRes.trace, budget.topShots);
    for (const s of shots) actions.push({ kind: 'shot', action: s.action, score: s.score, expectedDamage: s.expectedDamage, targetId: s.targetId });
  } else if (shotRes) {
    actions.push({ kind: 'shot', action: shotRes.action, score: shotRes.score, expectedDamage: (shotRes.trace as any)?.chosen?.expectedDamage || 0, targetId: shotRes.action.targetId });
  }

  const maxSpeed = 22.75 * (ctx.shooter.speedMultiplier || 1);
  const maxMoveDist = Math.max(0, maxSpeed * Math.max(0.2, ctx.moveSeconds));
  const span = clamp(maxMoveDist + 140, 120, 520);
  const minX = clamp(ctx.shooter.x - span, 30, ctx.world.terrain.width - 30);
  const maxX = clamp(ctx.shooter.x + span, 30, ctx.world.terrain.width - 30);
  const step = Math.max(22, Math.floor((maxX - minX) / Math.max(1, budget.topMoves - 1)));
  for (let x = minX; x <= maxX + 0.0001; x += step) {
    const yTop = surfaceY(ctx.world.terrain, x);
    if (yTop === null) continue;
    const y = clamp(yTop - (ctx.shooter.height || 10) / 2 - 1, 25, ctx.world.terrain.height - 25);
    actions.push({ kind: 'move', x, y });
    if (actions.filter(a => a.kind === 'move').length >= budget.topMoves) break;
  }

  return actions;
};

export function planWithMcts(ctx: MctsContext): MctsPlan | null {
  const budget = budgetForDifficulty(ctx.difficulty);

  const actions = buildRootActions(ctx);
  if (actions.length === 0) {
    const fallback = chooseBotPlan(ctx.rng, ctx.world, ctx.shooter, ctx.enemies, ctx.allies, ctx.botCfg, ctx.moveSeconds, ctx.ropeAttachBudget, ctx.difficulty, ctx.shotMemory);
    if (!fallback) return null;
    return { ...fallback, debug: { iterations: 0, used2ply: 0, bestScore: -999, fallback: 1 } } as any;
  }

  let used2ply = 0;
  const evalCache = new Map<string, { score: number; expectedDamage: number; action: any } | null>();
  const enemyCache = new Map<string, number>();
  const allow2ply = budget.enable2plyPct > 0;

  const enemyDamage = (shooter: BotWormSnapshot): number => {
    if (!allow2ply) return 0;
    const enemyShooter = ctx.enemies.filter(e => e.health > 0).sort((x, y) => Math.hypot(x.x - shooter.x, x.y - shooter.y) - Math.hypot(y.x - shooter.x, y.y - shooter.y))[0] || null;
    if (!enemyShooter) return 0;
    const key = `${enemyShooter.id}|${Math.round(shooter.x)}|${Math.round(shooter.y)}`;
    const prev = enemyCache.get(key);
    if (typeof prev === 'number') return prev;
    const enemyRes = chooseBotActionDebug(ctx.rng, ctx.world, enemyShooter as any, [shooter as any], [enemyShooter as any], ctx.botCfg, ctx.difficulty, ctx.shotMemory);
    const dmg = (enemyRes?.trace as any)?.chosen?.expectedDamage || 0;
    enemyCache.set(key, dmg);
    used2ply += 1;
    return dmg;
  };

  const evalMoveShot = (x: number, y: number): { score: number; expectedDamage: number; action: any } | null => {
    const k = `${Math.round(x)}|${Math.round(y)}`;
    if (evalCache.has(k)) return evalCache.get(k) || null;
    const shooterMoved = shooterAt(ctx.shooter, x, y);
    const shotRes = chooseBotActionDebug(ctx.rng, ctx.world, shooterMoved, ctx.enemies, ctx.allies, ctx.botCfg, ctx.difficulty, ctx.shotMemory);
    const out = shotRes ? { score: shotRes.score, expectedDamage: (shotRes.trace as any)?.chosen?.expectedDamage || 0, action: shotRes.action } : null;
    evalCache.set(k, out);
    return out;
  };

  let bestAction: MctsAction | null = null;
  let bestScore = -Infinity;
  for (const a of actions) {
    if (a.kind === 'shot') {
      let v = a.score;
      if (allow2ply && a.expectedDamage > 0.1) v -= enemyDamage(ctx.shooter) * 7.5;
      if (v > bestScore) {
        bestScore = v;
        bestAction = a;
      }
      continue;
    }
    const dist = Math.abs(a.x - ctx.shooter.x);
    const movePenalty = dist * (ctx.botCfg.scoring.movePenaltyPerPx || 0.08);
    const shotRes = evalMoveShot(a.x, a.y);
    if (!shotRes) continue;
    let v = shotRes.score - movePenalty;
    if (allow2ply && shotRes.expectedDamage > 0.1) v -= enemyDamage(shooterAt(ctx.shooter, a.x, a.y)) * 7.5;
    if (v > bestScore) {
      bestScore = v;
      bestAction = a;
    }
  }

  if (!bestAction) {
    const fallback = chooseBotPlan(ctx.rng, ctx.world, ctx.shooter, ctx.enemies, ctx.allies, ctx.botCfg, ctx.moveSeconds, ctx.ropeAttachBudget, ctx.difficulty, ctx.shotMemory);
    if (!fallback) return null;
    return { ...fallback, debug: { iterations: budget.iterations, used2ply, bestScore: -999, fallback: 1 } } as any;
  }

  if (bestAction.kind === 'shot') return { action: bestAction.action, debug: { iterations: budget.iterations, used2ply, bestScore } } as any;

  const moveTo = { x: bestAction.x, y: bestAction.y, allowRope: true };
  const bestShot = evalMoveShot(bestAction.x, bestAction.y);
  const action = bestShot?.action || null;
  if (action) return { moveTo, action, debug: { iterations: budget.iterations, used2ply, bestScore } } as any;
  return { moveTo, action: { weaponIndex: -1, facingRight: true, aimAngle: 0, power: 0 } as any, debug: { iterations: budget.iterations, used2ply, bestScore } } as any;
}
