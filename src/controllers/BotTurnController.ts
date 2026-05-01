import { mulberry32, hashStringToSeed } from '../utils/SeededRng';
import { getAIDifficulty } from '../ai/AIStorage';
import type { AIDifficulty, BotConfig } from '../ai/BotConfig';
import { DEFAULT_BOT_CONFIG } from '../ai/BotConfig';
import { buildSnapshotFromState, chooseBotAction, chooseBotActionDebug, chooseBotPlan, chooseDigAction, terrainFromLandscape } from '../ai/BotAI';

type MoveStrategy = 'walk' | 'jump' | 'rope_climb' | 'rope_swing' | 'rope_descend';
type RopeMode = 'climb' | 'swing' | 'descend';

export class BotTurnController {
  private difficultyByTeam: Partial<Record<'team1' | 'team2', AIDifficulty>> = {};
  private lastTurnIndex: number = -1;
  private firedThisTurn: boolean = false;
  private plannedThisTurn: boolean = false;
  private plan: { moveTo?: { x: number; y: number }; action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId?: string } } | null = null;
  private moveStartedAt: number = 0;

  private ropeAttachUsed: number = 0;
  private ropeStartedAt: number = 0;
  private lastRopeAttemptAt: number = -999;
  private digShotsThisTurn: number = 0;

  private matchKey: string = '';
  private matchAttempts: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private matchSuccess: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private matchFailStreak: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };

  private strategy: MoveStrategy | null = null;
  private ropeMode: RopeMode | null = null;
  private strategyCost0: number = Infinity;
  private strategyEvalAt: number = 0;
  private strategyAttemptsTurn: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private strategyFailTurn: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private bannedTurn: Set<MoveStrategy> = new Set();

  private lastJumpAt: number = -999;
  private jumpHoldUntil: number = 0;
  private lastX: number = 0;
  private stuckTime: number = 0;

  private lastCostAt: number = -999;
  private lastCost: number = Infinity;
  private lastReplanAt: number = -999;
  private lastMoveDir: 'left' | 'right' | null = null;
  private dirFlipWindowAt: number = -999;
  private dirFlipCount: number = 0;
  private lastDx: number = 0;
  private ropeStallCount: number = 0;
  private lastMovementCfg: { maxStrategyAttemptsPerTurn: number; maxStrategyFailuresPerTurn: number; replanWhenBannedAtLeast: number; replanCooldownSeconds: number } = {
    maxStrategyAttemptsPerTurn: 3,
    maxStrategyFailuresPerTurn: 3,
    replanWhenBannedAtLeast: 3,
    replanCooldownSeconds: 1.2
  };

  constructor(difficultyByTeam?: Partial<Record<'team1' | 'team2', AIDifficulty>>) {
    if (difficultyByTeam) this.difficultyByTeam = difficultyByTeam;
  }

  private recordAIVai(
    presenter: any,
    botCfg: BotConfig,
    difficulty: AIDifficulty,
    stage: string,
    action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number } | null,
    noisy: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number } | null
  ) {
    try {
      if (presenter?.state?.mode !== 'aivai') return;
      const cb = presenter?.onAIVaiTrace;
      if (typeof cb !== 'function') return;
      const terrain = terrainFromLandscape(presenter.state.landscape);
      const snap = buildSnapshotFromState(presenter.state, presenter.physics.gravity, terrain);
      const p = presenter.state.getCurrentPlayer?.();
      const shooter = snap.worms.find((w: any) => w.id === String(presenter.state.currentPlayerIndex));
      if (!p || !shooter) return;
      shooter.x = p.x;
      shooter.y = p.y;
      shooter.height = p.height || shooter.height;
      shooter.health = p.health || shooter.health;
      shooter.equipmentIds = Array.isArray(p.equipmentIds) ? p.equipmentIds : shooter.equipmentIds;
      shooter.weaponCooldowns = p.weaponCooldowns || shooter.weaponCooldowns;
      const enemies = snap.worms.filter((w: any) => w.team !== shooter.team && w.health > 0);
      const allies = snap.worms.filter((w: any) => w.team === shooter.team && w.health > 0);
      const dbg = chooseBotActionDebug(this.rngForTurn(presenter), snap.world, shooter, enemies, allies, botCfg);
      cb({
        type: 'bot_decision',
        t: presenter.matchDuration || 0,
        stage,
        team: shooter.team,
        wormId: shooter.id,
        pos: { x: shooter.x, y: shooter.y },
        health: shooter.health,
        difficulty,
        plan: this.plan?.moveTo ? { x: this.plan.moveTo.x, y: this.plan.moveTo.y } : null,
        action,
        noisy,
        debug: dbg
      });
    } catch {}
  }

  private debugEnabled(): boolean {
    try {
      const loc = (globalThis as any)?.location?.search || '';
      if (typeof loc === 'string' && loc.includes('bot_debug=1')) return true;
      return (globalThis as any)?.localStorage?.getItem('bot_debug') === '1';
    } catch {
      return false;
    }
  }

  private debug(event: string, data: any) {
    if (!this.debugEnabled()) return;
    try {
      console.log('[BOT]', event, data);
    } catch {}
  }

  public update(presenter: any, isWorldBusy: boolean): void {
    if (!presenter?.isRunning) return;
    if (!presenter?.isHost) return;
    if (!presenter?.state) return;
    if (presenter.state.mode !== 'ai' && presenter.state.mode !== 'aivai') return;

    const curIdx = presenter.state.currentPlayerIndex ?? -1;
    const player = presenter.state.getCurrentPlayer?.();
    if (!player || curIdx < 0) return;

    const nextMatchKey = `${presenter.state.mode}:${presenter.state.mapSeed}:${presenter.state.players?.length || 0}`;
    if (this.matchKey !== nextMatchKey) {
      this.matchKey = nextMatchKey;
      this.matchAttempts = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
      this.matchSuccess = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
      this.matchFailStreak = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
    }

    const isBotTurn = presenter.state.mode === 'aivai' ? (player.team === 'team1' || player.team === 'team2') : player.team === 'team2';

    if (curIdx !== this.lastTurnIndex) {
      this.lastTurnIndex = curIdx;
      this.firedThisTurn = false;
      this.plannedThisTurn = false;
      this.plan = null;
      this.moveStartedAt = presenter.matchDuration || 0;
      this.ropeAttachUsed = 0;
      this.ropeStartedAt = 0;
      this.lastRopeAttemptAt = -999;
      this.digShotsThisTurn = 0;
      this.strategy = null;
      this.ropeMode = null;
      this.strategyCost0 = Infinity;
      this.strategyEvalAt = presenter.matchDuration || 0;
      this.strategyAttemptsTurn = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
      this.strategyFailTurn = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
      this.bannedTurn = new Set();
      this.lastJumpAt = -999;
      this.jumpHoldUntil = 0;
      this.lastX = player.x;
      this.stuckTime = 0;
      this.lastCostAt = -999;
      this.lastCost = Infinity;
      this.lastReplanAt = -999;
      this.lastMoveDir = null;
      this.dirFlipWindowAt = -999;
      this.dirFlipCount = 0;
      this.lastDx = 0;
      this.ropeStallCount = 0;
      this.debug('turn_start', { idx: curIdx, name: player.name, x: Math.round(player.x), y: Math.round(player.y) });
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
      presenter.handleInput?.('up', false, true);
      presenter.handleInput?.('down', false, true);
      presenter.handleInput?.('jump', false, true);
      presenter.handleInput?.('fire', false, true);
    }

    if (!isBotTurn) return;

    const hasProjectiles = (presenter.state.projectiles?.length || 0) > 0;
    if (hasProjectiles) return;
    if (this.firedThisTurn) return;

    const botCfg: BotConfig = presenter.state.botConfig || DEFAULT_BOT_CONFIG;
    const activeTeam: 'team1' | 'team2' = player.team === 'team1' ? 'team1' : 'team2';
    const difficulty = (presenter.state.mode === 'aivai'
      ? (this.difficultyByTeam[activeTeam] as AIDifficulty | undefined)
      : ((getAIDifficulty() as AIDifficulty) || undefined)) || 'medium';
    const maxTurn = Number.isFinite(presenter.maxTurnTime) ? presenter.maxTurnTime : 30;
    const timeLeft = Number.isFinite(presenter.turnTimeLeft) ? presenter.turnTimeLeft : 0;
    const elapsed = Math.max(0, maxTurn - timeLeft);
    const planSeconds = botCfg.planSeconds;
    const reserveSeconds = botCfg.reserveSeconds;
    const executeSeconds = Math.max(0, maxTurn - planSeconds - reserveSeconds);
    const ropeBudget = botCfg.ropeAttachLimit[difficulty] ?? 0;
    const ropeRemaining = Math.max(0, ropeBudget - this.ropeAttachUsed);
    const now = presenter.matchDuration || 0;
    const dt = Number.isFinite(presenter.deltaTime) ? presenter.deltaTime : (1 / 60);
    this.lastMovementCfg = botCfg.movement || this.lastMovementCfg;

    if (timeLeft <= reserveSeconds) {
      if (!isWorldBusy) {
        const action = this.computeActionFromCurrent(presenter, botCfg);
        if (action) {
          const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter));
          this.recordAIVai(presenter, botCfg, difficulty, 'reserve_fire', action, noisy);
          this.fireAction(presenter, noisy);
          this.firedThisTurn = true;
        }
      }
      return;
    }

    if (elapsed < planSeconds) return;

    if (!this.plannedThisTurn && !isWorldBusy) {
      this.plannedThisTurn = true;
      const rng = this.rngForTurn(presenter);
      const terrain = terrainFromLandscape(presenter.state.landscape);
      const snap = buildSnapshotFromState(presenter.state, presenter.physics.gravity, terrain);
      const shooter = snap.worms.find(w => w.id === String(presenter.state.currentPlayerIndex));
      if (shooter) {
        const enemies = snap.worms.filter(w => w.team !== shooter.team && w.health > 0);
        const allies = snap.worms.filter(w => w.team === shooter.team && w.health > 0);
        const plan = chooseBotPlan(rng, snap.world, shooter, enemies, allies, botCfg, executeSeconds, ropeRemaining);
        if (plan) {
          this.plan = { moveTo: plan.moveTo, action: { weaponIndex: plan.action.weaponIndex, facingRight: plan.action.facingRight, aimAngle: plan.action.aimAngle, power: plan.action.power, targetId: plan.action.targetId } };
          this.moveStartedAt = now;
          this.debug('plan', { moveTo: plan.moveTo ? { x: Math.round(plan.moveTo.x), y: Math.round(plan.moveTo.y) } : null, weaponIndex: plan.action.weaponIndex, targetId: plan.action.targetId, ropeRemaining });
        } else if (botCfg.dig.enabled && this.digShotsThisTurn < botCfg.dig.maxShotsPerTurn) {
          const dig = chooseDigAction(rng, snap.world, shooter, enemies, allies, botCfg);
          if (dig) {
            const noisy = this.applyError({ weaponIndex: dig.weaponIndex, facingRight: dig.facingRight, aimAngle: dig.aimAngle, power: dig.power }, botCfg, difficulty, this.rngForTurn(presenter));
            this.recordAIVai(presenter, botCfg, difficulty, 'dig_fire', { weaponIndex: dig.weaponIndex, facingRight: dig.facingRight, aimAngle: dig.aimAngle, power: dig.power }, noisy);
            this.fireAction(presenter, noisy);
            this.firedThisTurn = true;
            this.digShotsThisTurn += 1;
            this.debug('dig_fire', { weaponIndex: noisy.weaponIndex });
          }
        } else {
          const fallback = chooseBotAction(rng, snap.world, shooter, enemies, allies, botCfg);
          const closest = enemies
            .map(e => ({ e, d: Math.hypot(e.x - shooter.x, e.y - shooter.y) }))
            .sort((a, b) => a.d - b.d)[0]?.e;
          if (fallback && closest) {
            const dir = closest.x >= shooter.x ? -1 : 1;
            const rx = Math.max(30, Math.min(snap.world.terrain.width - 30, shooter.x + dir * 140));
            this.plan = { moveTo: { x: rx, y: shooter.y }, action: { weaponIndex: fallback.weaponIndex, facingRight: fallback.facingRight, aimAngle: fallback.aimAngle, power: fallback.power, targetId: closest.id } };
            this.moveStartedAt = now;
            this.debug('plan', { moveTo: { x: Math.round(rx), y: Math.round(shooter.y) }, weaponIndex: fallback.weaponIndex, targetId: closest.id, ropeRemaining });
          }
        }
      }
    }

    if (!this.plan) return;

    const moveTo = this.plan.moveTo;
    const moveElapsed = Math.max(0, now - this.moveStartedAt);

    if (moveTo && moveElapsed < executeSeconds) {
      if (this.executeMovement(presenter, player, moveTo, now, dt, ropeBudget, ropeRemaining)) return;
    }

    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    presenter.handleInput?.('up', false, true);
    presenter.handleInput?.('down', false, true);
    presenter.handleInput?.('jump', false, true);
    this.trackStuck(player, dt);

    if (!isWorldBusy) {
      const planTarget = this.plan.action.targetId;
      let canUsePlanned = true;
      if (planTarget) {
        canUsePlanned = presenter.state.players.some((w: any, idx: number) => w.team !== player.team && w.health > 0 && String(idx) === String(planTarget));
      }

      const computed = this.computeActionFromCurrent(presenter, botCfg);
      const action = computed || (canUsePlanned ? this.plan.action : null);
      if (!action) return;
      const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter));
      this.recordAIVai(presenter, botCfg, difficulty, 'execute_fire', action, noisy);
      this.fireAction(presenter, noisy);
      this.firedThisTurn = true;
    }
  }

  private rngForTurn(presenter: any): () => number {
    const rngSeed = ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`ai:${presenter.matchDuration.toFixed(2)}:${presenter.state.currentPlayerIndex}`)) >>> 0;
    return mulberry32(rngSeed);
  }

  private computeActionFromCurrent(presenter: any, botCfg: BotConfig): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number } | null {
    const terrain = terrainFromLandscape(presenter.state.landscape);
    const snap = buildSnapshotFromState(presenter.state, presenter.physics.gravity, terrain);
    const p = presenter.state.getCurrentPlayer?.();
    if (!p) return null;
    const shooter = snap.worms.find(w => w.id === String(presenter.state.currentPlayerIndex));
    if (!shooter) return null;
    shooter.x = p.x;
    shooter.y = p.y;
    shooter.height = p.height || shooter.height;
    shooter.equipmentIds = Array.isArray(p.equipmentIds) ? p.equipmentIds : shooter.equipmentIds;
    shooter.weaponCooldowns = p.weaponCooldowns || shooter.weaponCooldowns;
    const enemies = snap.worms.filter(w => w.team !== shooter.team && w.health > 0);
    const allies = snap.worms.filter(w => w.team === shooter.team && w.health > 0);
    const act = chooseBotAction(this.rngForTurn(presenter), snap.world, shooter, enemies, allies, botCfg);
    if (!act) return null;
    return { weaponIndex: act.weaponIndex, facingRight: act.facingRight, aimAngle: act.aimAngle, power: act.power };
  }

  private applyError(
    action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number },
    botCfg: BotConfig,
    difficulty: AIDifficulty,
    rng: () => number
  ): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number } {
    const maxLocal = 78 * (Math.PI / 180);
    const aimPct = botCfg.aimErrorPct[difficulty] ?? 0;
    const powPct = botCfg.powerErrorPct[difficulty] ?? 0;
    const aimErr = (rng() * 2 - 1) * maxLocal * aimPct;
    const powErr = (rng() * 2 - 1) * powPct;
    return {
      weaponIndex: action.weaponIndex,
      facingRight: action.facingRight,
      aimAngle: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, action.aimAngle + aimErr)),
      power: Math.max(10, Math.min(100, action.power * (1 + powErr)))
    };
  }

  private fireAction(presenter: any, action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number }) {
    const player = presenter.state.getCurrentPlayer?.();
    if (!player) return;
    presenter.handleInput?.('switch', true, true, action.weaponIndex);
    player.facingRight = action.facingRight;
    player.aimAngle = action.aimAngle;
    player.aimPower = action.power;
    presenter.handleInput?.('fire', false, true);
  }

  private trackStuck(player: any, dt: number) {
    const dx = Math.abs(player.x - this.lastX);
    this.lastX = player.x;
    if (dx < 0.08) {
      this.stuckTime += dt;
    } else {
      this.stuckTime = 0;
    }
  }

  private executeMovement(
    presenter: any,
    player: any,
    moveTo: { x: number; y: number },
    now: number,
    dt: number,
    ropeBudget: number,
    ropeRemaining: number
  ): boolean {
    const dx = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const dir: 'left' | 'right' = dx < 0 ? 'left' : 'right';
    const dxAbs = Math.abs(dx);

    const prevDx = this.lastDx;
    this.lastDx = dx;
    if ((dxAbs < 24 && Math.abs(dy) < 26) || (Math.sign(prevDx) !== 0 && Math.sign(prevDx) !== Math.sign(dx) && dxAbs < 90)) return false;

    if (player.ropeActive) {
      this.executeRope(presenter, player, moveTo, dir, now, dt);
      return true;
    }

    if (this.lastMoveDir && this.lastMoveDir !== dir) {
      if (this.dirFlipWindowAt < 0 || now - this.dirFlipWindowAt > 1.4) {
        this.dirFlipWindowAt = now;
        this.dirFlipCount = 0;
      }
      this.dirFlipCount += 1;
    }
    this.lastMoveDir = dir;

    if (this.dirFlipCount >= 4 && (now - this.lastReplanAt) > this.lastMovementCfg.replanCooldownSeconds) {
      this.lastReplanAt = now;
      this.dirFlipWindowAt = now;
      this.dirFlipCount = 0;
      this.bannedTurn.add('walk');
      this.strategy = null;
      this.plannedThisTurn = false;
      this.plan = null;
      this.debug('replan', { reason: 'dir_flip', banned: Array.from(this.bannedTurn) });
      return true;
    }

    const cliff = this.scanCliffAhead(presenter, player, dir);
    const obstacle = this.detectObstacle(presenter, player, dir);
    const ceilingLow = this.detectCeilingLow(presenter, player, dir);

    if (obstacle && ceilingLow && this.stuckTime > 0.35) {
      this.bannedTurn.add('walk');
      this.bannedTurn.add('jump');
      if (now - this.lastReplanAt > this.lastMovementCfg.replanCooldownSeconds) {
        this.lastReplanAt = now;
        this.plannedThisTurn = false;
        this.plan = null;
        this.debug('replan', { reason: 'box_stuck', banned: Array.from(this.bannedTurn) });
      }
      return true;
    }

    if (this.strategy === 'walk' && this.stuckTime > 0.9) {
      this.bannedTurn.add('walk');
      this.strategy = null;
      if (now - this.lastReplanAt > this.lastMovementCfg.replanCooldownSeconds) {
        this.lastReplanAt = now;
        this.plannedThisTurn = false;
        this.plan = null;
        this.debug('replan', { reason: 'walk_stuck', banned: Array.from(this.bannedTurn) });
      }
      return true;
    }

    const strategy = this.selectStrategy(presenter, player, moveTo, dir, ropeRemaining);
    this.ensureStrategy(strategy, presenter, player, moveTo, now);

    if (this.strategy === 'rope_climb' || this.strategy === 'rope_swing' || this.strategy === 'rope_descend') {
      const ok = this.tryAttachRope(presenter, player, moveTo, dir, ropeBudget, now, this.strategy);
      if (ok) return true;
      this.recordStrategyFailure(this.strategy, now);
      this.strategy = null;
      return true;
    }

    if (this.strategy === 'jump') {
      if (this.tryJump(presenter, player, now)) {
        presenter.handleInput?.('left', false, true);
        presenter.handleInput?.('right', false, true);
        presenter.handleInput?.(dir, true, true);
        this.trackStuck(player, dt);
        this.evaluateStrategyProgress(presenter, player, moveTo, now);
        return true;
      }
      this.recordStrategyFailure('jump', now);
      this.strategy = null;
    }

    if (this.strategy === 'walk' && cliff.isDeepVoid) {
      this.recordStrategyFailure('walk', now);
      this.strategy = null;
      return true;
    }

    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    presenter.handleInput?.('jump', false, true);
    if (now < this.jumpHoldUntil) {
      presenter.handleInput?.(dir, true, true);
    } else {
      presenter.handleInput?.(dir, true, true);
    }
    this.trackStuck(player, dt);
    this.evaluateStrategyProgress(presenter, player, moveTo, now);
    return true;
  }

  private ensureStrategy(strategy: MoveStrategy, presenter: any, player: any, moveTo: { x: number; y: number }, now: number) {
    if (this.strategy === strategy) return;
    this.strategy = strategy;
    this.ropeMode = null;
    this.strategyEvalAt = now + 0.65;
    this.strategyCost0 = this.estimateCost(presenter, player, moveTo, now);
    this.strategyAttemptsTurn[strategy] = (this.strategyAttemptsTurn[strategy] || 0) + 1;
    this.matchAttempts[strategy] = (this.matchAttempts[strategy] || 0) + 1;
    this.debug('strategy', { strategy, attemptsTurn: this.strategyAttemptsTurn[strategy], banned: Array.from(this.bannedTurn) });
  }

  private evaluateStrategyProgress(presenter: any, player: any, moveTo: { x: number; y: number }, now: number) {
    if (!this.strategy) return;
    if (now < this.strategyEvalAt) return;
    const costNow = this.estimateCost(presenter, player, moveTo, now);
    const improved = costNow + 6 < this.strategyCost0;
    if (improved) {
      this.recordStrategySuccess(this.strategy);
      this.strategyCost0 = costNow;
      this.strategyEvalAt = now + 0.65;
      return;
    }

    this.recordStrategyFailure(this.strategy, now);
    this.strategy = null;
  }

  private recordStrategySuccess(strategy: MoveStrategy) {
    this.matchSuccess[strategy] = (this.matchSuccess[strategy] || 0) + 1;
    this.matchFailStreak[strategy] = 0;
    this.strategyFailTurn[strategy] = 0;
  }

  private recordStrategyFailure(strategy: MoveStrategy, now: number) {
    const cfg = this.lastMovementCfg;
    this.matchFailStreak[strategy] = (this.matchFailStreak[strategy] || 0) + 1;
    this.strategyFailTurn[strategy] = (this.strategyFailTurn[strategy] || 0) + 1;
    if (this.strategyFailTurn[strategy] >= cfg.maxStrategyFailuresPerTurn || this.strategyAttemptsTurn[strategy] >= cfg.maxStrategyAttemptsPerTurn) {
      this.bannedTurn.add(strategy);
    }
    if (now - this.lastReplanAt > cfg.replanCooldownSeconds && this.bannedTurn.size >= cfg.replanWhenBannedAtLeast) {
      this.lastReplanAt = now;
      this.plannedThisTurn = false;
      this.plan = null;
      this.debug('replan', { reason: 'banned_threshold', banned: Array.from(this.bannedTurn) });
    }
  }

  private selectStrategy(
    presenter: any,
    player: any,
    moveTo: { x: number; y: number },
    dir: 'left' | 'right',
    ropeRemaining: number
  ): MoveStrategy {
    const dy = moveTo.y - player.y;
    const needUp = dy < -30;
    const needDown = dy > 30;
    const obstacle = this.detectObstacle(presenter, player, dir);
    const cliff = this.scanCliffAhead(presenter, player, dir);
    const gap = cliff.isGapOrCliff;
    const ceilingLow = this.detectCeilingLow(presenter, player, dir);
    const hasRope = Array.isArray(player.equipmentIds) && player.equipmentIds.includes('rope') && ropeRemaining > 0;

    const candidates: MoveStrategy[] = [];
    if (hasRope && needUp) candidates.push('rope_climb');
    if (hasRope && gap) candidates.push('rope_swing');
    if (hasRope && needDown && !cliff.isDeepVoid) candidates.push('rope_descend');
    if (obstacle && !ceilingLow) candidates.push('jump');
    candidates.push('walk');

    let best: { s: MoveStrategy; score: number } | null = null;
    for (const s of candidates) {
      if (this.bannedTurn.has(s)) continue;
      let score = 0;
      if (s === 'walk') score += 0.2;
      if (s === 'jump') score += obstacle ? 1.4 : 0;
      if (s === 'rope_climb') score += needUp ? 1.8 : 0.3;
      if (s === 'rope_swing') score += gap ? 1.9 : 0.2;
      if (s === 'rope_descend') score += needDown ? 1.3 : 0.2;
      if (cliff.isGapOrCliff && s === 'walk') score -= 3.0;
      if (ceilingLow && s === 'jump') score -= 3.0;

      const att = this.matchAttempts[s] || 0;
      const suc = this.matchSuccess[s] || 0;
      const rate = (suc + 1) / (att + 2);
      score += (rate - 0.5) * 1.2;
      if ((this.matchFailStreak[s] || 0) >= 3) score -= 1.4;

      score -= (this.strategyAttemptsTurn[s] || 0) * 0.55;
      score -= (this.strategyFailTurn[s] || 0) * 0.85;

      if (!best || score > best.score) best = { s, score };
    }

    if (!best) return 'walk';
    return best.s;
  }

  private detectObstacle(presenter: any, player: any, dir: 'left' | 'right'): boolean {
    const ahead = (player.width || 10) + 10;
    const x = player.x + (dir === 'right' ? 1 : -1) * ahead;
    const yTop = player.y - (player.height || 10) / 2;
    const yMid = player.y;
    const yHead = yTop - 2;
    const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
    const solid = (xx: number, yy: number) => mat(Math.floor(xx), Math.floor(yy)) > 0;
    return solid(x, yMid) || solid(x, yTop) || solid(x, yHead);
  }

  private scanCliffAhead(
    presenter: any,
    player: any,
    dir: 'left' | 'right'
  ): { isGapOrCliff: boolean; isDeepVoid: boolean; maxDrop: number } {
    const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
    const w = presenter.state.width;
    const h = presenter.state.height;
    const sign = dir === 'right' ? 1 : -1;

    const yFoot = player.y + (player.height || 10) / 2 + 2;
    const yStart = Math.max(0, Math.floor(yFoot));
    const maxSearch = 220;

    const distances = [16, 28, 40, 52, 64, 80];
    let maxDrop = 0;
    let missingCount = 0;

    for (const d of distances) {
      const x = Math.floor(player.x + sign * ((player.width || 10) + d));
      if (x < 0 || x >= w) continue;
      let groundY: number | null = null;
      for (let y = yStart; y < Math.min(h, yStart + maxSearch); y++) {
        if (mat(x, y) > 0) {
          groundY = y;
          break;
        }
      }
      if (groundY === null) {
        missingCount += 1;
        maxDrop = Math.max(maxDrop, maxSearch);
      } else {
        maxDrop = Math.max(maxDrop, groundY - yStart);
      }
    }

    const isGapOrCliff = missingCount >= 2 || maxDrop >= 90;
    const isDeepVoid = missingCount >= 4 || maxDrop >= 170;
    return { isGapOrCliff, isDeepVoid, maxDrop };
  }

  private detectCeilingLow(presenter: any, player: any, dir: 'left' | 'right'): boolean {
    const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
    const w = presenter.state.width;
    const sign = dir === 'right' ? 1 : -1;
    const headY = player.y - (player.height || 10) / 2;
    const checksY = [Math.floor(headY - 6), Math.floor(headY - 14), Math.floor(headY - 22)];
    const checksX = [Math.floor(player.x), Math.floor(player.x + sign * ((player.width || 10) + 10))];
    for (const x of checksX) {
      if (x < 0 || x >= w) continue;
      for (const y of checksY) {
        if (y < 0) continue;
        if (mat(x, y) > 0) return true;
      }
    }
    return false;
  }

  private tryJump(presenter: any, player: any, now: number): boolean {
    if (player.isJumping) return false;
    if (now - this.lastJumpAt < 0.85) return false;
    this.lastJumpAt = now;
    this.jumpHoldUntil = now + 0.35;
    presenter.handleInput?.('jump', true, true);
    return true;
  }

  private ropeRaycast(
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

  private tryAttachRope(
    presenter: any,
    player: any,
    moveTo: { x: number; y: number },
    dir: 'left' | 'right',
    ropeBudget: number,
    now: number,
    strategy: MoveStrategy
  ): boolean {
    const equipmentIds: string[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const ropeIndex = equipmentIds.findIndex((id: string) => id === 'rope');
    if (ropeIndex < 0) return false;
    if (this.ropeAttachUsed >= ropeBudget) return false;
    if (player.ropeActive) return true;
    if (now - this.lastRopeAttemptAt < 0.55) return false;

    const dx = moveTo.x - player.x;
    if (Math.abs(dx) < 110) return false;

    presenter.handleInput?.('switch', true, true, ropeIndex);

    const baseY = player.y - player.height / 2;
    const dirSign = dir === 'right' ? 1 : -1;
    const isClimb = strategy === 'rope_climb';
    const isSwing = strategy === 'rope_swing';
    const isDescend = strategy === 'rope_descend';

    let best: { aimAngle: number; score: number } | null = null;
    const globalAngles: number[] = [];
    if (isClimb || isSwing) {
      const mags = [Math.PI / 4, Math.PI / 3, Math.PI * 0.42, Math.PI * 0.55];
      if (dir === 'right') globalAngles.push(...mags.map(v => -v));
      else globalAngles.push(...mags.map(v => Math.PI - v));
    } else if (isDescend) {
      const up = [Math.PI / 6, Math.PI / 4, Math.PI / 3];
      const down = [0.18, 0.35];
      if (dir === 'right') {
        globalAngles.push(...up.map(v => -v), ...down);
      } else {
        globalAngles.push(...up.map(v => Math.PI - v), ...down.map(v => Math.PI + v));
      }
    }

    for (const global of globalAngles) {
      const facingRight = Math.cos(global) >= 0;
      const aimAngle = facingRight ? global : (Math.PI - global);
      player.facingRight = facingRight;
      player.aimAngle = aimAngle;
      const res = this.ropeRaycast(presenter, player, 252);
      if (!res.hit) continue;
      const forward = (res.x - player.x) * dirSign;
      if (forward < 24) continue;
      const above = baseY - res.y;
      if (isClimb && above < 14) continue;
      if (isSwing && (above < 18 || res.dist < 130)) continue;
      if (!isDescend && res.y > player.y - 6) continue;
      if (isDescend && res.dist < 70) continue;

      const score = above * (isDescend ? 0.35 : 1.15) + forward * 0.65 + res.dist * (isSwing ? 0.5 : 0.22);
      if (!best || score > best.score) best = { aimAngle: aimAngle, score };
    }

    if (!best) {
      this.lastRopeAttemptAt = now;
      return false;
    }

    player.aimAngle = best.aimAngle;
    presenter.handleInput?.('fire', true, true);
    this.lastRopeAttemptAt = now;
    if (player.ropeActive) {
      this.ropeAttachUsed += 1;
      this.ropeStartedAt = now;
      this.ropeMode = isClimb ? 'climb' : isSwing ? 'swing' : 'descend';
      this.strategyCost0 = this.estimateCost(presenter, player, moveTo, now);
      this.strategyEvalAt = now + 0.65;
      this.ropeStallCount = 0;
      return true;
    }

    return false;
  }

  private executeRope(
    presenter: any,
    player: any,
    moveTo: { x: number; y: number },
    dir: 'left' | 'right',
    now: number,
    dt: number
  ) {
    const dx = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const dist2 = Math.hypot(dx, dy);
    const ropeElapsed = now - this.ropeStartedAt;
    const s: MoveStrategy = this.ropeMode === 'climb' ? 'rope_climb' : this.ropeMode === 'descend' ? 'rope_descend' : 'rope_swing';
    const dyAbs = Math.abs(dy);
    const dxAbs = Math.abs(dx);

    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    presenter.handleInput?.('up', false, true);
    presenter.handleInput?.('down', false, true);

    if (this.ropeMode === 'climb') {
      presenter.handleInput?.('up', true, true);
    } else if (this.ropeMode === 'descend') {
      presenter.handleInput?.('down', true, true);
    } else {
      presenter.handleInput?.(dir, true, true);
      if (dy < -20) presenter.handleInput?.('up', true, true);
      if (dy > 35) presenter.handleInput?.('down', true, true);
    }

    if (now >= this.strategyEvalAt) {
      const costNow = this.estimateCost(presenter, player, moveTo, now);
      const improved = costNow + 6 < this.strategyCost0;
      if (improved) {
        this.recordStrategySuccess(s);
        this.strategyCost0 = costNow;
        this.strategyEvalAt = now + 0.65;
        this.ropeStallCount = 0;
      } else {
        this.ropeStallCount += 1;
        this.strategyEvalAt = now + 0.65;
        if (ropeElapsed > 0.9 && this.ropeStallCount >= 2) {
          this.recordStrategyFailure(s, now);
          presenter.handleInput?.('fire', true, true);
          this.ropeMode = null;
          this.strategy = null;
          return;
        }
      }
    }

    const nearGoal = dist2 < 70 && dyAbs < 55;
    const swingRelease =
      this.ropeMode === 'swing' &&
      ropeElapsed > 1.0 &&
      dyAbs < 90 &&
      ((dir === 'right' && player.x >= moveTo.x - 10 && player.vx > 6) || (dir === 'left' && player.x <= moveTo.x + 10 && player.vx < -6));

    const shouldDetach =
      (nearGoal && (this.ropeMode !== 'swing' || dxAbs < 60)) ||
      swingRelease ||
      ropeElapsed > 4.0 ||
      (this.ropeMode === 'climb' && dy > -10) ||
      (this.ropeMode === 'descend' && dy < 10);

    if (shouldDetach) {
      presenter.handleInput?.('fire', true, true);
      this.ropeMode = null;
      this.strategy = null;
    }

    this.trackStuck(player, dt);
  }

  private estimateCost(presenter: any, player: any, moveTo: { x: number; y: number }, now: number): number {
    if (now - this.lastCostAt < 0.12) return this.lastCost;
    this.lastCostAt = now;

    const dx = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const dir = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    const step = 12;
    const steps = Math.max(1, Math.min(60, Math.floor(dist / step)));

    const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
    const w = presenter.state.width;
    const h = presenter.state.height;
    const surfaceY = (x: number): number | null => {
      const px = Math.floor(x);
      if (px < 0 || px >= w) return null;
      const y0 = Math.max(0, Math.floor(player.y) - 140);
      const y1 = Math.min(h - 1, Math.floor(player.y) + 260);
      for (let y = y0; y <= y1; y++) {
        if (mat(px, y) > 0) return y;
      }
      return null;
    };

    let cost = 0;
    let lastSY = surfaceY(player.x);
    for (let i = 1; i <= steps; i++) {
      const x = player.x + dir * i * step;
      const sy = surfaceY(x);
      if (sy === null || lastSY === null) {
        cost += step + 220;
        lastSY = sy;
        continue;
      }
      const dY = sy - lastSY;
      cost += step + Math.abs(dY) * 0.75;
      if (dY < -16) cost += 120;
      if (dY > 18) cost += 55;
      lastSY = sy;
    }

    cost += Math.abs(dy) * 0.6;
    if (this.detectObstacle(presenter, player, dx >= 0 ? 'right' : 'left')) cost += 80;
    this.lastCost = cost;
    return cost;
  }
}
