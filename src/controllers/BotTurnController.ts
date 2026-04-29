import { mulberry32, hashStringToSeed } from '../utils/SeededRng';
import { getAIDifficulty } from '../ai/AIStorage';
import type { AIDifficulty, BotConfig } from '../ai/BotConfig';
import { DEFAULT_BOT_CONFIG } from '../ai/BotConfig';
import { buildSnapshotFromState, chooseBotAction, chooseBotPlan, terrainFromLandscape } from '../ai/BotAI';

export class BotTurnController {
  private lastTurnIndex: number = -1;
  private firedThisTurn: boolean = false;
  private plannedThisTurn: boolean = false;
  private plan: { moveTo?: { x: number; y: number }; action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number } } | null = null;
  private moveStartedAt: number = 0;
  private ropeAttachUsed: number = 0;
  private ropeStartedAt: number = 0;
  private lastRopeAttemptAt: number = -999;

  public update(presenter: any, isWorldBusy: boolean): void {
    if (!presenter?.isRunning) return;
    if (!presenter?.isHost) return;
    if (!presenter?.state) return;
    if (presenter.state.mode !== 'ai') return;

    const curIdx = presenter.state.currentPlayerIndex ?? -1;
    const player = presenter.state.getCurrentPlayer?.();
    if (!player || curIdx < 0) return;

    const isBotTurn = player.team === 'team2';

    if (curIdx !== this.lastTurnIndex) {
      this.lastTurnIndex = curIdx;
      this.firedThisTurn = false;
      this.plannedThisTurn = false;
      this.plan = null;
      this.moveStartedAt = presenter.matchDuration || 0;
      this.ropeAttachUsed = 0;
      this.ropeStartedAt = 0;
      this.lastRopeAttemptAt = -999;
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
      presenter.handleInput?.('up', false, true);
      presenter.handleInput?.('down', false, true);
      presenter.handleInput?.('fire', false, true);
    }

    if (!isBotTurn) return;

    const hasProjectiles = (presenter.state.projectiles?.length || 0) > 0;
    if (hasProjectiles) return;
    if (this.firedThisTurn) return;

    const botCfg: BotConfig = presenter.state.botConfig || DEFAULT_BOT_CONFIG;
    const difficulty = (getAIDifficulty() as AIDifficulty) || 'medium';
    const maxTurn = Number.isFinite(presenter.maxTurnTime) ? presenter.maxTurnTime : 30;
    const timeLeft = Number.isFinite(presenter.turnTimeLeft) ? presenter.turnTimeLeft : 0;
    const elapsed = Math.max(0, maxTurn - timeLeft);
    const planSeconds = botCfg.planSeconds;
    const reserveSeconds = botCfg.reserveSeconds;
    const executeSeconds = Math.max(0, maxTurn - planSeconds - reserveSeconds);
    const ropeBudget = botCfg.ropeAttachLimit[difficulty] ?? 0;

    if (timeLeft <= reserveSeconds) {
      if (!isWorldBusy) {
        const action = this.computeActionFromCurrent(presenter, botCfg);
        if (action) {
          const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter));
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
      const shooter = snap.worms.find(w => w.id === String(presenter.state.currentPlayerIndex)) || snap.worms.find(w => w.team === 'team2');
      if (shooter) {
        const enemies = snap.worms.filter(w => w.team === 'team1' && w.health > 0);
        const allies = snap.worms.filter(w => w.team === 'team2' && w.health > 0);
        const plan = chooseBotPlan(rng, snap.world, shooter, enemies, allies, botCfg, executeSeconds, ropeBudget);
        if (plan) {
          this.plan = { moveTo: plan.moveTo, action: { weaponIndex: plan.action.weaponIndex, facingRight: plan.action.facingRight, aimAngle: plan.action.aimAngle, power: plan.action.power } };
          this.moveStartedAt = presenter.matchDuration || 0;
        }
      }
    }

    if (!this.plan) return;

    const moveTo = this.plan.moveTo;
    const now = presenter.matchDuration || 0;
    const moveElapsed = Math.max(0, now - this.moveStartedAt);

    if (moveTo && moveElapsed < executeSeconds) {
      const dx = moveTo.x - player.x;
      if (Math.abs(dx) > 24) {
        if (this.tryRopeMove(presenter, player, dx, now, ropeBudget)) return;
        const dir = dx < 0 ? 'left' : 'right';
        presenter.handleInput?.('left', false, true);
        presenter.handleInput?.('right', false, true);
        presenter.handleInput?.(dir, true, true);
        return;
      }
    }

    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    presenter.handleInput?.('up', false, true);

    if (!isWorldBusy) {
      const action = this.computeActionFromCurrent(presenter, botCfg) || this.plan.action;
      const noisy = this.applyError(action, botCfg, difficulty, this.rngForTurn(presenter));
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
    const shooter = snap.worms.find(w => w.id === String(presenter.state.currentPlayerIndex)) || snap.worms.find(w => w.team === 'team2');
    if (!shooter) return null;
    shooter.x = p.x;
    shooter.y = p.y;
    shooter.height = p.height || shooter.height;
    shooter.equipmentIds = Array.isArray(p.equipmentIds) ? p.equipmentIds : shooter.equipmentIds;
    shooter.weaponCooldowns = p.weaponCooldowns || shooter.weaponCooldowns;
    const enemies = snap.worms.filter(w => w.team === 'team1' && w.health > 0);
    const allies = snap.worms.filter(w => w.team === 'team2' && w.health > 0);
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

  private tryRopeMove(presenter: any, player: any, dx: number, now: number, ropeBudget: number): boolean {
    const equipmentIds: string[] = Array.isArray(player.equipmentIds) ? player.equipmentIds : [];
    const ropeIndex = equipmentIds.findIndex((id: string) => id === 'rope');
    if (ropeIndex < 0) return false;
    if (this.ropeAttachUsed >= ropeBudget) return false;

    const dir = dx < 0 ? 'left' : 'right';
    const wantAttach = Math.abs(dx) > 210 && !player.ropeActive && (now - this.lastRopeAttemptAt) > 0.5;
    if (wantAttach) {
      presenter.handleInput?.('switch', true, true, ropeIndex);
      player.facingRight = dir === 'right';
      player.aimAngle = dir === 'right' ? (-Math.PI / 3) : (Math.PI / 3);
      presenter.handleInput?.('fire', true, true);
      this.lastRopeAttemptAt = now;
      if (player.ropeActive) {
        this.ropeAttachUsed += 1;
        this.ropeStartedAt = now;
      }
      return true;
    }

    if (!player.ropeActive) return false;

    const ropeElapsed = now - this.ropeStartedAt;
    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    presenter.handleInput?.(dir, true, true);

    if (ropeElapsed < 0.85) {
      presenter.handleInput?.('up', true, true);
    } else {
      presenter.handleInput?.('up', false, true);
    }

    if (Math.abs(dx) < 65 || ropeElapsed > 2.6) {
      presenter.handleInput?.('up', false, true);
      presenter.handleInput?.(dir, false, true);
      presenter.handleInput?.('fire', true, true);
    }
    return true;
  }
}
