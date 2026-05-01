import { chooseBotActionDebug, chooseBotPlan, type BotDecisionTrace, type BotWormSnapshot } from '../BotAI';
import { budgetForDifficulty } from './DifficultyBudgets';
import type { MctsAction, MctsContext, MctsPlan } from './MctsTypes';

type Node = {
  parent: Node | null;
  actionFromParent: MctsAction | null;
  children: Node[];
  unexpanded: MctsAction[];
  visits: number;
  valueSum: number;
  depth: number;
  shooter: BotWormSnapshot;
};

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

const uctSelect = (node: Node, rng: () => number): Node => {
  const c = 1.35;
  let best: Node | null = null;
  let bestScore = -Infinity;
  for (const ch of node.children) {
    const q = ch.visits > 0 ? ch.valueSum / ch.visits : 0;
    const u = c * Math.sqrt(Math.log(Math.max(1, node.visits)) / Math.max(1, ch.visits));
    const s = q + u + (rng() - 0.5) * 1e-6;
    if (s > bestScore) {
      bestScore = s;
      best = ch;
    }
  }
  return best || node.children[0];
};

const expand = (node: Node): Node | null => {
  if (node.unexpanded.length === 0) return null;
  const a = node.unexpanded.pop() as MctsAction;
  const nextShooter = a.kind === 'move' ? shooterAt(node.shooter, a.x, a.y) : node.shooter;
  const child: Node = { parent: node, actionFromParent: a, children: [], unexpanded: [], visits: 0, valueSum: 0, depth: node.depth + 1, shooter: nextShooter };
  node.children.push(child);
  return child;
};

const evaluateNode = (node: Node, ctx: MctsContext, allow2ply: boolean): { value: number; used2ply: number } => {
  let used2ply = 0;
  const a = node.actionFromParent;
  if (!a) return { value: 0, used2ply };

  if (a.kind === 'shot') {
    let v = a.score;
    if (allow2ply && a.expectedDamage > 0.1) {
      const enemyShooter = ctx.enemies.filter(e => e.health > 0).sort((x, y) => Math.hypot(x.x - node.shooter.x, x.y - node.shooter.y) - Math.hypot(y.x - node.shooter.x, y.y - node.shooter.y))[0] || null;
      if (enemyShooter) {
        const enemyRes = chooseBotActionDebug(ctx.rng, ctx.world, enemyShooter as any, [node.shooter as any], [enemyShooter as any], ctx.botCfg, ctx.difficulty, ctx.shotMemory);
        const dmg = (enemyRes?.trace as any)?.chosen?.expectedDamage || 0;
        v -= dmg * 7.5;
        used2ply = 1;
      }
    }
    return { value: v, used2ply };
  }

  const dist = Math.abs(a.x - ctx.shooter.x);
  const movePenalty = dist * (ctx.botCfg.scoring.movePenaltyPerPx || 0.08);
  const shooterMoved = shooterAt(ctx.shooter, a.x, a.y);
  const shotRes = chooseBotActionDebug(ctx.rng, ctx.world, shooterMoved, ctx.enemies, ctx.allies, ctx.botCfg, ctx.difficulty, ctx.shotMemory);
  if (!shotRes) return { value: -999 - movePenalty, used2ply };

  let v = shotRes.score - movePenalty;
  if (allow2ply && ((shotRes.trace as any)?.chosen?.expectedDamage || 0) > 0.1) {
    const enemyShooter = ctx.enemies.filter(e => e.health > 0).sort((x, y) => Math.hypot(x.x - shooterMoved.x, x.y - shooterMoved.y) - Math.hypot(y.x - shooterMoved.x, y.y - shooterMoved.y))[0] || null;
    if (enemyShooter) {
      const enemyRes = chooseBotActionDebug(ctx.rng, ctx.world, enemyShooter as any, [shooterMoved as any], [enemyShooter as any], ctx.botCfg, ctx.difficulty, ctx.shotMemory);
      const dmg = (enemyRes?.trace as any)?.chosen?.expectedDamage || 0;
      v -= dmg * 7.5;
      used2ply = 1;
    }
  }
  return { value: v, used2ply };
};

export function planWithMcts(ctx: MctsContext): MctsPlan | null {
  const budget = budgetForDifficulty(ctx.difficulty);

  const root: Node = {
    parent: null,
    actionFromParent: null,
    children: [],
    unexpanded: buildRootActions(ctx),
    visits: 0,
    valueSum: 0,
    depth: 0,
    shooter: ctx.shooter
  };

  if (root.unexpanded.length === 0) {
    const fallback = chooseBotPlan(ctx.rng, ctx.world, ctx.shooter, ctx.enemies, ctx.allies, ctx.botCfg, ctx.moveSeconds, ctx.ropeAttachBudget, ctx.difficulty, ctx.shotMemory);
    if (!fallback) return null;
    return { ...fallback, debug: { iterations: 0, used2ply: 0, bestScore: -999, fallback: 1 } } as any;
  }

  let used2ply = 0;
  for (let i = 0; i < budget.iterations; i++) {
    let node = root;
    while (node.children.length > 0 && node.unexpanded.length === 0) {
      node = uctSelect(node, ctx.rng);
    }

    const expanded = expand(node);
    if (expanded) node = expanded;

    const allow2ply = budget.enable2plyPct > 0 && ctx.rng() < budget.enable2plyPct;
    const ev = evaluateNode(node, ctx, allow2ply);
    used2ply += ev.used2ply;

    while (node) {
      node.visits += 1;
      node.valueSum += ev.value;
      node = node.parent as any;
    }
  }

  let best: Node | null = null;
  let bestScore = -Infinity;
  for (const ch of root.children) {
    const q = ch.visits > 0 ? ch.valueSum / ch.visits : -Infinity;
    if (q > bestScore) {
      bestScore = q;
      best = ch;
    }
  }

  if (!best || !best.actionFromParent) {
    const fallback = chooseBotPlan(ctx.rng, ctx.world, ctx.shooter, ctx.enemies, ctx.allies, ctx.botCfg, ctx.moveSeconds, ctx.ropeAttachBudget, ctx.difficulty, ctx.shotMemory);
    if (!fallback) return null;
    return { ...fallback, debug: { iterations: budget.iterations, used2ply, bestScore: -999, fallback: 1 } } as any;
  }

  if (best.actionFromParent.kind === 'shot') {
    return { action: best.actionFromParent.action, debug: { iterations: budget.iterations, used2ply, bestScore } } as any;
  }

  const moveTo = { x: best.actionFromParent.x, y: best.actionFromParent.y, allowRope: true };
  const movedShooter = shooterAt(ctx.shooter, best.actionFromParent.x, best.actionFromParent.y);
  const shot = chooseBotActionDebug(ctx.rng, ctx.world, movedShooter, ctx.enemies, ctx.allies, ctx.botCfg, ctx.difficulty, ctx.shotMemory);
  const action = shot?.action || null;
  if (action) return { moveTo, action, debug: { iterations: budget.iterations, used2ply, bestScore } } as any;
  return {
    moveTo,
    action: { weaponIndex: -1, facingRight: true, aimAngle: 0, power: 0 } as any,
    debug: { iterations: budget.iterations, used2ply, bestScore }
  } as any;
}
