import type { Landscape } from '../models/Landscape';
import type { BrandLogo } from '../models/BrandLogo';

export function integrateAirdrop(
  logo: BrandLogo,
  dt: number,
  gravity: number,
  landscape: Landscape
): void {
  logo.vy += gravity * dt;

  const step = 4;
  const dx = logo.vx * dt;
  const dy = logo.vy * dt;

  const sweepAxis = (axis: 'x' | 'y', delta: number): void => {
    const dir = Math.sign(delta);
    if (dir === 0) return;
    const total = Math.abs(delta);
    let moved = 0;
    while (moved < total) {
      const m = Math.min(step, total - moved);
      if (axis === 'x') logo.x += dir * m;
      else logo.y += dir * m;

      const hit = aabbHits(landscape, logo.x, logo.y, logo.collisionWidth / 2, logo.collisionHeight / 2);
      if (hit) {
        if (axis === 'x') {
          logo.x -= dir * m;
          logo.vx = 0;
        } else {
          logo.y -= dir * m;
          if (dir > 0) logo.touchedGround = true;
          logo.vy = 0;
        }
        break;
      }
      moved += m;
    }
  };

  sweepAxis('x', dx);
  sweepAxis('y', dy);

  if (logo.touchedGround) {
    const slope = estimateSlope(landscape, logo.x, logo.y, logo.collisionWidth / 2, logo.collisionHeight / 2);
    logo.vx += slope * gravity * dt * 0.25;

    const friction = 18;
    if (logo.vx > 0) logo.vx = Math.max(0, logo.vx - friction * dt);
    else logo.vx = Math.min(0, logo.vx + friction * dt);
  } else {
    logo.vx *= Math.pow(0.995, dt);
  }
}

export function estimateSlope(
  landscape: Landscape,
  cx: number,
  cy: number,
  hx: number,
  hy: number
): number {
  const footY = cy + hy;
  const sample = (sx: number): number => {
    const ix = Math.floor(sx);
    let y = Math.floor(footY);
    for (let i = 0; i < 60 && y < landscape.height - 1; i++, y++) {
      if (landscape.getMaterial(ix, y) > 0) return y;
    }
    return landscape.height;
  };
  const yL = sample(cx - hx);
  const yR = sample(cx + hx);
  return (yR - yL) / Math.max(1, hx * 2);
}

export function aabbHits(landscape: Landscape, cx: number, cy: number, hx: number, hy: number): boolean {
  const left = Math.floor(cx - hx);
  const right = Math.floor(cx + hx);
  const top = Math.floor(cy - hy);
  const bottom = Math.floor(cy + hy);

  for (let x = left; x <= right; x += 2) {
    if (landscape.getMaterial(x, top) > 0) return true;
    if (landscape.getMaterial(x, bottom) > 0) return true;
  }
  for (let y = top; y <= bottom; y += 2) {
    if (landscape.getMaterial(left, y) > 0) return true;
    if (landscape.getMaterial(right, y) > 0) return true;
  }
  return false;
}

