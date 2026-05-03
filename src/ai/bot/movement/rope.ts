import { AI_V } from '../../AIVersion';

function ropeRaycast(
  presenter: any,
  player: any,
  maxDist: number
): { hit: boolean; x: number; y: number; dist: number } {
  const baseY = player.y - player.height / 2;
  let globalAimAngle = player.aimAngle;
  if (!player.facingRight) globalAimAngle = Math.PI - player.aimAngle;

  const step = 4;
  for (let d = 12; d <= maxDist; d += step) {
    const x = player.x + Math.cos(globalAimAngle) * d;
    const y = baseY + Math.sin(globalAimAngle) * d;
    if (x <= 30 || x >= presenter.state.width - 30 || y <= 0 || y >= presenter.state.height - 30) break;
    if (presenter.state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
      return { hit: true, x, y, dist: d };
    }
  }
  const x = player.x + Math.cos(globalAimAngle) * maxDist;
  const y = baseY + Math.sin(globalAimAngle) * maxDist;
  return { hit: false, x, y, dist: maxDist };
}

export function tryAttachRope(
  self: any,
  presenter: any,
  player: any,
  moveTo: { x: number; y: number },
  dir: 'left' | 'right',
  ropeBudget: number,
  now: number,
  strategy: any
): 'ok' | 'cooldown' | 'soft' | 'hard' {
  const equipmentIds: string[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
  const ropeIndex = equipmentIds.findIndex((id: string) => id === 'ninja_rope');
  const ropeRemaining = Math.max(0, ropeBudget - self.ropeAttachUsed);
  if (ropeIndex < 0) {
    self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'no_rope', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs });
    return 'hard';
  }
  if (self.ropeAttachUsed >= ropeBudget) {
    self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'budget', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs });
    return 'hard';
  }
  if (player.ropeActive) return 'ok';
  const cooldownSec = player.isJumping ? 0.12 : 0.55;
  if (now - self.lastRopeAttemptAt < cooldownSec) return 'cooldown';

  const dx = moveTo.x - player.x;
  const dy = moveTo.y - player.y;
  const isClimb = strategy === 'rope_climb';
  const isSwing = strategy === 'rope_swing';
  const isDescend = strategy === 'rope_descend';
  const allowNearDx = ((isClimb || isDescend) && Math.abs(dy) >= 80) || dy <= -120 || player.isJumping;
  const minDx = isSwing ? (dy <= -120 || player.isJumping ? 30 : 70) : (dy <= -120 || player.isJumping ? 30 : 60);
  if (Math.abs(dx) < minDx && !allowNearDx) {
    self.lastRopeAttemptAt = now;
    self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'dx_small', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs, ropeRemaining, aimAngle: null, facingRight: null, rayHit: null, ropeActiveAfterFire: 0, ropeCast: null });
    return 'soft';
  }

  presenter.handleInput?.('switch', true, true, ropeIndex);

  const baseY = player.y - player.height / 2;
  const dirSign = dir === 'right' ? 1 : -1;

  let best: { aimAngle: number; score: number; ray: { hit: boolean; x: number; y: number; dist: number } } | null = null;
  const globalAngles: number[] = [];
  const bothSides = (isClimb || isDescend) && Math.abs(dx) < 80;
  if (isClimb || isSwing) {
    const mags = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI * 0.42, Math.PI * 0.55, Math.PI * 0.62, Math.PI * 0.72];
    if (dir === 'right' || bothSides) globalAngles.push(...mags.map((v) => -v));
    if (dir === 'left' || bothSides) globalAngles.push(...mags.map((v) => Math.PI - v));
  } else if (isDescend) {
    const up = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI * 0.42];
    const down = [0.12, 0.18, 0.26, 0.35];
    if (dir === 'right' || bothSides) {
      globalAngles.push(...up.map((v) => -v), ...down);
    }
    if (dir === 'left' || bothSides) {
      globalAngles.push(...up.map((v) => Math.PI - v), ...down.map((v) => Math.PI + v));
    }
  }

  for (const global of globalAngles) {
    const facingRight = Math.cos(global) >= 0;
    const aimAngle = facingRight ? global : (Math.PI - global);
    player.facingRight = facingRight;
    player.aimAngle = aimAngle;
    const res = ropeRaycast(presenter, player, 252);
    if (!res.hit) continue;
    const forward = (res.x - player.x) * dirSign;
    if (forward < 24) continue;
    const above = baseY - res.y;
    if (isClimb && above < 14) continue;
    if (isSwing && (above < 18 || res.dist < 130)) continue;
    if (!isDescend && res.y > player.y - 6) continue;
    if (isDescend && res.dist < 70) continue;

    const score = above * (isDescend ? 0.35 : 1.15) + forward * 0.65 + res.dist * (isSwing ? 0.5 : 0.22);
    if (!best || score > best.score) best = { aimAngle: aimAngle, score, ray: res };
  }

  if (!best) {
    self.lastRopeAttemptAt = now;
    self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'no_anchor', anglesTried: globalAngles.length, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs, ropeRemaining, aimAngle: null, facingRight: null, rayHit: null, ropeActiveAfterFire: 0, ropeCast: null });
    return 'hard';
  }

  const w = Number(presenter?.state?.width) || 0;
  const h = Number(presenter?.state?.height) || 0;
  const edgePadX = 70;
  const edgePadYTop = 10;
  const edgePadYBot = 70;
  if (best.ray.x <= edgePadX || best.ray.x >= w - edgePadX || best.ray.y <= edgePadYTop || best.ray.y >= h - edgePadYBot) {
    self.lastRopeAttemptAt = now;
    const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
    if (team) self.matchSpecialFailByTeam[team].ropeBorder += 1;
    self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'border', anglesTried: globalAngles.length, bestScore: best.score, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs, ropeRemaining, aimAngle: null, facingRight: null, rayHit: best.ray, ropeActiveAfterFire: 0, ropeCast: null });
    return 'hard';
  }

  player.aimAngle = best.aimAngle;
  presenter.handleInput?.('fire', true, true);
  presenter.handleInput?.('fire', false, true);
  self.lastRopeAttemptAt = now;
  self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'fired', anglesTried: globalAngles.length, bestScore: best.score, anchor: { x: best.ray.x, y: best.ray.y, dist: best.ray.dist }, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs, ropeRemaining, aimAngle: player.aimAngle, facingRight: player.facingRight ? 1 : 0, rayHit: best.ray, ropeActiveAfterFire: player.ropeActive ? 1 : 0, ropeCast: { x: player.ropeCastX, y: player.ropeCastY, t: player.ropeCastTime } });
  if (player.ropeActive) {
    self.ropeAttachUsed += 1;
    self.ropeStartedAt = now;
    self.ropeMode = isClimb ? 'climb' : isSwing ? 'swing' : 'descend';
    self.strategyCost0 = self.estimateCost(presenter, player, moveTo, now);
    self.strategyEvalAt = now + 0.65;
    self.ropeStallCount = 0;
    self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'attached', anglesTried: globalAngles.length, bestScore: best.score, anchor: { x: best.ray.x, y: best.ray.y, dist: best.ray.dist }, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs, ropeRemaining: Math.max(0, ropeRemaining - 1), aimAngle: player.aimAngle, facingRight: player.facingRight ? 1 : 0, rayHit: best.ray, ropeActiveAfterFire: 1, ropeCast: { x: player.ropeCastX, y: player.ropeCastY, t: player.ropeCastTime } });
    return 'ok';
  }

  self.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'fired_no_attach', anglesTried: globalAngles.length, bestScore: best.score, anchor: { x: best.ray.x, y: best.ray.y, dist: best.ray.dist }, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: self.lastThinkSrc, workerMs: self.lastWorkerMs, workerComputeMs: self.lastWorkerComputeMs, ropeRemaining, aimAngle: player.aimAngle, facingRight: player.facingRight ? 1 : 0, rayHit: best.ray, ropeActiveAfterFire: 0, ropeCast: { x: player.ropeCastX, y: player.ropeCastY, t: player.ropeCastTime } });
  const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
  if (team) self.matchSpecialFailByTeam[team].ropeNoAttach += 1;
  return 'hard';
}

export function executeRope(self: any, presenter: any, player: any, moveTo: { x: number; y: number }, dir: 'left' | 'right', now: number, dt: number): void {
  const dx = moveTo.x - player.x;
  const dy = moveTo.y - player.y;
  const dist2 = Math.hypot(dx, dy);
  const ropeElapsed = now - self.ropeStartedAt;
  const s: any = self.ropeMode === 'climb' ? 'rope_climb' : self.ropeMode === 'descend' ? 'rope_descend' : 'rope_swing';
  const dyAbs = Math.abs(dy);
  const dxAbs = Math.abs(dx);

  presenter.handleInput?.('left', false, true);
  presenter.handleInput?.('right', false, true);
  presenter.handleInput?.('up', false, true);
  presenter.handleInput?.('down', false, true);

  if (self.ropeMode === 'climb') {
    presenter.handleInput?.('up', true, true);
  } else if (self.ropeMode === 'descend') {
    presenter.handleInput?.('down', true, true);
  } else {
    presenter.handleInput?.(dir, true, true);
    if (dy < -20) presenter.handleInput?.('up', true, true);
    if (dy > 35) presenter.handleInput?.('down', true, true);
  }

  if (now >= self.strategyEvalAt) {
    const costNow = self.estimateCost(presenter, player, moveTo, now);
    const improved = costNow + 3 < self.strategyCost0;
    if (improved) {
      self.recordStrategySuccess(s);
      self.strategyCost0 = costNow;
      self.strategyEvalAt = now + 0.65;
      self.ropeStallCount = 0;
    } else {
      self.ropeStallCount += 1;
      self.strategyEvalAt = now + 0.65;
      if (ropeElapsed > 1.5 && self.ropeStallCount >= 4) {
        self.recordStrategyFailure(s, now);
        presenter.handleInput?.('fire', true, true);
        presenter.handleInput?.('fire', false, true);
        self.ropeMode = null;
        self.strategy = null;
        return;
      }
    }
  }

  const nearGoal = dist2 < 70 && dyAbs < 55;
  const swingRelease =
    self.ropeMode === 'swing' &&
    ropeElapsed > 1.0 &&
    dyAbs < 90 &&
    ((dir === 'right' && player.x >= moveTo.x - 10 && player.vx > 6) || (dir === 'left' && player.x <= moveTo.x + 10 && player.vx < -6));

  const shouldDetach =
    (nearGoal && (self.ropeMode !== 'swing' || dxAbs < 60)) ||
    swingRelease ||
    ropeElapsed > 4.0 ||
    (self.ropeMode === 'climb' && dy > -10) ||
    (self.ropeMode === 'descend' && dy < 10);

  if (shouldDetach) {
    presenter.handleInput?.('fire', true, true);
    presenter.handleInput?.('fire', false, true);
    self.ropeMode = null;
    self.strategy = null;
  }

  self.trackStuck(player, dt);
}

