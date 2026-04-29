import { mulberry32, hashStringToSeed } from '../utils/SeededRng';
import type { AIDifficulty } from '../ai/AIDifficulty';
import { AI_DIFFICULTY } from '../ai/AIDifficulty';
import { getAIDifficulty } from '../ai/AIStorage';
import { buildSnapshotFromState, chooseBotPlan, terrainFromLandscape } from '../ai/BotAI';

export class BotTurnController {
  private scheduled: number | null = null;
  private lastTurnIndex: number = -1;
  private firedThisTurn: boolean = false;
  private plan: { moveTo?: { x: number; y: number }; action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number } } | null = null;
  private moveStartedAt: number | null = null;
  private moveDir: 'left' | 'right' | null = null;

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
      this.plan = null;
      this.moveStartedAt = null;
      this.moveDir = null;
      presenter.handleInput?.('left', false, true);
      presenter.handleInput?.('right', false, true);
      if (this.scheduled !== null) {
        clearTimeout(this.scheduled);
        this.scheduled = null;
      }
    }

    if (!isBotTurn) return;

    const hasProjectiles = (presenter.state.projectiles?.length || 0) > 0;
    if (this.firedThisTurn) {
      return;
    }

    if (hasProjectiles) return;

    const difficulty = getAIDifficulty() as AIDifficulty;
    const cfg = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
    const delay = Math.max(1000, cfg.reactionDelayMs);

    if (!this.plan && this.scheduled === null && !isWorldBusy) {
      this.scheduled = (setTimeout(() => {
        this.scheduled = null;
        if (!presenter?.isRunning || !presenter?.state) return;
        const p = presenter.state.getCurrentPlayer?.();
        if (!p || p.team !== 'team2') return;
        if ((presenter.state.projectiles?.length || 0) > 0) return;

        const rngSeed = ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`ai:${presenter.matchDuration.toFixed(2)}:${presenter.state.currentPlayerIndex}`)) >>> 0;
        const rng = mulberry32(rngSeed);

        const terrain = terrainFromLandscape(presenter.state.landscape);
        const snap = buildSnapshotFromState(presenter.state, presenter.physics.gravity, terrain);
        const shooter = snap.worms.find(w => w.id === String(presenter.state.currentPlayerIndex)) || snap.worms.find(w => w.team === 'team2');
        if (!shooter) return;
        const enemies = snap.worms.filter(w => w.team === 'team1' && w.health > 0);
        const allies = snap.worms.filter(w => w.team === 'team2' && w.health > 0);
        const plan = chooseBotPlan(difficulty, rng, snap.world, shooter, enemies, allies);
        if (!plan) return;

        this.plan = { moveTo: plan.moveTo, action: plan.action };
        if (plan.moveTo) {
          this.moveStartedAt = presenter.matchDuration;
        }
      }, delay) as unknown) as number;
    }

    if (!this.plan) return;

    const moveTo = this.plan.moveTo;
    const now = presenter.matchDuration;
    const moveElapsed = this.moveStartedAt === null ? 0 : Math.max(0, now - this.moveStartedAt);

    if (moveTo && moveElapsed < 25) {
      const dx = moveTo.x - player.x;
      if (Math.abs(dx) > 18) {
        const dir: 'left' | 'right' = dx < 0 ? 'left' : 'right';
        if (this.moveDir !== dir) {
          presenter.handleInput?.('left', false, true);
          presenter.handleInput?.('right', false, true);
          this.moveDir = dir;
        }
        presenter.handleInput?.(dir, true, true);
        return;
      }
    }

    presenter.handleInput?.('left', false, true);
    presenter.handleInput?.('right', false, true);
    this.moveDir = null;

    if (moveTo && Math.abs(moveTo.x - player.x) > 35) {
      const rngSeed = ((presenter.state.mapSeed || 1) ^ hashStringToSeed(`ai:${presenter.matchDuration.toFixed(2)}:${presenter.state.currentPlayerIndex}`)) >>> 0;
      const rng = mulberry32(rngSeed);
      const terrain = terrainFromLandscape(presenter.state.landscape);
      const snap = buildSnapshotFromState(presenter.state, presenter.physics.gravity, terrain);
      const shooter = snap.worms.find(w => w.id === String(presenter.state.currentPlayerIndex)) || snap.worms.find(w => w.team === 'team2');
      if (shooter) {
        shooter.x = player.x;
        shooter.y = player.y;
        const enemies = snap.worms.filter(w => w.team === 'team1' && w.health > 0);
        const allies = snap.worms.filter(w => w.team === 'team2' && w.health > 0);
        const p2 = chooseBotPlan(difficulty, rng, snap.world, shooter, enemies, allies);
        if (p2) this.plan.action = p2.action;
      }
    }

    presenter.handleInput?.('switch', true, true, this.plan.action.weaponIndex);
    player.facingRight = this.plan.action.facingRight;
    player.aimAngle = this.plan.action.aimAngle;
    player.aimPower = this.plan.action.power;
    presenter.handleInput?.('fire', false, true);
    this.firedThisTurn = true;
  }
}
