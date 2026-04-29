import type { Landscape } from '../models/Landscape';
import type { BrandLogo } from '../models/BrandLogo';

function obbPointSolid(landscape: Landscape, cx: number, cy: number, lx: number, ly: number, angle: number): boolean {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const x = Math.floor(cx + lx * cosA - ly * sinA);
  const y = Math.floor(cy + lx * sinA + ly * cosA);
  if (y < 0) return false;
  return landscape.getMaterial(x, y) > 0;
}

export function integrateAirdrop(
  logo: BrandLogo,
  dt: number,
  gravity: number,
  landscape: Landscape
): void {
  logo.touchedGround = false;

  logo.vy += gravity * dt;

  const hw = logo.collisionWidth / 2;
  const hh = logo.collisionHeight / 2;

  let hitWall = false;

  let unstickSteps = 0;
  while (obbHits(landscape, logo.x, logo.y, hw, hh, logo.angle) && unstickSteps < 16) {
    logo.y -= 1;
    unstickSteps++;
  }

  const step = 1;
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

      const hit = obbHits(landscape, logo.x, logo.y, hw, hh, logo.angle);
      if (hit) {
        if (axis === 'x') {
          logo.x -= dir * m;
          logo.vx *= -0.15;
          if (Math.abs(logo.vx) < 5) logo.vx = 0;
          logo.angularVelocity *= 0.6;
          hitWall = true;
        } else {
          logo.y -= dir * m;
          if (dir > 0) logo.touchedGround = true;
          if (dir > 0) {
            const impact = logo.vy;
            if (impact > 260) {
              const bf = Math.max(0, (logo as any).bounceFactor ?? 1);
              const restitution = 0.08 * bf;
              logo.vy = -Math.min(impact * restitution, 80 * bf);
              (logo as any).bounceFactor = Math.max(0, bf * 0.55 - 0.02);
            } else {
              logo.vy = 0;
            }
          } else {
            logo.vy = 0;
          }
          logo.angularVelocity *= 0.35;
        }
        break;
      }
      moved += m;
    }
  };

  sweepAxis('x', dx);
  sweepAxis('y', dy);

  if (hitWall) {
    const av = Math.abs(logo.angularVelocity);
    const slow = Math.max(0, (av - 0.4) * 4) + 1;
    logo.vx *= Math.pow(0.4, dt * slow);
    logo.vy *= Math.pow(0.4, dt * slow);
    logo.angularVelocity *= Math.pow(0.15, dt);
  }

  if (logo.touchedGround && !hitWall) {
    const leftTouch = obbPointSolid(landscape, logo.x, logo.y, -hw, hh + 2, logo.angle);
    const rightTouch = obbPointSolid(landscape, logo.x, logo.y, hw, hh + 2, logo.angle);
    if (leftTouch !== rightTouch) {
      const dir = rightTouch ? 1 : -1;
      logo.angularVelocity += dir * 18 * dt;
      logo.vx = Math.max(-80, Math.min(80, logo.vx + dir * 60 * dt));
      const friction = 18;
      if (logo.vx > 0) logo.vx = Math.max(0, logo.vx - friction * dt);
      else logo.vx = Math.min(0, logo.vx + friction * dt);
      return;
    }

    const slope = estimateSlope(landscape, logo.x, logo.y, hw, hh);
    logo.vx += slope * gravity * dt * 0.25;

    const friction = 18;
    if (logo.vx > 0) logo.vx = Math.max(0, logo.vx - friction * dt);
    else logo.vx = Math.min(0, logo.vx + friction * dt);

    const targetAngle = Math.atan(slope);
    const TAU = Math.PI * 2;
    const norm = (a: number) => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    
    const a0 = norm(targetAngle);
    const a1 = norm(targetAngle + Math.PI);
    const cur = logo.angle;
    const d0 = Math.abs(norm(cur - a0));
    const d1 = Math.abs(norm(cur - a1));
    const bestAngle = d0 <= d1 ? a0 : a1;

    logo.angularVelocity += norm(bestAngle - logo.angle) * 10 * dt;
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

export function obbHits(landscape: Landscape, cx: number, cy: number, hw: number, hh: number, angle: number): boolean {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const check = (lx: number, ly: number): boolean => {
    const x = Math.floor(cx + lx * cosA - ly * sinA);
    const y = Math.floor(cy + lx * sinA + ly * cosA);
    if (y < 0) return false;
    return landscape.getMaterial(x, y) > 0;
  };

  const sx = Math.max(1, Math.floor(hw));
  const sy = Math.max(1, Math.floor(hh));
  const step = 1;

  for (let i = -sx; i <= sx; i += step) {
    if (check(i, -sy)) return true;
    if (check(i, sy)) return true;
  }
  for (let j = -sy; j <= sy; j += step) {
    if (check(-sx, j)) return true;
    if (check(sx, j)) return true;
  }
  return false;
}
