import type { GameState } from '../../models/GameState';
import type { Worm } from '../../models/Worm';

export class RopeTool {
  public static readonly MAX_DISTANCE = 252;
  public static readonly MIN_LENGTH = 40;
  public static readonly MAX_LENGTH = 252;
  public static readonly CAST_DURATION = 0.18;

  private static raycast(
    player: Worm,
    state: GameState,
    maxDist: number
  ): { hit: boolean; x: number; y: number; dist: number } {
    const baseY = player.y - player.height / 2;
    let globalAimAngle = player.aimAngle;
    if (!player.facingRight) globalAimAngle = Math.PI - player.aimAngle;

    const step = 4;
    for (let d = 12; d <= maxDist; d += step) {
      const x = player.x + Math.cos(globalAimAngle) * d;
      const y = baseY + Math.sin(globalAimAngle) * d;
      if (x <= 30 || x >= state.width - 30 || y <= 0 || y >= state.height - 30) break;
      if (state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        return { hit: true, x, y, dist: d };
      }
    }
    const x = player.x + Math.cos(globalAimAngle) * maxDist;
    const y = baseY + Math.sin(globalAimAngle) * maxDist;
    return { hit: false, x, y, dist: maxDist };
  }

  public static tryAttach(player: Worm, state: GameState): void {
    const res = RopeTool.raycast(player, state, RopeTool.MAX_DISTANCE);
    player.ropeCastDuration = RopeTool.CAST_DURATION;
    player.ropeCastTime = RopeTool.CAST_DURATION;
    player.ropeCastX = res.x;
    player.ropeCastY = res.y;

    if (res.hit) {
      player.ropeActive = true;
      player.ropeNodes = [];
      player.ropeAnchorX = res.x;
      player.ropeAnchorY = res.y;
      player.ropeLength = Math.max(RopeTool.MIN_LENGTH, Math.min(RopeTool.MAX_LENGTH, Math.hypot(player.x - res.x, player.y - res.y)));
      player.isJumping = true;
    }
  }

  public static detach(player: Worm): void {
    player.ropeActive = false;
    player.ropeNodes = [];
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
    const vTan = player.vx * tx + player.vy * ty;
    const maxTan = 150;
    const k = Math.max(0, 1 - Math.abs(vTan) / maxTan);
    if (k <= 0) return;
    player.vx += tx * dir * strength * k * dt;
    player.vy += ty * dir * strength * k * dt;
  }

  private static segmentHitsTerrain(state: GameState, x0: number, y0: number, x1: number, y1: number): { hit: boolean; x: number; y: number } {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return { hit: false, x: x1, y: y1 };
    const steps = Math.max(1, Math.floor(dist / 3));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        const px = x0 + dx * ((i - 1) / steps);
        const py = y0 + dy * ((i - 1) / steps);
        return { hit: true, x: px, y: py };
      }
    }
    return { hit: false, x: x1, y: y1 };
  }

  private static updateWrapUnwrap(player: Worm, state: GameState): void {
    const sx = player.x;
    const sy = player.y - player.height / 2;
    const first = player.ropeNodes.length > 0 ? player.ropeNodes[0] : { x: player.ropeAnchorX, y: player.ropeAnchorY };

    const wrap = RopeTool.segmentHitsTerrain(state, sx, sy, first.x, first.y);
    if (wrap.hit) {
      const last = player.ropeNodes[0];
      if (!last || Math.hypot(last.x - wrap.x, last.y - wrap.y) > 6) {
        player.ropeNodes.unshift({ x: wrap.x, y: wrap.y });
      }
    }

    while (player.ropeNodes.length > 0) {
      const second = player.ropeNodes.length > 1 ? player.ropeNodes[1] : { x: player.ropeAnchorX, y: player.ropeAnchorY };
      const chk = RopeTool.segmentHitsTerrain(state, sx, sy, second.x, second.y);
      if (!chk.hit) {
        player.ropeNodes.shift();
        continue;
      }
      break;
    }
  }

  private static polylineLength(player: Worm): number {
    const sx = player.x;
    const sy = player.y - player.height / 2;
    let px = sx;
    let py = sy;
    let len = 0;
    for (const n of player.ropeNodes) {
      len += Math.hypot(n.x - px, n.y - py);
      px = n.x;
      py = n.y;
    }
    len += Math.hypot(player.ropeAnchorX - px, player.ropeAnchorY - py);
    return len;
  }

  public static applyConstraint(player: Worm, state: GameState, dt: number): void {
    const ax = player.ropeAnchorX;
    const ay = player.ropeAnchorY;
    if (state.landscape.getMaterial(Math.floor(ax), Math.floor(ay)) <= 0) {
      player.ropeActive = false;
      return;
    }

    RopeTool.updateWrapUnwrap(player, state);

    const p1 = player.ropeNodes.length > 0 ? player.ropeNodes[0] : { x: ax, y: ay };
    const dx = player.x - p1.x;
    const dy = player.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    player.isJumping = true;

    const nx = dx / dist;
    const ny = dy / dist;
    const tx = -ny;
    const ty = nx;

    const totalLen = RopeTool.polylineLength(player);
    const tension = Math.max(0, Math.min(1, (totalLen - (player.ropeLength - 10)) / 10));

    const vRad = player.vx * nx + player.vy * ny;
    const vTan = player.vx * tx + player.vy * ty;
    const tanDamp = Math.pow(1 - 0.55 * tension, dt);
    const nextVTan = vTan * tanDamp;

    player.vx = nx * vRad + tx * nextVTan;
    player.vy = ny * vRad + ty * nextVTan;

    if (totalLen <= player.ropeLength) return;

    const diff = totalLen - player.ropeLength;
    const pull = Math.min(diff, 200 * dt);
    player.x -= nx * pull;
    player.y -= ny * pull;

    const vDot = player.vx * nx + player.vy * ny;
    if (vDot > 0) {
      player.vx -= nx * vDot;
      player.vy -= ny * vDot;
    }
  }
}
