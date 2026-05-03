import { mulberry32, hashStringToSeed } from '../utils/SeededRng';
import { getAIDifficulty } from '../ai/AIStorage';
import type { AIDifficulty, BotConfig } from '../ai/BotConfig';
import { DEFAULT_BOT_CONFIG } from '../ai/BotConfig';
import { terrainFromLandscape, chooseBotActionDebug, type BotWormSnapshot } from '../ai/BotAI';
import { getWeaponByEquipmentId } from '../equipment/EquipmentRegistry';
import { AI_V } from '../ai/AIVersion';
import { analyzePit } from '../ai/PitAnalyzer';
import { recordPriorSample, recordTemplateSample, snapshotBestPracticesForWorker, getTemplate } from '../ai/BestPractices';
import { buildStateKeyFromPresenter, computeWeaponsMask, getCasesByKey } from '../ai/CaseLibrary';
import ThinkWorker from '../ai/worker/BotThinkWorker?worker';

type MoveStrategy = 'walk' | 'jump' | 'rope_climb' | 'rope_swing' | 'rope_descend';
type RopeMode = 'climb' | 'swing' | 'descend';

export class BotTurnController {
  private difficultyByTeam: Partial<Record<'team1' | 'team2', AIDifficulty>> = {};
  private lastTurnIndex: number = -1;
  private turnNo: number = 0;
  private firedThisTurn: boolean = false;
  private plannedThisTurn: boolean = false;
  private plan: { moveTo?: { x: number; y: number }; movePath?: { waypoints: Array<{ x: number; y: number }>; primitive: 'walk' | 'jump' | 'rope' }; action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string }; intent?: 'attack' | 'approach' | 'escape_pit' | 'reposition_safety'; intentReason?: any } | null = null;
  private moveStartedAt: number = 0;

  private ropeAttachUsed: number = 0;
  private ropeStartedAt: number = 0;
  private lastRopeAttemptAt: number = -999;
  private lastRopeCooldownLoggedAt: number = -999;
  private ropeJumpAttachUntil: number = 0;
  private ropeJumpMoveTo: { x: number; y: number } | null = null;
  private ropeJumpDir: 'left' | 'right' | null = null;
  private ropeJumpBudget: number = 0;
  private ropeJumpStrategy: MoveStrategy | null = null;
  private backoffJumpAt: number = 0;
  private backoffJumpUntil: number = 0;
  private backoffJumpDir: 'left' | 'right' | null = null;

  private matchKey: string = '';
  private matchAttempts: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private matchSuccess: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private matchFailStreak: Record<MoveStrategy, number> = { walk: 0, jump: 0, rope_climb: 0, rope_swing: 0, rope_descend: 0 };
  private matchSpecialFailByTeam: Record<'team1' | 'team2', { ropeBorder: number; ropeNoAttach: number; walkCliff: number; walkObstacle: number }> = {
    team1: { ropeBorder: 0, ropeNoAttach: 0, walkCliff: 0, walkObstacle: 0 },
    team2: { ropeBorder: 0, ropeNoAttach: 0, walkCliff: 0, walkObstacle: 0 }
  };
  private lastPlannedTeam: 'team1' | 'team2' | null = null;
  private lastPlanningProgressByTeam: Record<'team1' | 'team2', any | null> = { team1: null, team2: null };
  private lastWorkerMsByTeam: Record<'team1' | 'team2', number | null> = { team1: null, team2: null };
  private lastWorkerComputeMsByTeam: Record<'team1' | 'team2', number | null> = { team1: null, team2: null };
  private lastThinkSrcByTeam: Record<'team1' | 'team2', 'main' | 'worker' | null> = { team1: null, team2: null };
  private lastCacheHitByTeam: Record<'team1' | 'team2', 0 | 1> = { team1: 0, team2: 0 };

  private caseCandidate: { stateKey: string; caseId: string; plan: any; expectedDamage: number } | null = null;
  private caseUsedThisTurn: 0 | 1 = 0;
  private caseUsedId: string | null = null;
  private caseUsedKey: string | null = null;
  private caseExpectedDamage: number | null = null;
  private caseSeedBinsThisTurn: Array<{ weaponIndex: number; angleBin: number; powerBin: number }> = [];
  private caseSeedLookupThisTurn: Map<string, { caseId: string; stateKey: string; expectedDamage: number }> = new Map();

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
  private wallStallRefX: number = 0;
  private wallStallTime: number = 0;
  private wallStallDir: 'left' | 'right' | null = null;
  private wallStallLastLoggedAt: number = -999;

  private lastCostAt: number = -999;
  private lastCost: number = Infinity;
  private lastReplanAt: number = -999;
  private lastMoveDir: 'left' | 'right' | null = null;
  private dirFlipWindowAt: number = -999;
  private dirFlipCount: number = 0;
  private lastDx: number = 0;
  private ropeStallCount: number = 0;
  private pitEscapeMode: 'jump' | 'rope' | 'dig' | null = null;
  private pitEscapeAttempts: { jump: number; rope: number; dig: number } = { jump: 0, rope: 0, dig: 0 };
  private lastPitCheckAt: number = -999;
  private lastPitKey: string = '';
  private lastPit: any | null = null;
  private pitDigFlip: 0 | 1 = 0;
  private pendingEscapeEval: { wormIndex: number; startDepthPx: number; startTrapped: 0 | 1; mode: 'jump' | 'rope' | 'dig' | null; dir: 'left' | 'right'; widthPx: number; mapSeed: number } | null = null;

  private clampMoveToByTimeBudget(presenter: any, player: any, moveTo: { x: number; y: number } | null, weaponIndex: number): { x: number; y: number } | null {
    if (!moveTo) return null;
    if (weaponIndex >= 0) return null;
    const maxTurnTime = Number(presenter?.maxTurnTime) || 0;
    const timeLeft = Number(presenter?.turnTimeLeft) || 0;
    const mode = presenter?.state?.mode;
    const reserveSeconds = mode === 'aivai' ? 2.0 : Number(presenter?.state?.botConfig?.reserveSeconds) || 1.0;
    const budget = Math.max(0, Math.min(maxTurnTime, timeLeft) - reserveSeconds);
    const maxDist0 = 50 + 85 * budget;
    const maxDist = weaponIndex >= 0 ? Math.min(maxDist0, 72) : maxDist0;
    const dx = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist)) return null;
    if (weaponIndex >= 0 && dist > maxDist) return null;
    if (dist <= maxDist) return moveTo;
    const s = maxDist / Math.max(1e-6, dist);
    const x = player.x + dx * s;
    const y = player.y + dy * s;
    const x1 = Math.max(24, Math.min((presenter?.state?.width || 0) - 24, x));
    const y1 = Math.max(24, Math.min((presenter?.state?.height || 0) - 24, y));
    return { x: x1, y: y1 };
  }

  private ensureClearLineMove(presenter: any, curIdx: number) {
    const plan = this.plan;
    if (!plan || !plan.action || plan.action.weaponIndex < 0) return;
    if (plan.moveTo) return;
    const player = presenter?.state?.players?.[curIdx];
    if (!player) return;
    const tIdx = Number(plan.action.targetId);
    const target = Number.isFinite(tIdx) ? presenter?.state?.players?.[tIdx] : null;
    if (!target) return;
    const dir = target.x >= player.x ? 1 : -1;
    const ally = presenter?.state?.players?.find((w: any, i: number) => i !== curIdx && w && w.team === player.team && ((dir > 0 && w.x > player.x && w.x < target.x) || (dir < 0 && w.x < player.x && w.x > target.x)) && Math.abs((w.y || 0) - (player.y || 0)) < 28 && Math.hypot((w.x || 0) - (player.x || 0), (w.y || 0) - (player.y || 0)) < 140);
    if (!ally) return;
    const step = 64 * dir;
    const x = Math.max(24, Math.min((presenter?.state?.width || 0) - 24, (player.x || 0) + step));
    const y = Math.max(24, Math.min((presenter?.state?.height || 0) - 24, (player.y || 0)));
    plan.moveTo = { x, y };
  }

  private emitPlanStart(presenter: any, now: number, curIdx: number) {
    try {
      if (presenter?.state?.mode !== 'aivai') return;
      const p = presenter.state.getCurrentPlayer?.();
      if (!p) return;
      const plan = this.plan;
      if (!plan) return;
      const ch = (this.lastDecisionDebug as any)?.trace?.chosen || null;
      const expected0 = ch && typeof ch.expectedDamage === 'number' && Number.isFinite(ch.expectedDamage) ? ch.expectedDamage : null;
      const expected = this.caseUsedThisTurn === 1 && typeof this.caseExpectedDamage === 'number' && Number.isFinite(this.caseExpectedDamage)
        ? this.caseExpectedDamage
        : expected0;
      const st = presenter.state;
      const players: any[] = Array.isArray(st?.players) ? st.players : [];
      const enemies = players.filter(x => x && x.team !== p.team && (x.health || 0) > 0);
      enemies.sort((a, b) => Math.hypot((a.x || 0) - p.x, (a.y || 0) - p.y) - Math.hypot((b.x || 0) - p.x, (b.y || 0) - p.y));
      const e = enemies[0] || null;
      const eq: string[] = Array.isArray(p.equipmentIds) ? p.equipmentIds.filter((x: any) => typeof x === 'string') : [];
      const weaponsMask = computeWeaponsMask(eq);
      this.emitAIVai(presenter, {
        type: 'bot_plan_start',
        t: now,
        team: p.team,
        wormId: String(curIdx),
        turnNo: this.turnNo,
        plan: {
          moveTo: plan.moveTo || null,
          action: plan.action || null,
          intent: plan.intent || null,
          intentReason: plan.intentReason || null
        },
        expectedDamage: expected,
        mapSeed: Number(st?.mapSeed) || 0,
        sx: Number(p.x) || 0,
        sy: Number(p.y) || 0,
        ex: e ? (Number(e.x) || 0) : null,
        ey: e ? (Number(e.y) || 0) : null,
        weaponsMask,
        caseUsed: this.caseUsedThisTurn,
        caseId: this.caseUsedId,
        caseKey: this.caseUsedKey,
        thinkSrc: this.lastThinkSrc,
        workerUsed: this.lastWorkerUsed,
        aiV: AI_V
      });
    } catch {}
  }

  private planShotKey(player: any, action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number }): string | null {
    const equipmentIds: any[] = Array.isArray(player?.equipmentIds) ? player.equipmentIds : [];
    const weaponId = typeof equipmentIds[action.weaponIndex] === 'string' ? equipmentIds[action.weaponIndex] : null;
    if (!weaponId) return null;
    const angleDeg = (Number(action.aimAngle) || 0) * (180 / Math.PI);
    const angleBin = Math.round(angleDeg / 2);
    const powerBin = Math.round((Number(action.power) || 0) / 5);
    return `${weaponId}:${action.facingRight ? 1 : 0}:${angleBin}:${powerBin}`;
  }

  private isMuzzleClear(presenter: any, player: any, action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string }): boolean {
    try {
      const baseAim = action.facingRight ? action.aimAngle : (Math.PI - action.aimAngle);
      const originX = Number(player.x) || 0;
      const originY = (Number(player.y) || 0) - (Number(player.height) || 0) / 2;
      const dirX = Math.cos(baseAim);
      const dirY = Math.sin(baseAim);
      const gunLength = 25;
      const step = 2;
      for (let d = 0; d <= gunLength; d += step) {
        const x = originX + dirX * d;
        const y = originY + dirY * d;
        if (x < 0 || x >= presenter.state.width || y < 0 || y >= presenter.state.height) return false;
        if (presenter.state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private refreshCaseCandidate(presenter: any, curIdx: number, botCfg: BotConfig) {
    try {
      this.caseCandidate = null;
      this.caseSeedBinsThisTurn = [];
      this.caseSeedLookupThisTurn = new Map();
      const player = presenter?.state?.players?.[curIdx];
      if (!player) return;
      const k = buildStateKeyFromPresenter(AI_V, presenter, curIdx);
      if (!k) return;
      const stateKey = k.stateKey;
      const all = getCasesByKey(stateKey);
      if (!Array.isArray(all) || all.length === 0) return;
      const max = 20;
      for (let i = 0; i < all.length && this.caseSeedBinsThisTurn.length < max; i++) {
        const c: any = all[i];
        const plan = c?.plan;
        const act = plan?.action;
        if (!plan || !act) continue;
        const action = { weaponIndex: Number(act.weaponIndex) || 0, facingRight: !!act.facingRight, aimAngle: Number(act.aimAngle) || 0, power: Number(act.power) || 0, targetId: String(act.targetId ?? '') };
        if (!Number.isFinite(action.weaponIndex) || action.weaponIndex < 0) continue;
        const equipmentIds: any[] = Array.isArray(player?.equipmentIds) ? player.equipmentIds : [];
        if (action.weaponIndex >= equipmentIds.length) continue;
        if (!this.isMuzzleClear(presenter, player, action)) continue;
        if (!this.isActionSelfSafe(presenter, player, action, botCfg)) continue;
        const angleDeg = action.aimAngle * (180 / Math.PI);
        const angleBin = Math.round(angleDeg / 2);
        const powerBin = Math.round(action.power / 5);
        this.caseSeedBinsThisTurn.push({ weaponIndex: action.weaponIndex, angleBin, powerBin });
        const key = this.planShotKey(player, action);
        if (key) {
          this.caseSeedLookupThisTurn.set(`${stateKey}|${key}`, { caseId: String(c.caseId || ''), stateKey, expectedDamage: Number(c.expectedDamage) || 0 });
        }
        if (!this.caseCandidate) {
          this.caseCandidate = { stateKey, caseId: String(c.caseId || ''), plan, expectedDamage: Number(c.expectedDamage) || 0 };
        }
      }
    } catch {}
  }

  private applyCaseUsage(presenter: any, curIdx: number) {
    try {
      if (presenter?.state?.mode !== 'aivai') return;
      const player = presenter?.state?.players?.[curIdx];
      const plan = this.plan;
      if (!player || !plan?.action) return;
      if (this.caseSeedLookupThisTurn.size === 0) return;
      const shotKey = this.planShotKey(player, plan.action);
      if (!shotKey) return;
      const k = buildStateKeyFromPresenter(AI_V, presenter, curIdx);
      const stateKey = k?.stateKey;
      if (!stateKey) return;
      const hit = this.caseSeedLookupThisTurn.get(`${stateKey}|${shotKey}`) || null;
      if (!hit) return;
      this.caseUsedThisTurn = 1;
      this.caseUsedId = hit.caseId || null;
      this.caseUsedKey = hit.stateKey || null;
      this.caseExpectedDamage = hit.expectedDamage;
    } catch {}
  }
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
  private lastPlanningProgress: any | null = null;
  private lastTurnStateAt: number = -999;
  private workerInitError: string | null = null;

  private shotMemory: Map<string, { stateKey: string; shotKey: string; noRes: number; ff: number; lastT: number; targetId: string }> = new Map();
  private pendingShotEval: { stateKey: string; shotKey: string; team: 'team1' | 'team2'; health0: number[]; targetId: string; shooterId: string; turnNo: number } | null = null;
  private lastFiredWeaponId: string | null = null;
  private lastFiredTargetId: string | null = null;
  private postShotMoveUntil: number = 0;
  private postShotDir: 'left' | 'right' | null = null;
  private replanCountThisTurn: number = 0;
  private movePathWaypoints: Array<{ x: number; y: number }> | null = null;
  private movePathIndex: number = 0;
  private workerTerrainReady: boolean = false;
  private workerTerrainDimKey: string = '';
  private workerTerrainDfEventIndex: number = 0;

  private bgWorker: Worker | null = null;
  private bgWorkerJobId: string | null = null;
  private bgWorkerResult: any | null = null;
  private lastBgPlanningProgress: any | null = null;
  private bgPlanningInProgress: boolean = false;
  private bgPlanKey: string | null = null;
  private bgWorkerTerrainReady: boolean = false;
  private bgWorkerTerrainDimKey: string = '';
  private bgWorkerTerrainDfEventIndex: number = 0;

  private planCache: Map<string, { key: string; createdAt: number; shooterId: string; rev: number; df: number; plan: any; debug: any; score: number }> = new Map();
  private lastCacheRev: number = -1;
  private lastCacheDf: number = -1;

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
      const equipmentIds: any[] = Array.isArray(p.equipmentIds) ? p.equipmentIds : [];
      const weaponId = action && action.weaponIndex >= 0 && typeof equipmentIds[action.weaponIndex] === 'string'
        ? equipmentIds[action.weaponIndex]
        : null;
      const grenLeftRaw = presenter?.state?.teamAmmo?.[p.team]?.grenade;
      const grenLeft = typeof grenLeftRaw === 'number' && Number.isFinite(grenLeftRaw) ? Math.max(0, Math.floor(grenLeftRaw)) : null;
      const vx = typeof p.vx === 'number' && Number.isFinite(p.vx) ? p.vx : null;
      const vy = typeof p.vy === 'number' && Number.isFinite(p.vy) ? p.vy : null;
      const compactDebug = (() => {
        const d = this.lastDecisionDebug;
        if (!d) return grenLeft === null && vx === null && vy === null ? null : { g: grenLeft, v: vx, w: vy };
        const tr = d.trace;
        if (!tr) return { g: grenLeft, v: vx, w: vy, s: d.score ?? null };
        const ch = tr.chosen;
        const chosenArr = ch
          ? [
              ch.weaponId,
              ch.weaponIndex,
              ch.targetId,
              ch.globalAngle,
              ch.power,
              ch.miss,
              ch.expectedDamage,
              ch.score,
              ch.impact?.x ?? 0,
              ch.impact?.y ?? 0,
              ch.selfDist,
              ch.selfSafe,
              ch.safeRadius,
              ch.risk ?? 0
            ]
          : null;
        const bw = tr.bestByWeaponId && typeof tr.bestByWeaponId === 'object'
          ? Object.entries(tr.bestByWeaponId).map(([id, s0]: any) => {
              const s = s0 as any;
              return [
                id,
                s.weaponIndex,
                s.targetId,
                s.globalAngle,
                s.power,
                s.miss,
                s.expectedDamage,
                s.score,
                s.impact?.x ?? 0,
                s.impact?.y ?? 0,
                s.selfDist,
                s.selfSafe,
                s.safeRadius,
                s.risk ?? 0
              ];
            })
          : null;
        return {
          g: grenLeft,
          v: vx,
          w: vy,
          sh: [tr.shooter?.id ?? null, tr.shooter?.team ?? null, tr.shooter?.x ?? null, tr.shooter?.y ?? null, tr.shooter?.health ?? null],
          t: tr.targetId ?? null,
          ch: chosenArr,
          bw,
          rj: tr.rejected || null
        };
      })();
      const wormId = String(presenter.state.currentPlayerIndex ?? '');
      cb({
        type: 'bot_decision',
        t: presenter.matchDuration || 0,
        stage,
        team: p.team,
        wormId,
        weaponId,
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
        debug: compactDebug
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
    if ((globalThis as any).__AIVAI_DISABLE_WORKERS) return;
    if (this.thinkWorker) return;
    try {
      this.workerInitError = null;
      this.thinkWorker = new ThinkWorker();
      this.workerTerrainReady = false;
      this.workerTerrainDimKey = '';
      this.workerTerrainDfEventIndex = 0;
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
        if (!msg) return;
        if (msg.kind === 'planProgress') {
          if (!this.workerJobId || msg.jobId !== this.workerJobId) return;
          this.lastPlanningProgress = msg;
          const team = this.lastPlannedTeam || 'team1';
          this.lastPlanningProgressByTeam[team] = msg;
          return;
        }
        if (msg.kind !== 'planResult') return;
        if (!this.workerJobId || msg.jobId !== this.workerJobId) return;
        this.workerResult = msg;
        this.workerArrivedAt = performance.now();
      };
    } catch {
      this.thinkWorker = null;
      this.workerInitError = 'worker_init_failed';
    }
  }

  private ensureBgWorker() {
    if ((globalThis as any).__AIVAI_DISABLE_WORKERS) return;
    if (this.bgWorker) return;
    try {
      this.bgWorker = new ThinkWorker();
      this.bgWorkerTerrainReady = false;
      this.bgWorkerTerrainDimKey = '';
      this.bgWorkerTerrainDfEventIndex = 0;
      const worker = this.bgWorker;
      if (!worker) return;
      worker.onerror = (evt: any) => {
        void evt;
      };
      worker.onmessage = (evt: MessageEvent<any>) => {
        const msg = evt.data;
        if (!msg) return;
        if (msg.kind === 'planProgress') {
          if (!this.bgWorkerJobId || msg.jobId !== this.bgWorkerJobId) return;
          this.lastBgPlanningProgress = msg;
          return;
        }
        if (msg.kind !== 'planResult') return;
        if (!this.bgWorkerJobId || msg.jobId !== this.bgWorkerJobId) return;
        this.bgWorkerResult = msg;
      };
    } catch {
      this.bgWorker = null;
    }
  }

  private terrainSig(presenter: any): { rev: number; df: number; dimKey: string } {
    const terrain = presenter?.state?.landscape;
    const dfEvents: any[] = Array.isArray((terrain as any)?.dfEvents) ? (terrain as any).dfEvents : [];
    const rev = Number((terrain as any)?.revision) || 0;
    const df = dfEvents.length;
    const dimKey = `${terrain?.width || 0}x${terrain?.height || 0}`;
    return { rev, df, dimKey };
  }

  private prunePlanCache(presenter: any) {
    const sig = this.terrainSig(presenter);
    if (sig.rev !== this.lastCacheRev || sig.df !== this.lastCacheDf) {
      this.lastCacheRev = sig.rev;
      this.lastCacheDf = sig.df;
      for (const [k, v] of this.planCache.entries()) {
        if (v.rev !== sig.rev || v.df !== sig.df) this.planCache.delete(k);
      }
    }
    if (this.planCache.size > 140) {
      const entries = Array.from(this.planCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
      for (let i = 0; i < Math.max(0, entries.length - 110); i++) this.planCache.delete(entries[i][0]);
    }
    const alive = presenter?.state?.players?.map((p: any, idx: number) => (p && p.health > 0) ? String(idx) : null).filter(Boolean) as string[] || [];
    if (alive.length > 0) {
      const aliveSet = new Set(alive);
      for (const [k, v] of this.planCache.entries()) {
        if (!aliveSet.has(v.shooterId)) this.planCache.delete(k);
      }
    }
  }

  private worldKey(presenter: any, shooterIndex: number, ropeRemaining: number): string {
    const sig = this.terrainSig(presenter);
    const wind = Number.isFinite(presenter?.state?.wind) ? Number(presenter.state.wind) : 0;
    const windBin = Math.round(wind / 10);
    const g1 = presenter?.state?.teamAmmo?.team1?.grenade;
    const g2 = presenter?.state?.teamAmmo?.team2?.grenade;
    const a1 = (typeof g1 === 'number' && Number.isFinite(g1)) ? Math.max(0, Math.floor(g1)) : -1;
    const a2 = (typeof g2 === 'number' && Number.isFinite(g2)) ? Math.max(0, Math.floor(g2)) : -1;
    const players: any[] = Array.isArray(presenter?.state?.players) ? presenter.state.players : [];
    const parts: string[] = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p || p.health <= 0) continue;
      const qx = Math.round((Number(p.x) || 0) / 16);
      const qy = Math.round((Number(p.y) || 0) / 16);
      const hh = Math.max(0, Math.min(10, Math.round((Number(p.health) || 0) / 10)));
      parts.push(`${i}${p.team === 'team1' ? 'a' : 'b'}${qx},${qy},${hh}`);
    }
    const raw = `${this.matchKey}|rev${sig.rev}|df${sig.df}|w${windBin}|g${a1}:${a2}|r${Math.round(ropeRemaining)}|s${shooterIndex}|${parts.join('|')}`;
    return String(hashStringToSeed(raw) >>> 0);
  }

  private buildBotViewForIndex(presenter: any, shooterIndex: number): { world: any; worms: BotWormSnapshot[]; shooter: BotWormSnapshot; enemies: BotWormSnapshot[]; allies: BotWormSnapshot[] } | null {
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
    const shooter = worms.find((w) => w.id === String(shooterIndex));
    if (!shooter || shooter.health <= 0) return null;
    const enemies = worms.filter((w) => w.team !== shooter.team && w.health > 0);
    const allies = worms.filter((w) => w.team === shooter.team && w.health > 0);
    return { world, worms, shooter, enemies, allies };
  }

  private peekNextTurnIndex(presenter: any): number {
    const state = presenter?.state;
    const players: any[] = Array.isArray(state?.players) ? state.players : [];
    if (players.length === 0) return -1;
    const cur = state.getCurrentPlayer?.();
    const curTeam = cur?.team || 'team1';
    const nextTeam = state.mode === 'training' ? 'team1' : (curTeam === 'team1' ? 'team2' : 'team1');
    if (!state.lastPlayedIndex) state.lastPlayedIndex = { team1: -1, team2: -1 };
    const lastIdx = Number(state.lastPlayedIndex?.[nextTeam]) || -1;
    let searchIndex = (lastIdx + 1) % players.length;
    for (let k = 0; k < players.length; k++) {
      const p = players[searchIndex];
      if (p && p.team === nextTeam && p.health > 0) return searchIndex;
      searchIndex = (searchIndex + 1) % players.length;
    }
    searchIndex = (state.currentPlayerIndex + 1) % players.length;
    for (let k = 0; k < players.length; k++) {
      const p = players[searchIndex];
      if (p && p.health > 0) return searchIndex;
      searchIndex = (searchIndex + 1) % players.length;
    }
    return -1;
  }

  private startWorkerPlan(presenter: any, worms: BotWormSnapshot[], shooterId: string, botCfg: BotConfig, executeSeconds: number, ropeRemaining: number, rngSeed: number, difficulty: AIDifficulty): void {
    try {
      this.ensureWorker();
      if (!this.thinkWorker) return;
      const terrain = presenter.state.landscape;
      const grid = terrain?.grid;
      if (!(grid instanceof Uint8Array)) return;
      const dfEvents: any[] = Array.isArray((terrain as any).dfEvents) ? (terrain as any).dfEvents : [];
      const dimKey = `${terrain.width}x${terrain.height}`;
      const needInit = !this.workerTerrainReady || this.workerTerrainDimKey !== dimKey || !Number.isFinite(this.workerTerrainDfEventIndex);
      if (needInit) {
        const bufInit = grid.slice().buffer;
        this.thinkWorker.postMessage({
          kind: 'terrainInit',
          width: terrain.width,
          height: terrain.height,
          grid: bufInit,
          dfEventIndex: dfEvents.length,
          revision: terrain.revision || 0
        }, [bufInit]);
        this.workerTerrainReady = true;
        this.workerTerrainDimKey = dimKey;
        this.workerTerrainDfEventIndex = dfEvents.length;
      } else if (dfEvents.length > this.workerTerrainDfEventIndex) {
        const delta = dfEvents.slice(this.workerTerrainDfEventIndex);
        const resetSeen = delta.some((e: any) => e && e.kind === 'reset');
        if (resetSeen) {
          const bufInit = grid.slice().buffer;
          this.thinkWorker.postMessage({
            kind: 'terrainInit',
            width: terrain.width,
            height: terrain.height,
            grid: bufInit,
            dfEventIndex: dfEvents.length,
            revision: terrain.revision || 0
          }, [bufInit]);
          this.workerTerrainReady = true;
          this.workerTerrainDimKey = dimKey;
          this.workerTerrainDfEventIndex = dfEvents.length;
        } else {
          this.thinkWorker.postMessage({
            kind: 'terrainPatch',
            fromEventIndex: this.workerTerrainDfEventIndex,
            toEventIndex: dfEvents.length,
            events: delta,
            revision: terrain.revision || 0
          });
          this.workerTerrainDfEventIndex = dfEvents.length;
        }
      }
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
        mapSeed: presenter.state.mapSeed || 0,
        gravity: presenter.physics.gravity,
        wind: presenter.state.wind || 0,
        teamAmmo: presenter.state.teamAmmo,
        worms,
        shooterId,
        botCfg,
        executeSeconds,
        ropeRemaining,
        shotMemory,
        bestPractices: snapshotBestPracticesForWorker(),
        seedBins: this.caseSeedBinsThisTurn
      });
    } catch {}
  }

  private startBgWorkerPlan(presenter: any, worms: BotWormSnapshot[], shooterId: string, botCfg: BotConfig, executeSeconds: number, ropeRemaining: number, rngSeed: number, difficulty: AIDifficulty): void {
    try {
      this.ensureBgWorker();
      if (!this.bgWorker) return;
      const terrain = presenter.state.landscape;
      const grid = terrain?.grid;
      if (!(grid instanceof Uint8Array)) return;
      const dfEvents: any[] = Array.isArray((terrain as any).dfEvents) ? (terrain as any).dfEvents : [];
      const dimKey = `${terrain.width}x${terrain.height}`;
      const needInit = !this.bgWorkerTerrainReady || this.bgWorkerTerrainDimKey !== dimKey || !Number.isFinite(this.bgWorkerTerrainDfEventIndex);
      if (needInit) {
        const bufInit = grid.slice().buffer;
        this.bgWorker.postMessage({
          kind: 'terrainInit',
          width: terrain.width,
          height: terrain.height,
          grid: bufInit,
          dfEventIndex: dfEvents.length,
          revision: terrain.revision || 0
        }, [bufInit]);
        this.bgWorkerTerrainReady = true;
        this.bgWorkerTerrainDimKey = dimKey;
        this.bgWorkerTerrainDfEventIndex = dfEvents.length;
      } else if (dfEvents.length > this.bgWorkerTerrainDfEventIndex) {
        const delta = dfEvents.slice(this.bgWorkerTerrainDfEventIndex);
        const resetSeen = delta.some((e: any) => e && e.kind === 'reset');
        if (resetSeen) {
          const bufInit = grid.slice().buffer;
          this.bgWorker.postMessage({
            kind: 'terrainInit',
            width: terrain.width,
            height: terrain.height,
            grid: bufInit,
            dfEventIndex: dfEvents.length,
            revision: terrain.revision || 0
          }, [bufInit]);
          this.bgWorkerTerrainReady = true;
          this.bgWorkerTerrainDimKey = dimKey;
          this.bgWorkerTerrainDfEventIndex = dfEvents.length;
        } else {
          this.bgWorker.postMessage({
            kind: 'terrainPatch',
            fromEventIndex: this.bgWorkerTerrainDfEventIndex,
            toEventIndex: dfEvents.length,
            events: delta,
            revision: terrain.revision || 0
          });
          this.bgWorkerTerrainDfEventIndex = dfEvents.length;
        }
      }
      const jobId = `${this.matchKey}:bg:${shooterId}:${(presenter.matchDuration || 0).toFixed(2)}`;
      this.bgWorkerJobId = jobId;
      this.bgWorkerResult = null;
      this.bgPlanKey = this.worldKey(presenter, Number(shooterId) || 0, ropeRemaining);
      const shotMemory = Array.from(this.shotMemory.values())
        .sort((a, b) => b.lastT - a.lastT)
        .slice(0, 160)
        .map(x => ({ stateKey: x.stateKey, shotKey: x.shotKey, noRes: x.noRes, ff: x.ff, targetId: x.targetId, lastT: x.lastT }));
      this.bgWorker.postMessage({
        kind: 'plan',
        jobId,
        rngSeed,
        difficulty,
        gravity: presenter.physics.gravity,
        wind: presenter.state.wind || 0,
        teamAmmo: presenter.state.teamAmmo,
        worms,
        shooterId,
        botCfg,
        executeSeconds,
        ropeRemaining,
        shotMemory
      });
    } catch {}
  }

  private maybeConsumeBgResult(presenter: any, ropeRemaining: number) {
    if (!this.bgPlanningInProgress) return;
    const wr = (this.bgWorkerResult && this.bgWorkerJobId && this.bgWorkerResult.jobId === this.bgWorkerJobId) ? this.bgWorkerResult : null;
    const wrOk = !!(wr && wr.ok === 1 && wr.plan);
    if (!wrOk) return;
    this.bgPlanningInProgress = false;
    const plan = wr.plan;
    const debug = wr.debug || null;
    const score = Number(debug?.score) || 0;
    const shooterId = String((debug?.trace?.shooter?.id ?? ''));
    const sig = this.terrainSig(presenter);
    const key = this.bgPlanKey || this.worldKey(presenter, Number(shooterId) || 0, ropeRemaining);
    this.bgPlanKey = null;
    this.planCache.set(key, { key, createdAt: performance.now(), shooterId, rev: sig.rev, df: sig.df, plan, debug, score });
  }

  private tryPostShotMove(presenter: any, player: any, now: number, timeLeft: number, reserveSeconds: number) {
    if (this.lastFiredWeaponId === 'homing_missile') return;
    if (timeLeft <= reserveSeconds + 0.35) return;
    if (now < this.postShotMoveUntil && this.postShotDir) {
      presenter.handleInput?.(this.postShotDir, true, true);
      presenter.handleInput?.(this.postShotDir === 'left' ? 'right' : 'left', false, true);
      return;
    }
    const allies: any[] = Array.isArray(presenter?.state?.players)
      ? presenter.state.players.filter((w: any) => w && w.team === player.team && w !== player && w.health > 0)
      : [];
    let dir: 'left' | 'right' | null = null;
    const clusterR = 78;
    let bestD = Infinity;
    let bestDx = 0;
    for (const a of allies) {
      const dx = (Number(player.x) || 0) - (Number(a.x) || 0);
      const dy = (Number(player.y) || 0) - (Number(a.y) || 0);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        bestDx = dx;
      }
    }
    if (bestD < clusterR) {
      dir = bestDx >= 0 ? 'right' : 'left';
    } else {
      const land = presenter?.state?.landscape;
      if (land && typeof land.getMaterial === 'function') {
        const sampleDx = 38;
        const x0 = Number(player.x) || 0;
        const y0 = Number(player.y) || 0;
        const h = Number(presenter?.state?.height) || 0;
        const groundYAt = (x: number, yHint: number): number | null => {
          const px = Math.floor(x);
          if (px < 0 || px >= (Number(presenter?.state?.width) || 0)) return null;
          const yStart = Math.max(0, Math.min(h - 1, Math.floor(yHint)));
          for (let y = yStart; y < h; y++) {
            if (land.getMaterial(px, y) > 0) return y;
          }
          return null;
        };
        const g0 = groundYAt(x0, y0);
        if (g0 !== null) {
          const gl = groundYAt(x0 - sampleDx, g0) ?? (g0 + 260);
          const gr = groundYAt(x0 + sampleDx, g0) ?? (g0 + 260);
          const dropL = gl - g0;
          const dropR = gr - g0;
          const maxDrop = Math.max(dropL, dropR);
          if (maxDrop > 80) {
            dir = dropL > dropR ? 'right' : 'left';
          }
        }
      }
    }
    if (dir) {
      this.postShotDir = dir;
      this.postShotMoveUntil = now + 0.35;
      presenter.handleInput?.(dir, true, true);
      presenter.handleInput?.(dir === 'left' ? 'right' : 'left', false, true);
    } else {
      this.postShotDir = null;
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
    }
  }

  private steerHoming(presenter: any, player: any) {
    const targetId = this.lastFiredTargetId;
    if (!targetId) return;
    const projs: any[] = Array.isArray(presenter?.state?.projectiles) ? presenter.state.projectiles : [];
    const proj = projs.find((p: any) => p && p.weaponId === 'homing_missile' && (p.owner === player || p.owner === (presenter?.state?.getCurrentPlayer?.())));
    if (!proj) return;
    const tidx = Number(targetId);
    const t = Number.isFinite(tidx) ? presenter?.state?.players?.[tidx] : null;
    if (!t || t.health <= 0) return;
    const desired = Math.atan2((Number(t.y) || 0) - (Number(proj.y) || 0), (Number(t.x) || 0) - (Number(proj.x) || 0));
    const cur = Math.atan2(Number(proj.vy) || 0, Number(proj.vx) || 0);
    const TAU = Math.PI * 2;
    let d = (desired - cur) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    const dir = d > 0.02 ? 'right' : d < -0.02 ? 'left' : null;
    player.vx = 0;
    if (!player.isJumping) player.vy = 0;
    presenter.handleInput?.('left', dir === 'left', true);
    presenter.handleInput?.('right', dir === 'right', true);
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
      this.matchSpecialFailByTeam = {
        team1: { ropeBorder: 0, ropeNoAttach: 0, walkCliff: 0, walkObstacle: 0 },
        team2: { ropeBorder: 0, ropeNoAttach: 0, walkCliff: 0, walkObstacle: 0 }
      };
      this.lastPlannedTeam = null;
      this.lastPlanningProgressByTeam = { team1: null, team2: null };
      this.lastWorkerMsByTeam = { team1: null, team2: null };
      this.lastWorkerComputeMsByTeam = { team1: null, team2: null };
      this.lastThinkSrcByTeam = { team1: null, team2: null };
      this.lastCacheHitByTeam = { team1: 0, team2: 0 };
      this.shotMemory.clear();
      this.pendingShotEval = null;
      this.lastFiredWeaponId = null;
      this.lastFiredTargetId = null;
      this.postShotMoveUntil = 0;
      this.postShotDir = null;
      this.workerTerrainReady = false;
      this.workerTerrainDimKey = '';
      this.workerTerrainDfEventIndex = 0;
      this.bgWorkerTerrainReady = false;
      this.bgWorkerTerrainDimKey = '';
      this.bgWorkerTerrainDfEventIndex = 0;
      this.bgWorkerJobId = null;
      this.bgWorkerResult = null;
      this.bgPlanningInProgress = false;
      this.bgPlanKey = null;
      this.planCache.clear();
      this.lastCacheRev = -1;
      this.lastCacheDf = -1;
    }

    const isBotTurn = presenter.state.mode === 'aivai' ? (player.team === 'team1' || player.team === 'team2') : player.team === 'team2';

    if (curIdx !== this.lastTurnIndex) {
      this.turnNo += 1;
      if (this.pendingEscapeEval && Number.isFinite(this.lastTurnIndex) && this.lastTurnIndex >= 0) {
        try {
          const prevIdx = this.pendingEscapeEval.wormIndex;
          const prevW = presenter.state.players?.[prevIdx];
          if (prevW && prevW.team && (prevW.team === 'team1' || prevW.team === 'team2')) {
            const t = { width: presenter.state.width, height: presenter.state.height, isSolid: (x: number, y: number) => presenter.state.landscape.getMaterial(x, y) > 0 };
            const pit1 = analyzePit(t as any, { x: prevW.x, y: prevW.y, width: prevW.width || 10, height: prevW.height || 10, ropeRemaining: 0 });
            const endTrapped = pit1?.isTrapped ? 1 : 0;
            const endDepth = typeof pit1?.depthPx === 'number' ? pit1.depthPx : 0;
            const escaped = this.pendingEscapeEval.startTrapped === 1 && endTrapped === 0;
            const gained = this.pendingEscapeEval.startTrapped === 1 && endDepth <= Math.max(0, this.pendingEscapeEval.startDepthPx - 28);
            const success: 0 | 1 = (escaped || gained) ? 1 : 0;
            const wBin = Math.max(0, Math.min(20, Math.round((this.pendingEscapeEval.widthPx || 0) / 10)));
            const dBin = Math.max(0, Math.min(20, Math.round((this.pendingEscapeEval.startDepthPx || 0) / 20)));
            const program = this.pendingEscapeEval.mode ? `pit_escape_${this.pendingEscapeEval.mode}` : 'pit_escape_unknown';
            const key = `ai:tpl:v1:${this.pendingEscapeEval.mapSeed}:pit:w${wBin}:d${dBin}:dir${this.pendingEscapeEval.dir}:${program}`;
            recordTemplateSample(key, { success, params: { wBin, dBin, dir: this.pendingEscapeEval.dir } });
          }
        } catch {}
      }
      this.lastTurnIndex = curIdx;
      this.firedThisTurn = false;
      this.plannedThisTurn = false;
      this.plan = null;
      this.caseCandidate = null;
      this.caseUsedThisTurn = 0;
      this.caseUsedId = null;
      this.caseUsedKey = null;
      this.caseExpectedDamage = null;
      this.lastFiredWeaponId = null;
      this.lastFiredTargetId = null;
      this.postShotMoveUntil = 0;
      this.postShotDir = null;
      this.movePathWaypoints = null;
      this.movePathIndex = 0;
      this.moveStartedAt = presenter.matchDuration || 0;
      this.ropeAttachUsed = 0;
      this.ropeStartedAt = 0;
      this.lastRopeAttemptAt = -999;
      this.lastRopeCooldownLoggedAt = -999;
      this.ropeJumpAttachUntil = 0;
      this.ropeJumpMoveTo = null;
      this.ropeJumpDir = null;
      this.ropeJumpBudget = 0;
      this.ropeJumpStrategy = null;
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
      this.wallStallRefX = player.x;
      this.wallStallTime = 0;
      this.wallStallDir = null;
      this.wallStallLastLoggedAt = -999;
      this.lastCostAt = -999;
      this.lastCost = Infinity;
      this.lastReplanAt = -999;
      this.lastMoveDir = null;
      this.dirFlipWindowAt = -999;
      this.dirFlipCount = 0;
      this.lastDx = 0;
      this.ropeStallCount = 0;
      this.pitEscapeMode = null;
      this.pitEscapeAttempts = { jump: 0, rope: 0, dig: 0 };
      this.lastPitCheckAt = -999;
      this.lastPitKey = '';
      this.lastPit = null;
      this.pitDigFlip = 0;
      this.pendingEscapeEval = null;
      this.didReplanThisTurn = false;
      this.replanCountThisTurn = 0;
      this.planningInProgress = false;
      this.lastDecisionDebug = null;
      this.lastPlanningProgress = null;
      this.lastPlannedTeam = null;
      const t0 = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
      if (t0) this.lastCacheHitByTeam[t0] = 0;
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
      this.bgWorkerJobId = null;
      this.bgWorkerResult = null;
      this.lastBgPlanningProgress = null;
      this.bgPlanningInProgress = false;
      this.bgPlanKey = null;
      this.debug('turn_start', { idx: curIdx, name: player.name, x: Math.round(player.x), y: Math.round(player.y) });
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
      presenter.handleInput?.('up', false, true);
      presenter.handleInput?.('down', false, true);
      presenter.handleInput?.('jump', false, true);
      presenter.handleInput?.('fire', false, true);
    }

    const botCfg0: BotConfig = presenter.state.botConfig || DEFAULT_BOT_CONFIG;
    const activeTeam0: 'team1' | 'team2' = player.team === 'team1' ? 'team1' : 'team2';
    const difficulty0 = (presenter.state.mode === 'aivai'
      ? (this.difficultyByTeam[activeTeam0] as AIDifficulty | undefined)
      : ((getAIDifficulty() as AIDifficulty) || undefined)) || 'medium';
    const ropeBudget0 = botCfg0.ropeAttachLimit[difficulty0] ?? 0;
    const ropeRemaining0 = Math.max(0, ropeBudget0 - this.ropeAttachUsed);
    this.prunePlanCache(presenter);
    this.maybeConsumeBgResult(presenter, ropeRemaining0);

    if (presenter?.state?.mode === 'aivai') {
      const build = (team: 'team1' | 'team2') => {
        const p = this.lastPlanningProgressByTeam[team];
        return {
          thinkSrc: this.lastThinkSrcByTeam[team],
          workerMs: this.lastWorkerMsByTeam[team],
          computeMs: this.lastWorkerComputeMsByTeam[team],
          bestScore: p && Number.isFinite(p.bestScore) ? p.bestScore : null,
          evals: p && Number.isFinite(p.evals) ? p.evals : null,
          comboCount: p && Number.isFinite(p.comboCount) ? p.comboCount : null,
          cacheHit: this.lastCacheHitByTeam[team],
          fail: this.matchSpecialFailByTeam[team]
        };
      };
      (presenter.state as any).aiStats = { team1: build('team1'), team2: build('team2') };
    }

    if (!isBotTurn) {
      const hasProjectiles0 = (presenter.state.projectiles?.length || 0) > 0;
      if (!hasProjectiles0 && !isWorldBusy && !this.bgPlanningInProgress) {
        const nextIdx = this.peekNextTurnIndex(presenter);
        if (nextIdx >= 0) {
          const nextPlayer = presenter.state.players?.[nextIdx];
          const nextIsBot = presenter.state.mode === 'aivai'
            ? !!nextPlayer
            : (nextPlayer?.team === 'team2');
          if (nextIsBot) {
            const view = this.buildBotViewForIndex(presenter, nextIdx);
            if (view) {
              const teamKey: 'team1' | 'team2' = view.shooter.team === 'team1' ? 'team1' : 'team2';
              const diff = (presenter.state.mode === 'aivai'
                ? ((this.difficultyByTeam[teamKey] as AIDifficulty | undefined) || 'hard')
                : (((getAIDifficulty() as AIDifficulty) || undefined) || 'medium'));
              const maxTurn = Number.isFinite(presenter.maxTurnTime) ? presenter.maxTurnTime : 30;
              const reserveSeconds = presenter?.state?.mode === 'aivai' ? 2.0 : botCfg0.reserveSeconds;
              const executeSeconds = Math.max(0, maxTurn - botCfg0.planSeconds - reserveSeconds);
              const ropeBudget = botCfg0.ropeAttachLimit[diff] ?? 0;
              const ropeRemaining = Math.max(0, ropeBudget);
              const key = this.worldKey(presenter, nextIdx, ropeRemaining);
              if (!this.planCache.has(key)) {
                const rngSeed = ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`pre:${key}`)) >>> 0;
                this.startBgWorkerPlan(presenter, view.worms, view.shooter.id, botCfg0, executeSeconds, ropeRemaining, rngSeed, diff);
                this.bgPlanningInProgress = true;
              }
            }
          }
        }
      }
      return;
    }

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
      try {
        if (enemyDelta > 0.01 && allyDelta <= 0.01 && this.pendingShotEval) {
          const parts = String(this.pendingShotEval.shotKey || '').split(':');
          const weaponId = parts[0] || '';
          const angleBin = Number(parts[2]);
          const powerBin = Number(parts[3]);
          const sIdx = Number(this.pendingShotEval.shooterId);
          const tIdx = Number(this.pendingShotEval.targetId);
          const shooter = Number.isFinite(sIdx) ? presenter.state.players?.[sIdx] : null;
          const target = Number.isFinite(tIdx) ? presenter.state.players?.[tIdx] : null;
          if (shooter && target && weaponId && Number.isFinite(angleBin) && Number.isFinite(powerBin)) {
            const t = { width: presenter.state.width, height: presenter.state.height, isSolid: (x: number, y: number) => presenter.state.landscape.getMaterial(x, y) > 0 };
            const pitTarget = analyzePit(t as any, { x: target.x, y: target.y, width: target.width || 10, height: target.height || 10, ropeRemaining: 0 });
            const spawnType = pitTarget?.isTrapped ? 'pit' : 'open';
            const wind = Number(presenter.state.wind) || 0;
            const windBin = Math.round(wind / 10);
            const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
            const distBin = Math.round(dist / 80);
            const dYBin = Math.round((target.y - shooter.y) / 60);
            const mapSeed = presenter.state.mapSeed || 0;
            const key2 = `ai:bp:v1:${mapSeed}:${spawnType}:attack:${weaponId}:w${windBin}:d${distBin}:dy${dYBin}`;
            recordPriorSample(key2, { angleBin, powerBin, enemyDelta, allyDelta, score: enemyDelta - allyDelta * 4 });
          }
        }
      } catch {}
      this.emitAIVai(presenter, {
        type: 'shot_eval',
        t: presenter.matchDuration || 0,
        team: this.pendingShotEval.team,
        wormId: String(this.pendingShotEval.shooterId ?? ''),
        turnNo: this.pendingShotEval.turnNo,
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
    if (hasProjectiles) {
      const now0 = presenter.matchDuration || 0;
      const botCfgP: BotConfig = presenter.state.botConfig || DEFAULT_BOT_CONFIG;
      const timeLeft0 = Number.isFinite(presenter.turnTimeLeft) ? presenter.turnTimeLeft : 0;
      const reserveSeconds0 = presenter?.state?.mode === 'aivai' ? 2.0 : botCfgP.reserveSeconds;
      if (this.firedThisTurn) {
        if (this.lastFiredWeaponId === 'homing_missile') this.steerHoming(presenter, player);
        else this.tryPostShotMove(presenter, player, now0, timeLeft0, reserveSeconds0);
      }
      return;
    }
    if (this.firedThisTurn) return;

    const botCfg: BotConfig = botCfg0;
    const difficulty = difficulty0;
    const maxTurn = Number.isFinite(presenter.maxTurnTime) ? presenter.maxTurnTime : 30;
    const timeLeft = Number.isFinite(presenter.turnTimeLeft) ? presenter.turnTimeLeft : 0;
    const elapsed = Math.max(0, maxTurn - timeLeft);
    const planSeconds = botCfg.planSeconds;
    const reserveSeconds = presenter?.state?.mode === 'aivai' ? 2.0 : botCfg.reserveSeconds;
    const executeSeconds = Math.max(0, maxTurn - planSeconds - reserveSeconds);
    const ropeBudget = ropeBudget0;
    const ropeRemaining = ropeRemaining0;
    const now = presenter.matchDuration || 0;
    const dt = Number.isFinite(presenter.deltaTime) ? presenter.deltaTime : (1 / 60);
    this.lastMovementCfg = botCfg.movement || this.lastMovementCfg;

    if ((presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai') && !this.workerJobId && !this.planningInProgress) {
      if (presenter?.state?.mode === 'aivai') this.refreshCaseCandidate(presenter, curIdx, botCfg);
      const view = this.buildBotView(presenter);
      if (!view) return;
      const key = this.worldKey(presenter, curIdx, ropeRemaining);
      const cached = this.planCache.get(key) || null;
      if (cached && cached.plan) {
        const wp = (cached.plan as any).movePath?.waypoints;
        this.movePathWaypoints = Array.isArray(wp) ? wp.map((p: any) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 })) : null;
        this.movePathIndex = 0;
        const mt0 = this.clampMoveToByTimeBudget(presenter, player, cached.plan.moveTo || null, cached.plan.action.weaponIndex);
        this.plan = {
          moveTo: mt0 || undefined,
          movePath: (cached.plan as any).movePath || undefined,
          action: { weaponIndex: cached.plan.action.weaponIndex, facingRight: cached.plan.action.facingRight, aimAngle: cached.plan.action.aimAngle, power: cached.plan.action.power, targetId: cached.plan.action.targetId },
          intent: cached.plan.intent,
          intentReason: cached.plan.intentReason
        };
        this.ensureClearLineMove(presenter, curIdx);
        this.moveStartedAt = now;
        this.plannedThisTurn = true;
        this.planningInProgress = false;
        this.lastThinkSrc = 'worker';
        this.lastWorkerUsed = 1;
        this.lastWorkerMs = 0;
        this.lastWorkerComputeMs = 0;
        this.lastWorkerArrivedAfterMain = 0;
        this.lastDecisionDebug = cached.debug || null;
        this.lastThinkSrcByTeam[activeTeam0] = 'worker';
        this.lastWorkerMsByTeam[activeTeam0] = 0;
        this.lastWorkerComputeMsByTeam[activeTeam0] = 0;
        this.lastCacheHitByTeam[activeTeam0] = 1;
        this.applyCaseUsage(presenter, curIdx);
        this.emitPlanStart(presenter, now, curIdx);
      } else {
        const rngSeed = ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`turn:${key}`)) >>> 0;
        this.lastPlannedTeam = activeTeam0;
        this.startWorkerPlan(presenter, view.worms, view.shooter.id, botCfg, executeSeconds, ropeRemaining, rngSeed, difficulty);
        this.planningInProgress = true;
        this.lastCacheHitByTeam[activeTeam0] = 0;
      }
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
        planningBestScore: (this.lastPlanningProgress && Number.isFinite(this.lastPlanningProgress.bestScore)) ? this.lastPlanningProgress.bestScore : null,
        planningComboCount: (this.lastPlanningProgress && Number.isFinite(this.lastPlanningProgress.comboCount)) ? this.lastPlanningProgress.comboCount : null,
        planningEvals: (this.lastPlanningProgress && Number.isFinite(this.lastPlanningProgress.evals)) ? this.lastPlanningProgress.evals : null,
        bgBestScore: (this.lastBgPlanningProgress && Number.isFinite(this.lastBgPlanningProgress.bestScore)) ? this.lastBgPlanningProgress.bestScore : null,
        workerReady: this.thinkWorker ? 1 : 0,
        workerInitError: this.workerInitError,
        aiV: AI_V
      });
    }

    if (timeLeft <= reserveSeconds) {
      if (!isWorldBusy) {
        if (presenter?.state?.mode === 'aivai' && this.lastWorkerUsed !== 1) {
          const fb = this.lateFallbackFireAction(presenter);
          if (fb) {
            const noisy = this.applyError(fb, botCfg, difficulty, this.rngForTurn(presenter), presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai');
            if (presenter?.state?.mode === 'aivai' && this.plan) this.emitMovementSummary(presenter, player, curIdx, this.plan.moveTo || null, now);
            this.recordAIVai(presenter, botCfg, difficulty, 'reserve_fire', fb, noisy);
            this.fireAction(presenter, noisy);
            this.firedThisTurn = true;
            return;
          }
        }
        const action0 = this.plan?.action && this.plan.action.weaponIndex >= 0 ? this.plan.action : null;
        const action = action0 || this.safeFallbackAction(presenter);
        if (action) {
          const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter), presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai');
          if (presenter?.state?.mode === 'aivai' && this.plan) this.emitMovementSummary(presenter, player, curIdx, this.plan.moveTo || null, now);
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
        const mt0 = this.clampMoveToByTimeBudget(presenter, player, wr.plan.moveTo || null, wr.plan.action.weaponIndex);
        this.plan = {
          moveTo: mt0 || undefined,
          movePath: (wr.plan as any).movePath || undefined,
          action: { weaponIndex: wr.plan.action.weaponIndex, facingRight: wr.plan.action.facingRight, aimAngle: wr.plan.action.aimAngle, power: wr.plan.action.power, targetId: wr.plan.action.targetId },
          intent: wr.plan.intent,
          intentReason: wr.plan.intentReason
        };
        this.ensureClearLineMove(presenter, curIdx);
        this.moveStartedAt = now;
        this.plannedThisTurn = true;
        this.planningInProgress = false;
        this.lastThinkSrcByTeam[activeTeam0] = 'worker';
        this.lastWorkerMsByTeam[activeTeam0] = this.lastWorkerMs;
        this.lastWorkerComputeMsByTeam[activeTeam0] = this.lastWorkerComputeMs;
        const key = this.worldKey(presenter, curIdx, ropeRemaining);
        const score = Number(wr.debug?.score) || 0;
        const sig = this.terrainSig(presenter);
        this.planCache.set(key, { key, createdAt: performance.now(), shooterId: String(curIdx), rev: sig.rev, df: sig.df, plan: wr.plan, debug: wr.debug || null, score });
        this.debug('plan', { moveTo: wr.plan.moveTo ? { x: Math.round(wr.plan.moveTo.x), y: Math.round(wr.plan.moveTo.y) } : null, weaponIndex: wr.plan.action.weaponIndex, targetId: wr.plan.action.targetId, ropeRemaining, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, arrivedAfterMain: this.lastWorkerArrivedAfterMain });
        this.applyCaseUsage(presenter, curIdx);
        this.emitPlanStart(presenter, now, curIdx);
      } else if (!this.plannedThisTurn) {
        const minWait = presenter?.state?.mode === 'aivai'
          ? 1.0
          : Math.min(0.45, Math.max(0.12, planSeconds * 0.25));
        if (elapsed < minWait && timeLeft > reserveSeconds + 0.35) return;
        const waitForWorker = presenter?.state?.mode === 'aivai' && !!this.thinkWorker;
        if (waitForWorker && timeLeft > reserveSeconds + 0.2) return;
        this.lastWorkerArrivedAfterMain = wr ? 1 : null;
        this.lastWorkerMs = wr ? Math.max(0, this.workerArrivedAt - this.workerStartedAt) : null;
        this.lastWorkerComputeMs = wr ? Number(wr.ms) : null;
        this.lastWorkerUsed = 0;
        this.lastThinkSrc = 'main';
        this.lastDecisionDebug = wr?.debug || null;
        this.lastThinkSrcByTeam[activeTeam0] = 'main';
        this.lastWorkerMsByTeam[activeTeam0] = this.lastWorkerMs;
        this.lastWorkerComputeMsByTeam[activeTeam0] = this.lastWorkerComputeMs;
        const fallback = this.safeFallbackAction(presenter);
        const moveTo = this.fallbackMoveTo(presenter);
        if (fallback || moveTo) {
          const placeholder = { weaponIndex: -1, facingRight: !!player.facingRight, aimAngle: player.aimAngle || 0, power: 60, targetId: 'none' };
          this.movePathWaypoints = null;
          this.movePathIndex = 0;
          const wi = (fallback || placeholder).weaponIndex;
          const mt0 = this.clampMoveToByTimeBudget(presenter, player, moveTo || null, wi);
          this.plan = { moveTo: mt0 || undefined, action: fallback || placeholder };
          this.ensureClearLineMove(presenter, curIdx);
          this.moveStartedAt = now;
          this.plannedThisTurn = true;
          this.applyCaseUsage(presenter, curIdx);
          this.emitPlanStart(presenter, now, curIdx);
        }
      } else {
        this.lastDecisionDebug = wr?.debug || null;
      }
    }

    if (!isWorldBusy && !hasProjectiles && this.plannedThisTurn && !this.bgPlanningInProgress) {
      const nextIdx = this.peekNextTurnIndex(presenter);
      if (nextIdx >= 0 && nextIdx !== curIdx) {
        const view = this.buildBotViewForIndex(presenter, nextIdx);
        if (view) {
          const teamKey: 'team1' | 'team2' = view.shooter.team === 'team1' ? 'team1' : 'team2';
          const diff = (presenter.state.mode === 'aivai'
            ? ((this.difficultyByTeam[teamKey] as AIDifficulty | undefined) || 'hard')
            : (((getAIDifficulty() as AIDifficulty) || undefined) || 'medium'));
          const ropeBudget = botCfg.ropeAttachLimit[diff] ?? 0;
          const ropeRemainingNext = Math.max(0, ropeBudget);
          const key = this.worldKey(presenter, nextIdx, ropeRemainingNext);
          if (!this.planCache.has(key)) {
            const rngSeed = ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`pre:${key}`)) >>> 0;
            this.startBgWorkerPlan(presenter, view.worms, view.shooter.id, botCfg, executeSeconds, ropeRemainingNext, rngSeed, diff);
            this.bgPlanningInProgress = true;
          }
        }
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

    if (!isWorldBusy && !this.firedThisTurn && timeLeft > reserveSeconds + 1.4) {
      const pit = this.getPitInfo(presenter, player, ropeRemaining, now);
      if (pit && pit.isTrapped) {
        const hh = (Number(player.height) || 10) / 2;
        let targetX: number | null = null;
        if (pit.escapeDir === 'left') targetX = pit.rimLeftX;
        else if (pit.escapeDir === 'right') targetX = pit.rimRightX;
        else targetX = pit.rimLeftX ?? pit.rimRightX ?? null;
        const tx = typeof targetX === 'number' && Number.isFinite(targetX) ? targetX : player.x;
        const ty = typeof pit.rimY === 'number' && Number.isFinite(pit.rimY) ? (pit.rimY - hh - 6) : (player.y - 120);
        moveTo = { x: Math.max(36, Math.min(presenter.state.width - 36, tx)), y: Math.max(20, Math.min(presenter.state.height - 80, ty)) };
        this.movePathWaypoints = null;
        this.movePathIndex = 0;
        this.plan.intent = 'escape_pit';
        this.plan.intentReason = { pit: { depthPx: pit.depthPx, widthPx: pit.widthPx, escapeDir: pit.escapeDir, canJump: pit.canJumpOut ? 1 : 0, canRope: pit.canRopeOut ? 1 : 0, thinWallDir: pit.thinWallDir } };
        this.plan.action = { weaponIndex: -1, facingRight: !!player.facingRight, aimAngle: player.aimAngle || 0, power: 60, targetId: 'none' };
      }
    }

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
      this.emitMovementSummary(presenter, player, curIdx, moveTo || null, now);
      if (this.plan.intent === 'escape_pit') return;
      const planTarget = this.plan.action.targetId;
      let canUsePlanned = true;
      if (planTarget) {
        canUsePlanned = presenter.state.players.some((w: any, idx: number) => w.team !== player.team && w.health > 0 && String(idx) === String(planTarget));
      }

      const action = canUsePlanned ? this.plan.action : this.safeFallbackAction(presenter);
      if (!action) return;
      if (presenter?.state?.mode === 'aivai' && this.lastWorkerUsed !== 1 && !!this.thinkWorker) return;
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
        const fb = this.safeFallbackAction(presenter);
        if (!fb) return;
        const noisyFb = this.applyError(fb, botCfg, difficulty, this.rngForTurn(presenter), presenter?.state?.mode === 'aivai' || presenter?.state?.mode === 'ai');
        this.recordAIVai(presenter, botCfg, difficulty, 'execute_fire', fb, noisyFb);
        this.fireAction(presenter, noisyFb);
        this.firedThisTurn = true;
        return;
      }
      const timeLeftNow = typeof presenter?.turnTimeLeft === 'number' ? presenter.turnTimeLeft : (typeof presenter?.state?.turnTimeLeft === 'number' ? presenter.state.turnTimeLeft : 0);
      if (timeLeftNow > reserveSeconds + 1.2 && this.shouldSuppressShot(presenter, action)) {
        const moveTo2 = this.fallbackMoveTo(presenter);
        this.plan = {
          moveTo: moveTo2 || undefined,
          action: { weaponIndex: -1, facingRight: !!player.facingRight, aimAngle: player.aimAngle || 0, power: 0, targetId: action.targetId || 'none' },
          intent: this.plan.intent,
          intentReason: { suppressedShot: 1 }
        };
        this.moveStartedAt = now;
        this.plannedThisTurn = true;
        this.strategy = null;
        this.ropeMode = null;
        this.movePathWaypoints = null;
        this.movePathIndex = 0;
        this.didReplanThisTurn = true;
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

  private shouldSuppressShot(presenter: any, action: { weaponIndex: number }): boolean {
    const d = this.lastDecisionDebug;
    if (!d) return false;
    const tr = d?.trace || null;

    let expected = 0;
    if (tr?.chosen) {
      if (typeof tr.chosen.weaponIndex === 'number' && tr.chosen.weaponIndex !== action.weaponIndex) return false;
      expected = Number(tr.chosen.expectedDamage) || 0;
    } else {
      const p = presenter?.state?.getCurrentPlayer?.();
      const equipmentIds: any[] = Array.isArray(p?.equipmentIds) ? p.equipmentIds : [];
      const weaponId = typeof equipmentIds[action.weaponIndex] === 'string' ? equipmentIds[action.weaponIndex] : null;
      const bw: any[] = Array.isArray(d?.bw) ? d.bw : [];
      const row = weaponId ? bw.find((r: any) => Array.isArray(r) && r[0] === weaponId) : null;
      if (row && row.length > 6) expected = Number(row[6]) || 0;
      else if (Array.isArray(d?.ch) && d.ch.length > 6) expected = Number(d.ch[6]) || 0;
    }

    const muzzleBlocked = tr ? (Number(tr?.rejected?.muzzle_blocked) || 0) : (Number(d?.rj?.muzzle_blocked) || 0);
    if (expected > 0.05) return false;
    if (muzzleBlocked < 250) return false;
    return true;
  }

  private isActionSelfSafe(
    presenter: any,
    player: any,
    action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string },
    botCfg: BotConfig
  ): boolean {
    const equipmentIds: any[] = Array.isArray(player?.equipmentIds) ? player.equipmentIds : [];
    const weaponId = typeof equipmentIds[action.weaponIndex] === 'string' ? equipmentIds[action.weaponIndex] : null;
    if (!weaponId) return false;
    const weapon = getWeaponByEquipmentId(weaponId);
    const explosionRadius = Math.max(0, Number((weapon as any)?.explosionRadius) || 0);
    if (explosionRadius <= 0) return true;
    const safeExtra = Math.max(0, Number((botCfg as any)?.scoring?.safeExtraRadius) || 0);
    const safeRadius = explosionRadius + safeExtra;
    const selfSafe = explosionRadius + 18 + safeExtra;
    const gunLength = 25;
    const baseAim = action.facingRight ? action.aimAngle : (Math.PI - action.aimAngle);
    const originX = Number(player.x) || 0;
    const originY = (Number(player.y) || 0) - (Number(player.height) || 0) / 2;
    const dirX = Math.cos(baseAim);
    const dirY = Math.sin(baseAim);
    const startX = originX + dirX * gunLength;
    const startY = originY + dirY * gunLength;
    const maxDist = 260;
    const step = 4;
    let hitX = startX + dirX * maxDist;
    let hitY = startY + dirY * maxDist;
    for (let d = 0; d <= maxDist; d += step) {
      const x = startX + dirX * d;
      const y = startY + dirY * d;
      if (x < 0 || x >= presenter.state.width || y < 0 || y >= presenter.state.height) break;
      if (presenter.state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        hitX = x;
        hitY = y;
        break;
      }
    }
    const selfDist = Math.hypot(hitX - originX, hitY - (Number(player.y) || 0));
    if (selfDist < (selfSafe + 14)) return false;
    const allies: any[] = Array.isArray(presenter?.state?.players)
      ? presenter.state.players.filter((w: any) => w && w.team === player.team && w !== player && w.health > 0)
      : [];
    for (const a of allies) {
      const d = Math.hypot((Number(a.x) || 0) - hitX, (Number(a.y) || 0) - hitY);
      if (d < safeRadius + 10) return false;
    }
    return true;
  }

  private safeFallbackAction(presenter: any): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } | null {
    const view0 = this.buildBotView(presenter);
    if (view0 && view0.enemies.length > 0) {
      const seed = this.rngSeedForTurn(presenter) ^ 0x51c31f2d;
      const rng = mulberry32(seed);
      const teamKey: 'team1' | 'team2' = view0.shooter.team === 'team1' ? 'team1' : 'team2';
      const diff = presenter.state.mode === 'aivai'
        ? ((this.difficultyByTeam[teamKey] as AIDifficulty | undefined) || 'hard')
        : (((getAIDifficulty() as AIDifficulty) || undefined) || 'medium');
      const t0 = performance.now();
      const res = chooseBotActionDebug(
        rng,
        view0.world as any,
        view0.shooter as any,
        view0.enemies as any,
        view0.allies as any,
        presenter.state.botConfig || DEFAULT_BOT_CONFIG,
        diff,
        Array.from(this.shotMemory.values()),
        { deadlineMs: t0 + 55, plateauEvalWindow: 980, bestPractices: snapshotBestPracticesForWorker(), mapSeed: presenter.state.mapSeed || 0 }
      );
      if (res && (res as any).trace) {
        this.lastDecisionDebug = (res as any).trace;
        this.lastThinkSrc = 'main';
        this.lastWorkerUsed = 0;
      }
      const trace: any = (res as any)?.trace || null;
      const byWeapon = trace?.bestByWeaponId || {};
      let cand: any = null;
      for (const k of Object.keys(byWeapon)) {
        const c = byWeapon[k];
        if (!c || !Number.isFinite(c.expectedDamage)) continue;
        if (!cand || c.expectedDamage > cand.expectedDamage) cand = c;
      }
      if (!cand) cand = trace?.chosen || null;
      if (cand && Number.isFinite(cand.globalAngle) && Number.isFinite(cand.power) && Number.isFinite(cand.weaponIndex)) {
        const TAU = Math.PI * 2;
        const angleNorm = (a: number): number => {
          a = (a + Math.PI) % TAU;
          if (a < 0) a += TAU;
          return a - Math.PI;
        };
        const global = Number(cand.globalAngle) || 0;
        const facingRight = Math.cos(global) >= 0;
        const aimAngle = facingRight ? angleNorm(global) : angleNorm(Math.PI - global);
        const localAim = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, aimAngle));
        return {
          weaponIndex: Number(cand.weaponIndex) || 0,
          facingRight,
          aimAngle: localAim,
          power: Number(cand.power) || 60,
          targetId: String(cand.targetId ?? 'none')
        };
      }
    }
    const player = presenter?.state?.getCurrentPlayer?.();
    if (!player) return null;
    const equipmentIds: any[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const findIdx = (id: string) => equipmentIds.findIndex(x => x === id);
    const bazookaIdx = findIdx('bazooka');
    const handgunIdx = findIdx('handgun');
    const shotgunIdx = findIdx('shotgun');
    const minigunIdx = findIdx('minigun');

    const enemies: any[] = Array.isArray(presenter?.state?.players)
      ? presenter.state.players.filter((w: any) => w && w.team !== player.team && w.health > 0)
      : [];
    if (enemies.length === 0) return null;
    enemies.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    const e = enemies[0];
    const dx = e.x - player.x;
    const dy = (e.y - e.height * 0.35) - (player.y - player.height * 0.35);
    const global = Math.atan2(dy, dx);
    const facingRight = dx >= 0;
    const aimAngle = facingRight ? global : (Math.PI - global);
    const localAim = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, aimAngle));
    const targetId = String(presenter.state.players.indexOf(e));
    const botCfg: BotConfig = presenter.state.botConfig || DEFAULT_BOT_CONFIG;
    const tryWeapon = (weaponIndex: number, power: number): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } | null => {
      if (weaponIndex < 0) return null;
      const act = { weaponIndex, facingRight, aimAngle: localAim, power, targetId };
      if (!this.isActionSelfSafe(presenter, player, act, botCfg)) return null;
      return act;
    };
    return (
      tryWeapon(handgunIdx, 74) ||
      tryWeapon(minigunIdx, 70) ||
      tryWeapon(shotgunIdx, 72) ||
      tryWeapon(bazookaIdx, 60)
    );

    return null;
  }

  private lateFallbackFireAction(presenter: any): { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string } | null {
    const view = this.buildBotView(presenter);
    if (!view) return null;
    if (view.enemies.length === 0) return null;
    const seed = this.rngSeedForTurn(presenter) ^ 0x2a4bcd57;
    const rng = mulberry32(seed);
    const teamKey: 'team1' | 'team2' = view.shooter.team === 'team1' ? 'team1' : 'team2';
    const diff = presenter.state.mode === 'aivai'
      ? ((this.difficultyByTeam[teamKey] as AIDifficulty | undefined) || 'hard')
      : (((getAIDifficulty() as AIDifficulty) || undefined) || 'medium');
    const res = chooseBotActionDebug(rng, view.world as any, view.shooter as any, view.enemies as any, view.allies as any, presenter.state.botConfig || DEFAULT_BOT_CONFIG, diff, Array.from(this.shotMemory.values()));
    if (!res || !res.trace) return null;

    const p = presenter?.state?.getCurrentPlayer?.();
    const equipmentIds: any[] = Array.isArray(p?.equipmentIds) ? p.equipmentIds : [];
    const mainWeaponId = equipmentIds.includes('bazooka') ? 'bazooka' : (typeof equipmentIds[0] === 'string' ? equipmentIds[0] : null);
    const byWeapon = (res.trace as any).bestByWeaponId || {};
    const cand = (mainWeaponId && byWeapon[mainWeaponId]) ? byWeapon[mainWeaponId] : (res.trace as any).chosen;
    if (!cand) return null;
    const expected = Number(cand.expectedDamage) || 0;
    if (expected <= 0.05) return null;

    const TAU = Math.PI * 2;
    const angleNorm = (a: number): number => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    const global = Number(cand.globalAngle) || 0;
    const facingRight = Math.cos(global) >= 0;
    const aimAngle = facingRight ? angleNorm(global) : angleNorm(Math.PI - global);
    const localAim = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, aimAngle));
    const weaponIndex = Number(cand.weaponIndex) || 0;
    const power = Number(cand.power) || 60;
    const targetId = String(cand.targetId ?? res.action.targetId ?? '');
    const act = { weaponIndex, facingRight, aimAngle: localAim, power, targetId };
    const pNow = presenter?.state?.getCurrentPlayer?.();
    if (pNow) {
      const botCfg: BotConfig = presenter.state.botConfig || DEFAULT_BOT_CONFIG;
      if (!this.isActionSelfSafe(presenter, pNow, act, botCfg)) return null;
    }
    return act;
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
    const equipmentIds0: any[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const weaponId0 = typeof equipmentIds0[action.weaponIndex] === 'string' ? equipmentIds0[action.weaponIndex] : null;
    this.lastFiredWeaponId = weaponId0;
    this.lastFiredTargetId = action.targetId || null;
    this.postShotMoveUntil = 0;
    this.postShotDir = null;
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
      if (weaponId) this.pendingShotEval = { stateKey, shotKey, team: player.team, health0, targetId: action.targetId, shooterId: String(presenter.state.currentPlayerIndex ?? ''), turnNo: this.turnNo };
      this.emitAIVai(presenter, {
        type: 'weapon_fired',
        t: presenter.matchDuration || 0,
        team: player.team,
        wormId: String(presenter.state.currentPlayerIndex ?? ''),
        turnNo: this.turnNo,
        weaponIndex: action.weaponIndex,
        weaponId,
        facingRight: action.facingRight ? 1 : 0,
        aimAngle: action.aimAngle,
        power: action.power,
        pos: { x: player.x, y: player.y },
        g: typeof presenter?.state?.teamAmmo?.[player.team]?.grenade === 'number' && Number.isFinite(presenter.state.teamAmmo[player.team].grenade)
          ? Math.max(0, Math.floor(presenter.state.teamAmmo[player.team].grenade))
          : null,
        v: typeof player.vx === 'number' && Number.isFinite(player.vx) ? player.vx : null,
        w: typeof player.vy === 'number' && Number.isFinite(player.vy) ? player.vy : null,
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
    const vx = Math.abs(Number(player.vx) || 0);
    if (dx < 0.25 && vx < 2.0) {
      this.stuckTime += dt;
      return;
    }
    this.stuckTime = Math.max(0, this.stuckTime - dt * 0.6);
  }

  private trackWallStall(presenter: any, player: any, dir: 'left' | 'right', moveTo: { x: number; y: number }, dt: number, now: number): boolean {
    const ref = Number.isFinite(this.wallStallRefX) ? this.wallStallRefX : player.x;
    if (this.wallStallDir !== dir) {
      this.wallStallDir = dir;
      this.wallStallRefX = player.x;
      this.wallStallTime = 0;
      return false;
    }
    const dx = Math.abs(player.x - ref);
    if (dx >= 2) {
      this.wallStallRefX = player.x;
      this.wallStallTime = 0;
      return false;
    }

    this.wallStallTime += dt;
    if (this.wallStallTime < 0.23) return false;
    this.wallStallTime = 0;
    this.wallStallRefX = player.x;

    if ((now - this.wallStallLastLoggedAt) > 0.35) {
      this.wallStallLastLoggedAt = now;
      this.emitAIVai(presenter, {
        type: 'bot_wall_stall',
        t: now,
        team: player.team,
        wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''),
        turnNo: this.turnNo,
        dir,
        pos: { x: player.x, y: player.y },
        moveTo: { x: moveTo.x, y: moveTo.y },
        aiV: AI_V
      });
    }

    this.bannedTurn.add('walk');
    this.strategy = null;
    this.plannedThisTurn = false;
    this.plan = null;
    this.movePathWaypoints = null;
    this.movePathIndex = 0;
    this.didReplanThisTurn = true;
    this.lastReplanAt = now;
    this.replanCountThisTurn += 1;
    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    presenter.handleInput?.('jump', false, true);
    return true;
  }

  private emitMovementSummary(presenter: any, player: any, curIdx: number, moveTo: { x: number; y: number } | null, now: number) {
    const summaryDx = moveTo ? moveTo.x - player.x : 0;
    const summaryDy = moveTo ? moveTo.y - player.y : 0;
    const dir: 'left' | 'right' = summaryDx < 0 ? 'left' : 'right';
    const cliff = this.scanCliffAhead(presenter, player, dir);
    this.emitAIVai(presenter, {
      type: 'bot_movement_summary',
      t: now,
      team: player.team,
      wormId: String(curIdx),
      turnNo: this.turnNo,
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
      intent: this.plan?.intent || 'attack',
      intentReason: this.plan?.intentReason || null,
      aiV: AI_V,
      thinkSrc: this.lastThinkSrc,
      workerMs: this.lastWorkerMs,
      workerComputeMs: this.lastWorkerComputeMs
    });
  }

  private getPitInfo(presenter: any, player: any, ropeRemaining: number, now: number): any | null {
    const sig = this.terrainSig(presenter);
    const xBin = Math.floor((Number(player.x) || 0) / 12);
    const yBin = Math.floor((Number(player.y) || 0) / 12);
    const key = `${sig.rev}:${sig.df}:${xBin}:${yBin}:${ropeRemaining > 0 ? 1 : 0}`;
    if (this.lastPit && this.lastPitKey === key && (now - this.lastPitCheckAt) < 0.35) return this.lastPit;
    if ((now - this.lastPitCheckAt) < 0.18 && this.lastPitKey === key) return this.lastPit;
    this.lastPitCheckAt = now;
    this.lastPitKey = key;
    const t = {
      width: presenter.state.width,
      height: presenter.state.height,
      isSolid: (x: number, y: number) => presenter.state.landscape.getMaterial(x, y) > 0
    };
    const pit = analyzePit(t as any, { x: player.x, y: player.y, width: player.width || 10, height: player.height || 10, ropeRemaining });
    this.lastPit = pit;
    return pit;
  }

  private tryDigEscapePit(presenter: any, player: any, pit: any): boolean {
    if (this.firedThisTurn) return false;
    const pref = pit?.thinWallDir === 'left' ? 'left' : pit?.thinWallDir === 'right' ? 'right' : null;
    const order: Array<'left' | 'right'> = pref
      ? (pref === 'left' ? ['left', 'right'] : ['right', 'left'])
      : (this.pitDigFlip === 0 ? ['left', 'right'] : ['right', 'left']);
    for (const dir of order) {
      if (this.tryDigEscape(presenter, player, dir)) return true;
    }
    this.pitDigFlip = this.pitDigFlip === 0 ? 1 : 0;
    this.pitEscapeAttempts.dig += 1;
    return false;
  }

  private executePitEscape(
    presenter: any,
    player: any,
    moveTo: { x: number; y: number },
    now: number,
    dt: number,
    ropeBudget: number,
    ropeRemaining: number,
    pit: any
  ): boolean {
    const dir0 = pit?.escapeDir === 'left' ? 'left' : pit?.escapeDir === 'right' ? 'right' : (this.pitDigFlip === 0 ? 'left' : 'right');
    const dir: 'left' | 'right' = dir0 === 'left' ? 'left' : 'right';
    if (!this.pitEscapeMode) {
      const mapSeed = presenter?.state?.mapSeed || 0;
      const wBin = Math.max(0, Math.min(20, Math.round((Number(pit?.widthPx) || 0) / 10)));
      const dBin = Math.max(0, Math.min(20, Math.round((Number(pit?.depthPx) || 0) / 20)));
      const keyJump = `ai:tpl:v1:${mapSeed}:pit:w${wBin}:d${dBin}:dir${dir}:pit_escape_jump`;
      const keyRope = `ai:tpl:v1:${mapSeed}:pit:w${wBin}:d${dBin}:dir${dir}:pit_escape_rope`;
      const keyDig = `ai:tpl:v1:${mapSeed}:pit:w${wBin}:d${dBin}:dir${dir}:pit_escape_dig`;
      const sJump = getTemplate(keyJump)?.meanSuccess ?? null;
      const sRope = getTemplate(keyRope)?.meanSuccess ?? null;
      const sDig = getTemplate(keyDig)?.meanSuccess ?? null;
      const canJ = !!pit?.canJumpOut;
      const canR = !!pit?.canRopeOut && ropeRemaining > 0;
      const cands: Array<{ mode: 'jump' | 'rope' | 'dig'; s: number }> = [];
      if (canJ) cands.push({ mode: 'jump', s: typeof sJump === 'number' ? sJump : 0.5 });
      if (canR) cands.push({ mode: 'rope', s: typeof sRope === 'number' ? sRope : 0.45 });
      cands.push({ mode: 'dig', s: typeof sDig === 'number' ? sDig : 0.35 });
      cands.sort((a, b) => b.s - a.s);
      this.pitEscapeMode = cands[0]?.mode || (canJ ? 'jump' : canR ? 'rope' : 'dig');
    }
    if (!this.pendingEscapeEval) {
      const mapSeed = presenter?.state?.mapSeed || 0;
      this.pendingEscapeEval = {
        wormIndex: Number(presenter?.state?.currentPlayerIndex) || 0,
        startDepthPx: Number(pit?.depthPx) || 0,
        startTrapped: pit?.isTrapped ? 1 : 0,
        mode: this.pitEscapeMode,
        dir,
        widthPx: Number(pit?.widthPx) || 0,
        mapSeed
      };
    } else {
      this.pendingEscapeEval.mode = this.pitEscapeMode;
    }
    if (this.pitEscapeMode === 'jump') {
      if (!pit?.canJumpOut || this.pitEscapeAttempts.jump >= 7) this.pitEscapeMode = pit?.canRopeOut ? 'rope' : 'dig';
      else {
        presenter.handleInput?.('left', false, true);
        presenter.handleInput?.('right', false, true);
        presenter.handleInput?.(dir, true, true);
        this.tryJump(presenter, player, now);
        this.trackStuck(player, dt);
        if (this.stuckTime > 0.9) this.pitEscapeAttempts.jump += 1;
        return true;
      }
    }
    if (this.pitEscapeMode === 'rope') {
      if (!pit?.canRopeOut || ropeRemaining <= 0 || this.pitEscapeAttempts.rope >= 5) this.pitEscapeMode = 'dig';
      else {
        const res = this.tryAttachRope(presenter, player, moveTo, dir, ropeBudget, now, 'rope_climb');
        if (res === 'ok') return true;
        if (res !== 'cooldown') this.pitEscapeAttempts.rope += 1;
        return true;
      }
    }
    if (this.pitEscapeMode === 'dig') {
      if (this.tryDigEscapePit(presenter, player, pit)) return true;
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
      presenter.handleInput?.('jump', false, true);
      presenter.handleInput?.(dir, true, true);
      this.trackStuck(player, dt);
      return true;
    }
    return false;
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

    if (this.plan?.intent === 'escape_pit') {
      const pit = this.getPitInfo(presenter, player, ropeRemaining, now);
      if (pit && pit.isTrapped) {
        return this.executePitEscape(presenter, player, moveTo, now, dt, ropeBudget, ropeRemaining, pit);
      }
    }

    if (player.ropeActive) {
      this.executeRope(presenter, player, moveTo, dir, now, dt);
      return true;
    }

    if (this.ropeJumpAttachUntil > now && this.ropeJumpMoveTo && this.ropeJumpDir) {
      const vy0 = Number.isFinite(player.vy) ? Number(player.vy) : 0;
      if ((player.isJumping || vy0 > 40) && this.ropeJumpStrategy && now >= this.lastRopeAttemptAt + 0.12) {
        const jt = Math.max(0, now - (this.lastJumpAt || 0));
        if (jt < 0.1 || vy0 < -160 || vy0 > 300) return true;
        const res = this.tryAttachRope(presenter, player, this.ropeJumpMoveTo, this.ropeJumpDir, this.ropeJumpBudget, now, this.ropeJumpStrategy);
        if (res === 'ok') {
          this.ropeJumpAttachUntil = 0;
          this.ropeJumpMoveTo = null;
          this.ropeJumpDir = null;
          this.ropeJumpBudget = 0;
          this.ropeJumpStrategy = null;
          return true;
        }
      }
      if (now >= this.ropeJumpAttachUntil) {
        this.ropeJumpAttachUntil = 0;
        this.ropeJumpMoveTo = null;
        this.ropeJumpDir = null;
        this.ropeJumpBudget = 0;
        this.ropeJumpStrategy = null;
      }
    }

    if (this.backoffJumpDir && now < this.backoffJumpAt) {
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
      presenter.handleInput?.('jump', false, true);
      presenter.handleInput?.(this.backoffJumpDir === 'left' ? 'right' : 'left', true, true);
      this.trackStuck(player, dt);
      return true;
    }

    if (this.backoffJumpDir && now >= this.backoffJumpAt && now < this.backoffJumpUntil) {
      if (this.tryJump(presenter, player, now)) {
        presenter.handleInput?.('left', false, true);
        presenter.handleInput?.('right', false, true);
        presenter.handleInput?.(this.backoffJumpDir, true, true);
        this.trackStuck(player, dt);
        return true;
      }
      this.backoffJumpDir = null;
      this.backoffJumpAt = 0;
      this.backoffJumpUntil = 0;
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

    if (obstacle && !ceilingLow && this.stuckTime > 0.45 && !this.backoffJumpDir && now - this.lastJumpAt > 0.9) {
      this.backoffJumpDir = dir;
      this.backoffJumpAt = now + 0.22;
      this.backoffJumpUntil = this.backoffJumpAt + 0.32;
      return true;
    }

    if (obstacle && ceilingLow && this.stuckTime > 0.35) {
      if (this.tryDigEscape(presenter, player, dir)) return true;
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
      if (this.tryDigEscape(presenter, player, dir)) return true;
      const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
      if (team) this.matchSpecialFailByTeam[team].walkObstacle += 1;
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
      const cooldownSec = player.isJumping ? 0.12 : 0.55;
      if (now - this.lastRopeAttemptAt < cooldownSec) {
        if (now - this.lastRopeCooldownLoggedAt >= cooldownSec) {
          this.lastRopeCooldownLoggedAt = now;
          this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy: this.strategy, result: 'cooldown', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs });
        }
        return true;
      }
      const res = this.tryAttachRope(presenter, player, moveTo, dir, ropeBudget, now, this.strategy);
      if (res === 'ok' || res === 'cooldown') return true;
      if (res === 'hard') this.recordStrategyFailure(this.strategy, now);
      if ((res === 'soft' || res === 'hard') && (moveTo.y - player.y) <= -120 && ropeRemaining > 0 && now - this.lastJumpAt > 0.85 && this.ropeJumpAttachUntil <= now) {
        this.ropeJumpAttachUntil = now + 0.65;
        this.ropeJumpMoveTo = moveTo;
        this.ropeJumpDir = dir;
        this.ropeJumpBudget = ropeBudget;
        this.ropeJumpStrategy = (moveTo.y - player.y) < -30 ? 'rope_climb' : 'rope_swing';
        this.strategy = 'jump';
        return true;
      }
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

    if (this.strategy === 'walk' && (cliff.isDeepVoid || cliff.isGapOrCliff)) {
      const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
      if (team) this.matchSpecialFailByTeam[team].walkCliff += 1;
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
    if (this.strategy === 'walk') {
      if (this.trackWallStall(presenter, player, dir, moveTo, dt, now)) return true;
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
    const dxTo = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const needUp = dy < -30;
    const needDown = dy > 30;
    const obstacle = this.detectObstacle(presenter, player, dir);
    const cliff = this.scanCliffAhead(presenter, player, dir);
    const gap = cliff.isGapOrCliff;
    const ceilingLow = this.detectCeilingLow(presenter, player, dir);
    const hasRope = Array.isArray(player.equipmentIds) && player.equipmentIds.includes('ninja_rope') && ropeRemaining > 0;
    const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : 'team1';
    const tf = this.matchSpecialFailByTeam[team];

    const candidates: MoveStrategy[] = [];
    if (hasRope && needUp) candidates.push('rope_climb');
    if (hasRope && gap && Math.abs(dxTo) >= 120) candidates.push('rope_swing');
    if (hasRope && needDown && !cliff.isDeepVoid) candidates.push('rope_descend');
    if (obstacle && !ceilingLow) candidates.push('jump');
    if (!obstacle && needUp && !ceilingLow) candidates.push('jump');
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
      if (s === 'walk' && obstacle) score -= 2.2;
      if (s === 'walk' && ceilingLow) score -= 1.4;
      if (cliff.isGapOrCliff && s === 'walk') score -= 3.0;
      if (ceilingLow && s === 'jump') score -= 3.0;
      if (s === 'walk') score -= tf.walkCliff * 0.9 + tf.walkObstacle * 0.6;
      if (s === 'rope_climb' || s === 'rope_swing' || s === 'rope_descend') score -= tf.ropeBorder * 1.1 + tf.ropeNoAttach * 0.9;

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

  private tryDigEscape(presenter: any, player: any, dir: 'left' | 'right'): boolean {
    if (this.firedThisTurn) return false;
    if (player.ropeActive || player.isJumping) return false;
    const cfg: any = presenter?.state?.botConfig || null;
    if (!cfg?.dig?.enabled) return false;
    const timeLeft = Number(presenter?.turnTimeLeft) || 0;
    const reserve = Number(cfg?.reserveSeconds) || 1;
    if (timeLeft <= reserve + 2.2) return false;
    const equipmentIds: string[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const bazookaIndex = equipmentIds.findIndex((id: string) => id === 'bazooka');
    const grenadeIndex = equipmentIds.findIndex((id: string) => id === 'grenade');
    let weaponIndex = bazookaIndex;
    let weaponId: string | null = null;
    if (weaponIndex >= 0) weaponId = 'bazooka';
    if (weaponIndex < 0 && grenadeIndex >= 0) {
      const g = presenter?.state?.teamAmmo?.[player.team]?.grenade;
      if (typeof g === 'number' && g > 0) {
        weaponIndex = grenadeIndex;
        weaponId = 'grenade';
      }
    }
    if (weaponIndex < 0 || !weaponId) return false;
    const aimAngle = weaponId === 'grenade' ? 0.65 : 0.55;
    const power = weaponId === 'grenade' ? 34 : 44;
    const weapon = getWeaponByEquipmentId(weaponId);
    const explosionRadius = Math.max(0, Number(weapon?.explosionRadius) || 0);
    const safeExtra = Math.max(0, Number(cfg?.scoring?.safeExtraRadius) || 0);
    const selfSafe = explosionRadius + 18 + safeExtra;
    const baseAim = dir === 'right' ? aimAngle : (Math.PI - aimAngle);
    const gunLength = 25;
    const originX = Number(player.x) || 0;
    const originY = (Number(player.y) || 0) - (Number(player.height) || 0) / 2;
    const dirX = Math.cos(baseAim);
    const dirY = Math.sin(baseAim);
    const startX = originX + dirX * gunLength;
    const startY = originY + dirY * gunLength;
    const maxDist = 220;
    const step = 4;
    let hitX = startX + dirX * maxDist;
    let hitY = startY + dirY * maxDist;
    const minHitDist = selfSafe + 12;
    for (let d = 0; d <= maxDist; d += step) {
      const x = startX + dirX * d;
      const y = startY + dirY * d;
      if (x < 0 || x >= presenter.state.width || y < 0 || y >= presenter.state.height) break;
      if (presenter.state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        const selfDist0 = Math.hypot(x - originX, y - (Number(player.y) || 0));
        if (selfDist0 >= minHitDist) {
          hitX = x;
          hitY = y;
          break;
        }
      }
    }
    const selfDist = Math.hypot(hitX - originX, hitY - (Number(player.y) || 0));
    if (selfDist < selfSafe) return false;
    const action = { weaponIndex, facingRight: dir === 'right', aimAngle, power, targetId: 'dig_escape' };
    this.fireAction(presenter, action);
    this.firedThisTurn = true;
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
  ): 'ok' | 'cooldown' | 'soft' | 'hard' {
    const equipmentIds: string[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const ropeIndex = equipmentIds.findIndex((id: string) => id === 'ninja_rope');
    const ropeRemaining = Math.max(0, ropeBudget - this.ropeAttachUsed);
    if (ropeIndex < 0) {
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'no_rope', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs });
      return 'hard';
    }
    if (this.ropeAttachUsed >= ropeBudget) {
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'budget', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs });
      return 'hard';
    }
    if (player.ropeActive) return 'ok';
    const cooldownSec = player.isJumping ? 0.12 : 0.55;
    if (now - this.lastRopeAttemptAt < cooldownSec) return 'cooldown';

    const dx = moveTo.x - player.x;
    const dy = moveTo.y - player.y;
    const isClimb = strategy === 'rope_climb';
    const isSwing = strategy === 'rope_swing';
    const isDescend = strategy === 'rope_descend';
    const allowNearDx = ((isClimb || isDescend) && Math.abs(dy) >= 80) || dy <= -120 || player.isJumping;
    const minDx = isSwing ? (dy <= -120 || player.isJumping ? 30 : 70) : (dy <= -120 || player.isJumping ? 30 : 60);
    if (Math.abs(dx) < minDx && !allowNearDx) {
      this.lastRopeAttemptAt = now;
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'dx_small', anglesTried: 0, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining, aimAngle: null, facingRight: null, rayHit: null, ropeActiveAfterFire: 0, ropeCast: null });
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
      if (dir === 'right' || bothSides) globalAngles.push(...mags.map(v => -v));
      if (dir === 'left' || bothSides) globalAngles.push(...mags.map(v => Math.PI - v));
    } else if (isDescend) {
      const up = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI * 0.42];
      const down = [0.12, 0.18, 0.26, 0.35];
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
      if (!best || score > best.score) best = { aimAngle: aimAngle, score, ray: res };
    }

    if (!best) {
      this.lastRopeAttemptAt = now;
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'no_anchor', anglesTried: globalAngles.length, bestScore: null, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining, aimAngle: null, facingRight: null, rayHit: null, ropeActiveAfterFire: 0, ropeCast: null });
      return 'hard';
    }

    const w = Number(presenter?.state?.width) || 0;
    const h = Number(presenter?.state?.height) || 0;
    const edgePadX = 70;
    const edgePadYTop = 10;
    const edgePadYBot = 70;
    if (best.ray.x <= edgePadX || best.ray.x >= w - edgePadX || best.ray.y <= edgePadYTop || best.ray.y >= h - edgePadYBot) {
      this.lastRopeAttemptAt = now;
      const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
      if (team) this.matchSpecialFailByTeam[team].ropeBorder += 1;
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'border', anglesTried: globalAngles.length, bestScore: best.score, anchor: null, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining, aimAngle: null, facingRight: null, rayHit: best.ray, ropeActiveAfterFire: 0, ropeCast: null });
      return 'hard';
    }

    player.aimAngle = best.aimAngle;
    presenter.handleInput?.('fire', true, true);
    presenter.handleInput?.('fire', false, true);
    this.lastRopeAttemptAt = now;
    this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'fired', anglesTried: globalAngles.length, bestScore: best.score, anchor: { x: best.ray.x, y: best.ray.y, dist: best.ray.dist }, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining, aimAngle: player.aimAngle, facingRight: player.facingRight ? 1 : 0, rayHit: best.ray, ropeActiveAfterFire: player.ropeActive ? 1 : 0, ropeCast: { x: player.ropeCastX, y: player.ropeCastY, t: player.ropeCastTime } });
    if (player.ropeActive) {
      this.ropeAttachUsed += 1;
      this.ropeStartedAt = now;
      this.ropeMode = isClimb ? 'climb' : isSwing ? 'swing' : 'descend';
      this.strategyCost0 = this.estimateCost(presenter, player, moveTo, now);
      this.strategyEvalAt = now + 0.65;
      this.ropeStallCount = 0;
      this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'attached', anglesTried: globalAngles.length, bestScore: best.score, anchor: { x: best.ray.x, y: best.ray.y, dist: best.ray.dist }, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining: Math.max(0, ropeRemaining - 1), aimAngle: player.aimAngle, facingRight: player.facingRight ? 1 : 0, rayHit: best.ray, ropeActiveAfterFire: 1, ropeCast: { x: player.ropeCastX, y: player.ropeCastY, t: player.ropeCastTime } });
      return 'ok';
    }

    this.emitAIVai(presenter, { type: 'bot_rope_attempt', t: now, team: player.team, wormId: String(presenter.state.currentPlayerIndex ?? player.id ?? ''), strategy, result: 'fired_no_attach', anglesTried: globalAngles.length, bestScore: best.score, anchor: { x: best.ray.x, y: best.ray.y, dist: best.ray.dist }, moveTo: { x: moveTo.x, y: moveTo.y }, dx: moveTo.x - player.x, dy: moveTo.y - player.y, aiV: AI_V, thinkSrc: this.lastThinkSrc, workerMs: this.lastWorkerMs, workerComputeMs: this.lastWorkerComputeMs, ropeRemaining, aimAngle: player.aimAngle, facingRight: player.facingRight ? 1 : 0, rayHit: best.ray, ropeActiveAfterFire: 0, ropeCast: { x: player.ropeCastX, y: player.ropeCastY, t: player.ropeCastTime } });
    const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
    if (team) this.matchSpecialFailByTeam[team].ropeNoAttach += 1;
    return 'hard';
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
      const improved = costNow + 3 < this.strategyCost0;
      if (improved) {
        this.recordStrategySuccess(s);
        this.strategyCost0 = costNow;
        this.strategyEvalAt = now + 0.65;
        this.ropeStallCount = 0;
      } else {
        this.ropeStallCount += 1;
        this.strategyEvalAt = now + 0.65;
        if (ropeElapsed > 1.5 && this.ropeStallCount >= 4) {
          this.recordStrategyFailure(s, now);
          presenter.handleInput?.('fire', true, true);
          presenter.handleInput?.('fire', false, true);
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
      presenter.handleInput?.('fire', false, true);
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
