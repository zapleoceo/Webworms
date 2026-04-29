import type { GameState } from '../../models/GameState';
import type { Worm } from '../../models/Worm';

export class RopeTool {
  public static tryAttach(player: Worm, state: GameState): void {
    const baseY = player.y - player.height / 2;
    let globalAimAngle = player.aimAngle;
    if (!player.facingRight) globalAimAngle = Math.PI - player.aimAngle;

    const maxDist = 700;
    const step = 4;
    for (let d = 12; d <= maxDist; d += step) {
      const x = player.x + Math.cos(globalAimAngle) * d;
      const y = baseY + Math.sin(globalAimAngle) * d;
      if (x <= 30 || x >= state.width - 30 || y <= 0 || y >= state.height - 30) break;
      if (state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        player.ropeActive = true;
        player.ropeAnchorX = x;
        player.ropeAnchorY = y;
        player.ropeLength = Math.max(40, Math.hypot(player.x - x, player.y - y));
        player.isJumping = true;
        return;
      }
    }
  }

  public static detach(player: Worm): void {
    player.ropeActive = false;
  }

  public static adjustLength(player: Worm, delta: number): void {
    player.ropeLength = Math.max(40, Math.min(700, player.ropeLength + delta));
  }

  public static pump(player: Worm, dir: number, strength: number, dt: number): void {
    const dx = player.x - player.ropeAnchorX;
    const dy = player.y - player.ropeAnchorY;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = -dy / dist;
    const ty = dx / dist;
    player.vx += tx * dir * strength * dt;
    player.vy += ty * dir * strength * dt;
  }

  public static applyConstraint(player: Worm, state: GameState): void {
    const ax = player.ropeAnchorX;
    const ay = player.ropeAnchorY;
    if (state.landscape.getMaterial(Math.floor(ax), Math.floor(ay)) <= 0) {
      player.ropeActive = false;
      return;
    }

    const dx = player.x - ax;
    const dy = player.y - ay;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist <= player.ropeLength) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const diff = dist - player.ropeLength;
    player.x -= nx * diff;
    player.y -= ny * diff;

    const vDot = player.vx * nx + player.vy * ny;
    if (vDot > 0) {
      player.vx -= nx * vDot;
      player.vy -= ny * vDot;
    }
  }
}

