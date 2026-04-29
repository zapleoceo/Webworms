import { mulberry32, hashStringToSeed } from '../utils/SeededRng';
import type { AIDifficulty } from '../ai/AIDifficulty';
import { AI_DIFFICULTY } from '../ai/AIDifficulty';
import { getAIDifficulty } from '../ai/AIStorage';
import { buildSnapshotFromState, chooseBotAction, terrainFromLandscape } from '../ai/BotAI';

export class BotTurnController {
  private scheduled: number | null = null;
  private lastTurnIndex: number = -1;
  private firedThisTurn: boolean = false;

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
      if (this.scheduled !== null) {
        clearTimeout(this.scheduled);
        this.scheduled = null;
      }
    }

    if (!isBotTurn) return;

    const hasProjectiles = (presenter.state.projectiles?.length || 0) > 0;
    if (this.firedThisTurn) {
      if (!hasProjectiles && !isWorldBusy) {
        presenter.nextTurn?.();
      }
      return;
    }

    if (hasProjectiles || isWorldBusy) return;
    if (this.scheduled !== null) return;

    const difficulty = getAIDifficulty() as AIDifficulty;
    const cfg = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
    const delay = Math.max(0, cfg.reactionDelayMs);

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
      const shooter = snap.worms.find(w => w.team === 'team2' && Math.abs(w.x - p.x) < 0.01 && Math.abs(w.y - p.y) < 0.01) || snap.worms.find(w => w.team === 'team2');
      if (!shooter) return;
      const enemies = snap.worms.filter(w => w.team === 'team1' && w.health > 0);
      const action = chooseBotAction(difficulty, rng, snap.world, shooter, enemies);
      if (!action) return;

      presenter.handleInput?.('switch', true, true, action.weaponIndex);
      p.facingRight = action.facingRight;
      p.aimAngle = action.aimAngle;
      p.aimPower = action.power;
      presenter.handleInput?.('fire', false, true);
      this.firedThisTurn = true;
    }, delay) as unknown) as number;
  }
}
