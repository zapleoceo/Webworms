import { AI_V } from '../../AIVersion';

export function applyStuckSafety(
  self: any,
  params: {
    presenter: any;
    player: any;
    dir: 'left' | 'right';
    now: number;
    obstacle: boolean;
    ceilingLow: boolean;
  }
): boolean {
  const { presenter, player, dir, now, obstacle, ceilingLow } = params;

  if ((obstacle || ceilingLow) && self.stuckTime > 0.75) {
    if (self.tryDigEscape(presenter, player, dir)) {
      if (presenter?.state?.mode === 'aivai2') {
        self.emitAIVai(presenter, {
          type: 'bot_escape_mode',
          t: now,
          team: player.team,
          wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''),
          turnNo: self.turnNo,
          mode: 'dig',
          reason: obstacle ? 'obstacle' : 'ceiling',
          dir,
          aiV: AI_V
        });
      }
      return true;
    }
  }

  if (obstacle && !ceilingLow && self.stuckTime > 0.45 && !self.backoffJumpDir && now - self.lastJumpAt > 0.9) {
    self.backoffJumpDir = dir;
    self.backoffJumpAt = now + 0.22;
    self.backoffJumpUntil = self.backoffJumpAt + 0.32;
    return true;
  }

  if (obstacle && ceilingLow && self.stuckTime > 0.35) {
    if (self.tryDigEscape(presenter, player, dir)) return true;
    self.bannedTurn.add('walk');
    self.bannedTurn.add('jump');
    if (now - self.lastReplanAt > self.lastMovementCfg.replanCooldownSeconds) {
      if (typeof self.resetPlanStateForReplan === 'function') self.resetPlanStateForReplan(now);
      else {
        self.lastReplanAt = now;
        self.plannedThisTurn = false;
        self.plan = null;
        self.movePathWaypoints = null;
        self.movePathIndex = 0;
        self.didReplanThisTurn = true;
      }
      self.debug('replan', { reason: 'box_stuck', banned: Array.from(self.bannedTurn) });
    }
    return true;
  }

  if (self.strategy === 'walk' && self.stuckTime > 0.9) {
    if (self.tryDigEscape(presenter, player, dir)) return true;
    const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
    if (team) self.matchSpecialFailByTeam[team].walkObstacle += 1;
    self.bannedTurn.add('walk');
    self.strategy = null;
    if (now - self.lastReplanAt > self.lastMovementCfg.replanCooldownSeconds) {
      if (typeof self.resetPlanStateForReplan === 'function') self.resetPlanStateForReplan(now);
      else {
        self.lastReplanAt = now;
        self.plannedThisTurn = false;
        self.plan = null;
        self.movePathWaypoints = null;
        self.movePathIndex = 0;
        self.didReplanThisTurn = true;
      }
      self.debug('replan', { reason: 'walk_stuck', banned: Array.from(self.bannedTurn) });
    }
    return true;
  }

  return false;
}
