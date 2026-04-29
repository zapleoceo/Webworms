import type { GameState } from '../../models/GameState';
import type { Worm } from '../../models/Worm';

export class RopeTool {
  public static readonly MAX_DISTANCE = 420;
  public static readonly MIN_LENGTH = 40;
  public static readonly MAX_LENGTH = 420;

  public static tryAttach(player: Worm, state: GameState): void {
    const baseY = player.y - player.height / 2;
    let globalAimAngle = player.aimAngle;
    if (!player.facingRight) globalAimAngle = Math.PI - player.aimAngle;

    const maxDist = RopeTool.MAX_DISTANCE;
    const step = 4;
    for (let d = 12; d <= maxDist; d += step) {
      const x = player.x + Math.cos(globalAimAngle) * d;
      const y = baseY + Math.sin(globalAimAngle) * d;
      if (x <= 30 || x >= state.width - 30 || y <= 0 || y >= state.height - 30) break;
      if (state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        player.ropeActive = true;
        player.ropeAnchorX = x;
        player.ropeAnchorY = y;
        player.ropeLength = Math.max(RopeTool.MIN_LENGTH, Math.min(RopeTool.MAX_LENGTH, Math.hypot(player.x - x, player.y - y)));
        player.isJumping = true;
        return;
      }
    }
  }

  public static detach(player: Worm): void {
    player.ropeActive = false;
  }

  public static adjustLength(player: Worm, delta: number): void {
    player.ropeLength = Math.max(RopeTool.MIN_LENGTH, Math.min(RopeTool.MAX_LENGTH, player.ropeLength + delta));
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

  public static applyConstraint(player: Worm, state: GameState, dt: number): void {
    const ax = player.ropeAnchorX;
    const ay = player.ropeAnchorY;
    if (state.landscape.getMaterial(Math.floor(ax), Math.floor(ay)) <= 0) {
      player.ropeActive = false;
      return;
    }

    const dx = player.x - ax;
    const dy = player.y - ay;
    const dist = Math.hypot(dx, dy) || 1;
    player.isJumping = true;

    const nx = dx / dist;
    const ny = dy / dist;
    const tx = -ny;
    const ty = nx;

    const vRad = player.vx * nx + player.vy * ny;
    const vTan = player.vx * tx + player.vy * ty;
    const tanDamp = Math.pow(0.82, dt);
    const nextVTan = vTan * tanDamp;

    player.vx = nx * vRad + tx * nextVTan;
    player.vy = ny * vRad + ty * nextVTan;

    if (dist <= player.ropeLength) return;

    const diff = dist - player.ropeLength;
    const pull = Math.min(diff, 240 * dt);
    player.x -= nx * pull;
    player.y -= ny * pull;

    const vDot = player.vx * nx + player.vy * ny;
    if (vDot > 0) {
      player.vx -= nx * vDot;
      player.vy -= ny * vDot;
    }
  }
}
