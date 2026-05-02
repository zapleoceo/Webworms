import { mulberry32, hashStringToSeed } from '../utils/SeededRng';
import { getAIDifficulty } from '../ai/AIStorage';
import type { AIDifficulty, BotConfig } from '../ai/BotConfig';
import { DEFAULT_BOT_CONFIG } from '../ai/BotConfig';
import { terrainFromLandscape, type BotWormSnapshot } from '../ai/BotAI';
import { AI_V } from '../ai/AIVersion';
import ThinkWorker from '../ai/worker/BotThinkWorker?worker';

type MoveStrategy = 'walk' | 'jump' | 'rope_climb' | 'rope_swing' | 'rope_descend';
type RopeMode = 'climb' | 'swing' | 'descend';

export class BotTurnController {
  private difficultyByTeam: Partial<Record<'team1' | 'team2', AIDifficulty>> = {};
  private lastTurnIndex: number = -1;
  private firedThisTurn: boolean = false;
  private plannedThisTurn: boolean = false;
  private plan: { moveTo?: { x: number; y: number }; movePath?: { waypoints: Array<{ x: number; y: number }>; primitive: 'walk' | 'jump' | 'rope' }; action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string }; intent?: 'attack' | 'approach'; intentReason?: any } | null = null;
  private moveStartedAt: number = 0;

  private ropeAttachUsed: number = 0;
  private ropeStartedAt: number = 0;
  private lastRopeAttemptAt: number = -999;

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
  private lastMovementCfg: { maxStrategyAttemptsPerTurn: number; maxStrategyFailuresPerTurn: number; replanWhenBannedAtLeast: number; replanCooldownSeconds: number; maxReplansPerTurn: number } = {
    maxStrategyAttemptsPerTurn: 3,
    maxStrategyFailuresPerTurn: 3,
    replanWhenBannedAtLeast: 3,
    replanCooldownSeconds: 1.2,
    maxReplansPerTurn: 4
  };

  private thinkWorker: Worker | null = null;
  private workerJobId: string | null = null;
  private workerStartedAt: number = 0;
  private workerResult: any | null = null;
  private workerArrivedAt: number = 0;
  private lastThinkSrc: 'main' | 'worker' = 'main';
  private lastWorkerMs: number | null = null;
  private lastWorkerComputeMs: number | null = null;
  private lastWorkerArrivedAfterMain: 0 | 1 | null = null;
  private lastWorkerUsed: 0 | 1 | null = null;
  private didReplanThisTurn: boolean = false;
  private planningInProgress: boolean = false;
  private lastDecisionDebug: any | null = null;
  private lastTurnStateAt: number = -999;
  private workerInitError: string | null = null;

  private shotMemory: Map<string, { stateKey: string; shotKey: string; noRes: number; ff: number; lastT: number; targetId: string }> = new Map();
  private pendingShotEval: { stateKey: string; shotKey: string; team: 'team1' | 'team2'; health0: number[]; targetId: string } | null = null;
  private replanCountThisTurn: number = 0;
  private movePathWaypoints: Array<{ x: number; y: number }> | null = null;
  private movePathIndex: number = 0;

  constructor(difficultyByTeam?: Partial<Record<'team1' | 'team2', AIDifficulty>>) {
    if (difficultyByTeam) this.difficultyByTeam = difficultyByTeam;
  }

  private recordAIVai(
    presenter: any,
    _botCfg: BotConfig,
    difficulty: AIDifficulty,
    stage: string,
    action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } | null,
    noisy: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } | null
  ) {
    try {
      if (presenter?.state?.mode !== 'aivai') return;
      const cb = presenter?.onAIVaiTrace;
      if (typeof cb !== 'function') return;
      const p = presenter.state.getCurrentPlayer?.();
      if (!p) return;
      const wormId = String(presenter.state.currentPlayerIndex ?? '');
      cb({
        type: 'bot_decision',
        t: presenter.matchDuration || 0,
        stage,
        team: p.team,
        wormId,
        pos: { x: p.x, y: p.y },
        health: p.health,
        difficulty,
        aiV: AI_V,
        thinkSrc: this.lastThinkSrc,
        workerMs: this.lastWorkerMs,
        workerComputeMs: this.lastWorkerComputeMs,
        workerArrivedAfterMain: this.lastWorkerArrivedAfterMain,
        workerUsed: this.lastWorkerUsed,
        plan: this.plan?.moveTo ? { x: this.plan.moveTo.x, y: this.plan.moveTo.y } : null,
        action,
        noisy,
        debug: this.lastDecisionDebug
      });
    } catch {}
  }

  private emitAIVai(presenter: any, payload: any) {
    try {
      if (presenter?.state?.mode !== 'aivai') return;
      const cb = presenter?.onAIVaiTrace;
      if (typeof cb !== 'function') return;
      cb(payload);
    } catch {}
  }

  private ensureWorker() {
    if (this.thinkWorker) return;
    try {
      this.workerInitError = null;
      this.thinkWorker = new ThinkWorker();
      const worker = this.thinkWorker;
      if (!worker) return;
      worker.onerror = (evt: any) => {
        try {
          const msg = typeof evt?.message === 'string' ? evt.message : 'worker_error';
          this.workerInitError = msg;
        } catch {}
      };
      worker.onmessage = (evt: MessageEvent<any>) => {
        const msg = evt.data;
        if (!msg || msg.kind !== 'planResult') return;
        if (!this.workerJobId || msg.jobId !== this.workerJobId) return;
        this.workerResult = msg;
        this.workerArrivedAt = performance.now();
      };
    } catch {
      this.thinkWorker = null;
      this.workerInitError = 'worker_init_failed';
    }
  }

  private startWorkerPlan(presenter: any, worms: BotWormSnapshot[], shooterId: string, botCfg: BotConfig, executeSeconds: number, ropeRemaining: number, rngSeed: number, difficulty: AIDifficulty): void {
    try {
      this.ensureWorker();
      if (!this.thinkWorker) return;
      const terrain = presenter.state.landscape;
      const grid = terrain?.grid;
      if (!(grid instanceof Uint8Array)) return;
      const buf = grid.slice().buffer;
      const jobId = `${this.matchKey}:${presenter.state.currentPlayerIndex}:${(presenter.matchDuration || 0).toFixed(2)}`;
      this.workerJobId = jobId;
      this.workerStartedAt = performance.now();
      this.workerResult = null;
      this.workerArrivedAt = 0;
      const shotMemory = Array.from(this.shotMemory.values())
        .sort((a, b) => b.lastT - a.lastT)
        .slice(0, 160)
        .map(x => ({ stateKey: x.stateKey, shotKey: x.shotKey, noRes: x.noRes, ff: x.ff, targetId: x.targetId, lastT: x.lastT }));
      this.thinkWorker.postMessage({
        kind: 'plan',
        jobId,
        rngSeed,
        difficulty,
        gravity: presenter.physics.gravity,
        wind: presenter.state.wind || 0,
        teamAmmo: presenter.state.teamAmmo,
        terrain: { width: terrain.width, height: terrain.height, grid: buf },
        worms,
        shooterId,
        botCfg,
        executeSeconds,
        ropeRemaining,
        shotMemory
      }, [buf]);
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

  private buildBotView(presenter: any): { world: any; worms: BotWormSnapshot[]; shooter: BotWormSnapshot; enemies: BotWormSnapshot[]; allies: BotWormSnapshot[] } | null {
    const terrain = terrainFromLandscape(presenter.state.landscape);
    const world = { gravity: presenter.physics.gravity, wind: presenter.state.wind || 0, terrain, teamAmmo: presenter.state.teamAmmo };
    const players: any[] = Array.isArray(presenter.state.players) ? presenter.state.players : [];
    const worms: BotWormSnapshot[] = players.map((p: any, idx: number) => ({
      id: String(idx),
      team: p.team,
      x: p.x,
      y: p.y,
      width: p.width || 10,
      height: p.height || 10,
      health: p.health || 0,
      maxHealth: p.maxHealth || p.health || 0,
      defense: p.defense || 0,
      mass: p.mass || 1,
      jumpForce: p.jumpForce || -150,
      speedMultiplier: p.speedMultiplier || 1,
      weaponCooldowns: p.weaponCooldowns || {},
      equipmentIds: Array.isArray(p.equipmentIds) ? p.equipmentIds : []
    }));
    const shooter = worms.find((w) => w.id === String(presenter.state.currentPlayerIndex));
    if (!shooter) return null;
    const enemies = worms.filter((w) => w.team !== shooter.team && w.health > 0);
    const allies = worms.filter((w) => w.team === shooter.team && w.health > 0);
    return { world, worms, shooter, enemies, allies };
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
      this.shotMemory.clear();
      this.pendingShotEval = null;
    }

    const isBotTurn = presenter.state.mode === 'aivai' ? (player.team === 'team1' || player.team === 'team2') : player.team === 'team2';

    if (curIdx !== this.lastTurnIndex) {
      this.lastTurnIndex = curIdx;
      this.firedThisTurn = false;
      this.plannedThisTurn = false;
      this.plan = null;
      this.movePathWaypoints = null;
      this.movePathIndex = 0;
      this.moveStartedAt = presenter.matchDuration || 0;
      this.ropeAttachUsed = 0;
      this.ropeStartedAt = 0;
      this.lastRopeAttemptAt = -999;
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
      this.didReplanThisTurn = false;
      this.replanCountThisTurn = 0;
      this.planningInProgress = false;
      this.lastDecisionDebug = null;
      this.lastTurnStateAt = -999;
      this.lastThinkSrc = 'main';
      this.lastWorkerMs = null;
      this.lastWorkerComputeMs = null;
      this.lastWorkerArrivedAfterMain = null;
      this.lastWorkerUsed = null;
      this.workerJobId = null;
      this.workerResult = null;
      this.workerArrivedAt = 0;
      this.workerStartedAt = 0;
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
    if (this.pendingShotEval && !hasProjectiles && !isWorldBusy) {
      const health1 = Array.isArray(presenter.state.players) ? presenter.state.players.map((w: any) => Number(w?.health) || 0) : [];
      let enemyDelta = 0;
      let allyDelta = 0;
      for (let i = 0; i < health1.length; i++) {
        const h0 = this.pendingShotEval.health0[i] ?? health1[i] ?? 0;
        const d = Math.max(0, h0 - (health1[i] ?? 0));
        const w = presenter.state.players?.[i];
        if (!w) continue;
        if (w.team !== this.pendingShotEval.team) enemyDelta += d;
        else allyDelta += d;
      }
      const key = `${this.pendingShotEval.targetId}|${this.pendingShotEval.stateKey}|${this.pendingShotEval.shotKey}`;
      const prev = this.shotMemory.get(key) || { stateKey: this.pendingShotEval.stateKey, shotKey: this.pendingShotEval.shotKey, noRes: 0, ff: 0, lastT: 0, targetId: this.pendingShotEval.targetId };
      if (enemyDelta <= 0.01) prev.noRes += 1;
      if (allyDelta > 0.01) prev.ff += 1;
      prev.lastT = presenter.matchDuration || 0;
      prev.targetId = this.pendingShotEval.targetId;
      this.shotMemory.set(key, prev);
      if (this.shotMemory.size > 360) {
        const entries = Array.from(this.shotMemory.entries()).sort((a, b) => a[1].lastT - b[1].lastT);
        for (let k = 0; k < Math.max(0, entries.length - 320); k++) this.shotMemory.delete(entries[k][0]);
      }
      this.emitAIVai(presenter, {
        type: 'shot_eval',
        t: presenter.matchDuration || 0,
        team: this.pendingShotEval.team,
        wormId: String(presenter.state.currentPlayerIndex ?? ''),
        targetId: this.pendingShotEval.targetId,
        stateKey: this.pendingShotEval.stateKey,
        shotKey: this.pendingShotEval.shotKey,
        enemyDelta,
        allyDelta,
        noRes: enemyDelta <= 0.01 ? 1 : 0,
        ff: allyDelta > 0.01 ? 1 : 0,
        aiV: AI_V
      });
      this.pendingShotEval = null;
    }
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

    if ((presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai') && !this.workerJobId && !this.planningInProgress) {
      const view = this.buildBotView(presenter);
      if (!view) return;
      const rngSeed = this.rngSeedForTurn(presenter);
      this.startWorkerPlan(presenter, view.worms, view.shooter.id, botCfg, executeSeconds, ropeRemaining, rngSeed, difficulty);
      this.planningInProgress = true;
    }

    if (now - this.lastTurnStateAt >= 0.9) {
      this.lastTurnStateAt = now;
      this.emitAIVai(presenter, {
        type: 'turn_state',
        t: now,
        team: player.team,
        wormId: String(curIdx),
        currentPlayerIndex: presenter.state.currentPlayerIndex,
        isBotTurn: isBotTurn ? 1 : 0,
        isWorldBusy: isWorldBusy ? 1 : 0,
        projectiles: (presenter.state.projectiles?.length || 0),
        turnTimeLeft: presenter.turnTimeLeft,
        maxTurnTime: presenter.maxTurnTime,
        plannedThisTurn: this.plannedThisTurn ? 1 : 0,
        planningInProgress: this.planningInProgress ? 1 : 0,
        firedThisTurn: this.firedThisTurn ? 1 : 0,
        workerReady: this.thinkWorker ? 1 : 0,
        workerInitError: this.workerInitError,
        aiV: AI_V
      });
    }

    if (timeLeft <= reserveSeconds) {
      if (!isWorldBusy) {
        const action0 = this.plan?.action || this.fallbackAction(presenter);
        const action = action0 && action0.weaponIndex >= 0 ? action0 : this.fallbackAction(presenter);
        if (action) {
          const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter), presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai');
          this.recordAIVai(presenter, botCfg, difficulty, 'reserve_fire', action, noisy);
          this.fireAction(presenter, noisy);
          this.firedThisTurn = true;
        }
      }
      return;
    }

    if (this.planningInProgress && !isWorldBusy) {
      const wr = (this.workerResult && this.workerJobId && this.workerResult.jobId === this.workerJobId) ? this.workerResult : null;
      const wrOk = !!(wr && wr.ok === 1 && wr.plan);
      if (wrOk) {
        this.lastWorkerArrivedAfterMain = 0;
        this.lastWorkerMs = Math.max(0, this.workerArrivedAt - this.workerStartedAt);
        this.lastWorkerComputeMs = Number(wr.ms);
        this.lastWorkerUsed = 1;
        this.lastThinkSrc = 'worker';
        this.lastDecisionDebug = wr.debug || null;
        const wp = (wr.plan as any).movePath?.waypoints;
        this.movePathWaypoints = Array.isArray(wp) ? wp.map((p: any) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 })) : null;
        this.movePathIndex = 0;
        this.plan = {
          moveTo: wr.plan.moveTo,
          movePath: (wr.plan as any).movePath || undefined,
          action: { weaponIndex: wr.plan.action.weaponIndex, facingRight: wr.plan.action.facingRight, aimAngle: wr.plan.action.aimAngle, power: wr.plan.action.power, targetId: wr.plan.action.targetId },
          intent: wr.plan.intent,
          intentReason: wr.plan.intentReason
        };
        this.moveStartedAt = now;
        this.plannedThisTurn = true;
        this.planningInProgress = false;
        this.debug('plan', { moveTo: wr.plan.moveTo ? { x: Math.round(wr.plan.moveTo.x), y: Math.round(wr.plan.moveTo.y) } : null, weaponIndex: wr.plan.action.weaponIndex, targetId: wr.plan.action.targetId, ropeRemaining, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, arrivedAfterMain: this.lastWorkerArrivedAfterMain });
      } else if (!this.plannedThisTurn) {
        const minWait = Math.min(0.45, Math.max(0.12, planSeconds * 0.25));
        if (elapsed < minWait && timeLeft > reserveSeconds + 0.35) return;
        this.lastWorkerArrivedAfterMain = wr ? 1 : null;
        this.lastWorkerMs = wr ? Math.max(0, this.workerArrivedAt - this.workerStartedAt) : null;
        this.lastWorkerComputeMs = wr ? Number(wr.ms) : null;
        this.lastWorkerUsed = 0;
        this.lastThinkSrc = 'worker';
        this.lastDecisionDebug = wr?.debug || null;
        const fallback = this.fallbackAction(presenter);
        const moveTo = this.fallbackMoveTo(presenter);
        if (fallback || moveTo) {
          const placeholder = { weaponIndex: -1, facingRight: !!player.facingRight, aimAngle: player.aimAngle || 0, power: 60, targetId: 'none' };
          this.movePathWaypoints = null;
          this.movePathIndex = 0;
          this.plan = { moveTo: moveTo || undefined, action: fallback || placeholder };
          this.moveStartedAt = now;
          this.plannedThisTurn = true;
        }
      } else {
        this.lastDecisionDebug = wr?.debug || null;
      }
    }

    if (!this.plannedThisTurn && elapsed < planSeconds) return;

    if (!this.plan) return;
    const plan = this.plan;

    let moveTo = plan.moveTo;
    if (this.movePathWaypoints && this.movePathWaypoints.length > 0) {
      while (this.movePathIndex < this.movePathWaypoints.length) {
        const p = this.movePathWaypoints[this.movePathIndex];
        if (!p) break;
        const dx = Math.abs(p.x - player.x);
        const dy = Math.abs(p.y - player.y);
        if (dx < 24 && dy < 28) {
          this.movePathIndex += 1;
          continue;
        }
        moveTo = p;
        break;
      }
    }
    const moveElapsed = Math.max(0, now - this.moveStartedAt);

    const maxReplans = this.lastMovementCfg.maxReplansPerTurn ?? 4;
    if (presenter?.state?.mode === 'aivai' && this.plannedThisTurn && !this.planningInProgress && this.replanCountThisTurn < maxReplans && timeLeft > reserveSeconds + 0.9) {
      const near =
        !!moveTo &&
        Math.abs((moveTo?.x || 0) - player.x) < 42 &&
        Math.abs((moveTo?.y || 0) - player.y) < 58;
      const wantsReplan = near || this.stuckTime > 0.9;
      if (wantsReplan && moveElapsed > executeSeconds * 0.35 && moveElapsed < executeSeconds * 0.92) {
        const view = this.buildBotView(presenter);
        if (view) {
          const rngSeed = this.rngSeedForTurn(presenter) ^ 0x5bd1e995;
          const remaining = Math.max(0.6, executeSeconds - moveElapsed);
          this.replanCountThisTurn += 1;
          this.startWorkerPlan(presenter, view.worms, view.shooter.id, botCfg, remaining, ropeRemaining, rngSeed, difficulty);
          this.planningInProgress = true;
        }
      }
    }

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
      const summaryDx = moveTo ? moveTo.x - player.x : 0;
      const summaryDy = moveTo ? moveTo.y - player.y : 0;
      const dir: 'left' | 'right' = summaryDx < 0 ? 'left' : 'right';
      const cliff = this.scanCliffAhead(presenter, player, dir);
      this.emitAIVai(presenter, {
        type: 'bot_movement_summary',
        t: now,
        team: player.team,
        wormId: String(curIdx),
        moveElapsed: Math.max(0, now - this.moveStartedAt),
        stuckTime: this.stuckTime,
        didReplan: this.didReplanThisTurn ? 1 : 0,
        strategy: this.strategy,
        lastMoveDir: this.lastMoveDir,
        dirFlips: this.dirFlipCount,
        dx: summaryDx,
        dy: summaryDy,
        cliffMaxDrop: cliff.maxDrop,
        cliffIsGap: cliff.isGapOrCliff ? 1 : 0,
        cliffIsVoid: cliff.isDeepVoid ? 1 : 0,
        bannedTurn: Array.from(this.bannedTurn),
        intent: this.plan.intent || 'attack',
        intentReason: this.plan.intentReason || null,
        aiV: AI_V,
        thinkSrc: this.lastThinkSrc,
        workerMs: this.lastWorkerMs,
        workerComputeMs: this.lastWorkerComputeMs
      });
      const planTarget = this.plan.action.targetId;
      let canUsePlanned = true;
      if (planTarget) {
        canUsePlanned = presenter.state.players.some((w: any, idx: number) => w.team !== player.team && w.health > 0 && String(idx) === String(planTarget));
      }

      const action = canUsePlanned ? this.plan.action : this.fallbackAction(presenter);
      if (!action) return;
      if (action.weaponIndex < 0) {
        const maxReplans = this.lastMovementCfg.maxReplansPerTurn ?? 4;
        const remaining = Math.max(0, executeSeconds - moveElapsed);
        if (this.replanCountThisTurn < maxReplans && remaining > 0.9) {
          const view = this.buildBotView(presenter);
          if (view) {
            const rngSeed = this.rngSeedForTurn(presenter) ^ (0x7f4a7c15 + (this.replanCountThisTurn | 0));
            this.replanCountThisTurn += 1;
            this.startWorkerPlan(presenter, view.worms, view.shooter.id, botCfg, remaining, ropeRemaining, rngSeed, difficulty);
            this.planningInProgress = true;
            this.plan = null;
            this.movePathWaypoints = null;
            this.movePathIndex = 0;
          }
          return;
        }
        const fb = this.fallbackAction(presenter);
        if (!fb) return;
        const noisyFb = this.applyError(fb, botCfg, difficulty, this.rngForTurn(presenter), presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai');
        this.recordAIVai(presenter, botCfg, difficulty, 'execute_fire', fb, noisyFb);
        this.fireAction(presenter, noisyFb);
        this.firedThisTurn = true;
        return;
      }
      const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter), presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai');
      this.recordAIVai(presenter, botCfg, difficulty, 'execute_fire', action, noisy);
      this.fireAction(presenter, noisy);
      this.firedThisTurn = true;
    }
  }

  private rngForTurn(presenter: any): () => number {
    return mulberry32(this.rngSeedForTurn(presenter));
  }

  private rngSeedForTurn(presenter: any): number {
    return ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`ai:${presenter.matchDuration.toFixed(2)}:${presenter.state.currentPlayerIndex}`)) >>> 0;
  }

  private fallbackAction(presenter: any): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } | null {
    const player = presenter?.state?.getCurrentPlayer?.();
    if (!player) return null;
    const equipmentIds: any[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const findIdx = (id: string) => equipmentIds.findIndex(x => x === id);
    const grenadeIdx = findIdx('grenade');
    const bazookaIdx = findIdx('bazooka');
    const idx = grenadeIdx >= 0 ? grenadeIdx : (bazookaIdx >= 0 ? bazookaIdx : 0);

    const enemies: any[] = Array.isArray(presenter?.state?.players)
      ? presenter.state.players.filter((w: any) => w && w.team !== player.team && w.health > 0)
      : [];
    if (enemies.length === 0) {
      return { weaponIndex: idx, facingRight: !!player.facingRight, aimAngle: player.aimAngle || 0, power: 60, targetId: 'none' };
    }
    enemies.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    const e = enemies[0];
    const dx = e.x - player.x;
    const dy = (e.y - e.height * 0.35) - (player.y - player.height * 0.35);
    const global = Math.atan2(dy, dx);
    const facingRight = dx >= 0;
    const aimAngle = facingRight ? global : (Math.PI - global);
    return { weaponIndex: idx, facingRight, aimAngle: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, aimAngle)), power: 60, targetId: String(presenter.state.players.indexOf(e)) };
  }

  private fallbackMoveTo(presenter: any): { x: number; y: number } | null {
    const player = presenter?.state?.getCurrentPlayer?.();
    if (!player) return null;
    const enemies: any[] = Array.isArray(presenter?.state?.players)
      ? presenter.state.players.filter((w: any) => w && w.team !== player.team && w.health > 0)
      : [];
    if (enemies.length === 0) return null;
    enemies.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    const e = enemies[0];
    const dx = (e.x - player.x) || 0;
    const step = Math.max(-220, Math.min(220, dx * 0.6));
    return { x: player.x + step, y: player.y };
  }

  private applyError(
    action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string },
    botCfg: BotConfig,
    difficulty: AIDifficulty,
    rng: () => number,
    noNoise: boolean
  ): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } {
    if (noNoise) return action;
    const maxLocal = 78 * (Math.PI / 180);
    const aimPct = botCfg.aimErrorPct[difficulty] ?? 0;
    const powPct = botCfg.powerErrorPct[difficulty] ?? 0;
    const aimErr = (rng() * 2 - 1) * maxLocal * aimPct;
    const powErr = (rng() * 2 - 1) * powPct;
    return {
      weaponIndex: action.weaponIndex,
      facingRight: action.facingRight,
      aimAngle: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, action.aimAngle + aimErr)),
      power: Math.max(10, Math.min(100, action.power * (1 + powErr))),
      targetId: action.targetId
    };
  }

  private fireAction(presenter: any, action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string }) {
    const player = presenter.state.getCurrentPlayer?.();
    if (!player) return;
    if (presenter?.state?.mode === 'aivai') {
      const equipmentIds: any[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
      const weaponId = typeof equipmentIds[action.weaponIndex] === 'string' ? equipmentIds[action.weaponIndex] : null;
      const health0 = Array.isArray(presenter.state.players) ? presenter.state.players.map((w: any) => Number(w?.health) || 0) : [];
      const sx = Math.floor((Number(player.x) || 0) / 32);
      const sy = Math.floor((Number(player.y) || 0) / 32);
      const enemies: any[] = Array.isArray(presenter.state.players) ? presenter.state.players.filter((w: any) => w && w.team !== player.team && w.health > 0) : [];
      enemies.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
      const e = enemies[0] || null;
      const ex = e ? Math.floor((Number(e.x) || 0) / 64) : -1;
      const ey = e ? Math.floor((Number(e.y) || 0) / 64) : -1;
      const stateKey = `${sx}:${sy}:${ex}:${ey}`;
      const angleDeg = action.aimAngle * (180 / Math.PI);
      const angleBin = Math.round(angleDeg / 2);
      const powerBin = Math.round(action.power / 5);
      const shotKey = `${weaponId || 'none'}:${action.facingRight ? 1 : 0}:${angleBin}:${powerBin}`;
      if (weaponId) this.pendingShotEval = { stateKey, shotKey, team: player.team, health0, targetId: action.targetId };
      this.emitAIVai(presenter, {
        type: 'weapon_fired',
        t: presenter.matchDuration || 0,
        team: player.team,
        wormId: String(presenter.state.currentPlayerIndex ?? ''),
        weaponIndex: action.weaponIndex,
        weaponId,
        facingRight: action.facingRight ? 1 : 0,
        aimAngle: action.aimAngle,
        power: action.power,
        pos: { x: player.x, y: player.y },
        targetId: action.targetId,
        aiV: AI_V
      });
    }
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
      this.movePathWaypoints = null;
      this.movePathIndex = 0;
      this.didReplanThisTurn = true;
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
        this.movePathWaypoints = null;
        this.movePathIndex = 0;
        this.didReplanThisTurn = true;
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
        this.movePathWaypoints = null;
        this.movePathIndex = 0;
        this.didReplanThisTurn = true;
        this.debug('replan', { reason: 'walk_stuck', banned: Array.from(this.bannedTurn) });
      }
      return true;
    }

    const forced = this.plan?.movePath?.primitive || null;
    let strategy: MoveStrategy | null = null;
    if (forced === 'jump' && !ceilingLow && !this.bannedTurn.has('jump')) {
      strategy = 'jump';
    }
    if (!strategy && forced === 'rope' && ropeRemaining > 0) {
      const dy = moveTo.y - player.y;
      const needUp = dy < -30;
      const needDown = dy > 30;
      const gap = cliff.isGapOrCliff;
      const candidates: MoveStrategy[] = [];
      if (needUp) candidates.push('rope_climb');
      if (gap) candidates.push('rope_swing');
      if (needDown && !cliff.isDeepVoid) candidates.push('rope_descend');
      candidates.push('rope_swing', 'rope_climb', 'rope_descend');
      for (const c of candidates) {
        if (!this.bannedTurn.has(c)) {
          strategy = c;
          break;
        }
      }
    }
    if (!strategy) strategy = this.selectStrategy(presenter, player, moveTo, dir, ropeRemaining);
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
      this.movePathWaypoints = null;
      this.movePathIndex = 0;
      this.didReplanThisTurn = true;
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
    const hasRope = Array.isArray(player.equipmentIds) && player.equipmentIds.includes('ninja_rope') && ropeRemaining > 0;

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
    const chosen = best.s;
    if (chosen !== this.strategy) {
      this.emitAIVai(presenter, {
        type: 'bot_move_strategy',
        t: presenter.matchDuration || 0,
        team: player.team,
        wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''),
        strategy: chosen,
        why: { needUp: needUp ? 1 : 0, needDown: needDown ? 1 : 0, gap: gap ? 1 : 0, obstacle: obstacle ? 1 : 0, ceilingLow: ceilingLow ? 1 : 0, ropeRemaining },
        moveTo: { x: moveTo.x, y: moveTo.y },
        bannedTurn: Array.from(this.bannedTurn),
        aiV: AI_V,
        thinkSrc: this.lastThinkSrc,
        workerMs: this.lastWorkerMs,
        workerComputeMs: this.lastWorkerComputeMs
      });
    }
    return chosen;
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
    const isDeepVoid = missingCount >= 4;
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
    const ropeIndex = equipmentIds.findIndex((id: string) => id === 'ninja_rope');
    const ropeRemaining = Math.max(0, ropeBudget - this.ropeAttachUsed);
    if (ropeIndex < 0) {
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'no_rope', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs });
      return false;
    }
    if (this.ropeAttachUsed >= ropeBudget) {
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'budget', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs });
      return false;
    }
    if (player.ropeActive) return true;
    if (now - this.lastRopeAttemptAt < 0.55) {
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'cooldown', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs });
      return false;
    }

    const dx = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const isClimb = strategy === 'rope_climb';
    const isSwing = strategy === 'rope_swing';
    const isDescend = strategy === 'rope_descend';
    const allowNearDx = (isClimb || isDescend) && Math.abs(dy) >= 80;
    if (Math.abs(dx) < 110 && !allowNearDx) {
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'dx_small', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining });
      return false;
    }

    presenter.handleInput?.('switch', true, true, ropeIndex);

    const baseY = player.y - player.height / 2;
    const dirSign = dir === 'right' ? 1 : -1;

    let best: { aimAngle: number; score: number } | null = null;
    const globalAngles: number[] = [];
    const bothSides = (isClimb || isDescend) && Math.abs(dx) < 80;
    if (isClimb || isSwing) {
      const mags = [Math.PI / 4, Math.PI / 3, Math.PI * 0.42, Math.PI * 0.55];
      if (dir === 'right' || bothSides) globalAngles.push(...mags.map(v => -v));
      if (dir === 'left' || bothSides) globalAngles.push(...mags.map(v => Math.PI - v));
    } else if (isDescend) {
      const up = [Math.PI / 6, Math.PI / 4, Math.PI / 3];
      const down = [0.18, 0.35];
      if (dir === 'right' || bothSides) {
        globalAngles.push(...up.map(v => -v), ...down);
      }
      if (dir === 'left' || bothSides) {
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
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'no_anchor', anglesTried: globalAngles.length, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining });
      return false;
    }

    player.aimAngle = best.aimAngle;
    presenter.handleInput?.('fire', true, true);
    this.lastRopeAttemptAt = now;
    this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'fired', anglesTried: globalAngles.length, bestScore: best.score, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining });
    if (player.ropeActive) {
      this.ropeAttachUsed += 1;
      this.ropeStartedAt = now;
      this.ropeMode = isClimb ? 'climb' : isSwing ? 'swing' : 'descend';
      this.strategyCost0 = this.estimateCost(presenter, player, moveTo, now);
      this.strategyEvalAt = now + 0.65;
      this.ropeStallCount = 0;
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'attached', anglesTried: globalAngles.length, bestScore: best.score, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining: Math.max(0, ropeRemaining - 1) });
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
