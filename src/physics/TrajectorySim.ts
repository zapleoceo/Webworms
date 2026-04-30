export type MaterialQuery = {
  width: number;
  height: number;
  getMaterial(x: number, y: number): number;
};

export type Vec2 = { x: number; y: number };

export type GrenadeConfig = {
  fuseSeconds: number;
  restitution: number;
  friction: number;
  stopSpeed: number;
};

export type ProjectileParams = {
  start: Vec2;
  velocity: Vec2;
  gravity: number;
  wind: number;
  windMultiplier: number;
  radius: number;
  dt: number;
  maxTime: number;
  mode?: 'projectile' | 'grenade';
  grenade?: GrenadeConfig;
};

export type TrajectoryResult = {
  hitTerrain: boolean;
  end: Vec2;
  minDistToTarget: number;
  hitTarget: boolean;
};

const circleOffsetsCache = new Map<number, Array<{ dx: number; dy: number }>>();

export function circleOffsets(pr: number): Array<{ dx: number; dy: number }> {
  const r = Math.max(0, Math.floor(pr));
  const cached = circleOffsetsCache.get(r);
  if (cached) return cached;
  const out: Array<{ dx: number; dy: number }> = [];
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) out.push({ dx, dy });
    }
  }
  circleOffsetsCache.set(r, out);
  return out;
}

export function terrainHitCircle(
  terrain: MaterialQuery,
  x: number,
  y: number,
  pr: number
): { hit: boolean; material: number } {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const offsets = circleOffsets(pr);
  for (const o of offsets) {
    const tx = px + o.dx;
    const ty = py + o.dy;
    if (tx < 0 || tx >= terrain.width || ty < 0 || ty >= terrain.height) continue;
    const mat = terrain.getMaterial(tx, ty);
    if (mat > 0) return { hit: true, material: mat };
  }
  return { hit: false, material: 0 };
}

function estimateNormal(terrain: MaterialQuery, x: number, y: number): Vec2 {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  const get = (xx: number, yy: number) => {
    if (xx < 0 || xx >= terrain.width || yy < 0 || yy >= terrain.height) return 0;
    return terrain.getMaterial(xx, yy) > 0 ? 1 : 0;
  };
  const l = get(sx - 2, sy);
  const r = get(sx + 2, sy);
  const u = get(sx, sy - 2);
  const d = get(sx, sy + 2);
  const gx = r - l;
  const gy = d - u;
  let nx = -gx;
  let ny = -gy;
  const n = Math.hypot(nx, ny);
  if (n < 1e-6) return { x: 0, y: -1 };
  nx /= n;
  ny /= n;
  return { x: nx, y: ny };
}

function simulateProjectile(
  terrain: MaterialQuery,
  params: ProjectileParams,
  target: Vec2,
  targetRadius: number
): TrajectoryResult {
  let x = params.start.x;
  let y = params.start.y;
  let vx = params.velocity.x;
  let vy = params.velocity.y;
  let minD = Infinity;
  let hitTarget = false;
  let hitTerrain = false;
  const stepsOuter = Math.max(1, Math.floor(params.maxTime / params.dt));
  const pr = Math.max(1, Math.floor(params.radius * 0.8));

  for (let i = 0; i < stepsOuter; i++) {
    vy += params.gravity * params.dt;
    if (params.wind) vx += params.wind * params.dt * params.windMultiplier;
    const nx = x + vx * params.dt;
    const ny = y + vy * params.dt;
    const segDist = Math.hypot(nx - x, ny - y);
    const sub = Math.max(1, Math.ceil(segDist));
    let hitX = nx;
    let hitY = ny;

    for (let s = 1; s <= sub; s++) {
      const t = s / sub;
      const cx = x + (nx - x) * t;
      const cy = y + (ny - y) * t;
      const dist = Math.hypot(cx - target.x, cy - target.y);
      if (dist < minD) minD = dist;
      if (dist <= targetRadius + params.radius) {
        hitTarget = true;
        hitX = cx;
        hitY = cy;
        break;
      }

      const px = Math.floor(cx);
      const py = Math.floor(cy);
      if (px < 0 || px >= terrain.width || py >= terrain.height) {
        hitX = cx;
        hitY = cy;
        break;
      }

      if (py >= 0) {
        const hit = terrainHitCircle(terrain, cx, cy, pr);
        if (hit.hit) {
          hitTerrain = true;
          hitX = cx;
          hitY = cy;
          break;
        }
      }
    }

    x = hitX;
    y = hitY;
    if (hitTarget || hitTerrain || x < 0 || x >= terrain.width || y >= terrain.height) break;
  }

  return { hitTerrain, end: { x, y }, minDistToTarget: minD, hitTarget };
}

function simulateGrenade(
  terrain: MaterialQuery,
  params: ProjectileParams,
  target: Vec2,
  targetRadius: number
): TrajectoryResult {
  const g = params.grenade!;
  let x = params.start.x;
  let y = params.start.y;
  let vx = params.velocity.x;
  let vy = params.velocity.y;
  let minD = Infinity;
  let hitTarget = false;
  let hitTerrain = false;
  let resting = false;
  const stepsOuter = Math.max(1, Math.floor(g.fuseSeconds / params.dt));
  const fric = Math.max(0, Math.min(2, g.friction));
  const rest = Math.max(0, Math.min(0.85, g.restitution));
  const pr = Math.max(1, Math.floor(params.radius * 0.8));

  for (let i = 0; i < stepsOuter; i++) {
    if (!resting) {
      vy += params.gravity * params.dt;
      if (params.wind) vx += params.wind * params.dt * params.windMultiplier;
    }

    const nx = x + vx * params.dt;
    const ny = y + vy * params.dt;
    const segDist = Math.hypot(nx - x, ny - y);
    const sub = Math.max(1, Math.ceil(segDist));
    let hitX = nx;
    let hitY = ny;
    let collided = false;

    for (let s = 1; s <= sub; s++) {
      const t = s / sub;
      const cx = x + (nx - x) * t;
      const cy = y + (ny - y) * t;

      const dist = Math.hypot(cx - target.x, cy - target.y);
      if (dist < minD) minD = dist;
      if (dist <= targetRadius + params.radius) hitTarget = true;

      const px = Math.floor(cx);
      const py = Math.floor(cy);
      if (px < 0 || px >= terrain.width || py >= terrain.height) {
        hitX = cx;
        hitY = cy;
        collided = true;
        break;
      }

      if (!resting && py >= 0) {
        const hit = terrainHitCircle(terrain, cx, cy, pr);
        if (hit.hit) {
          hitTerrain = true;
          hitX = cx;
          hitY = cy;
          collided = true;
          break;
        }
      }
    }

    x = hitX;
    y = hitY;

    if (collided && !resting && y >= 0) {
      const nrm = estimateNormal(terrain, x, y);
      const vDot = vx * nrm.x + vy * nrm.y;
      const vnx = nrm.x * vDot;
      const vny = nrm.y * vDot;
      const vtx = vx - vnx;
      const vty = vy - vny;
      const nextVnX = -vnx * rest;
      const nextVnY = -vny * rest;
      const tanDamp = Math.max(0, 1 - fric * 0.18);
      const nextVtX = vtx * tanDamp;
      const nextVtY = vty * tanDamp;
      vx = nextVnX + nextVtX;
      vy = nextVnY + nextVtY;
      const speed = Math.hypot(vx, vy);
      if (speed <= g.stopSpeed) {
        vx = 0;
        vy = 0;
        resting = true;
      }
      x = x + vx * params.dt * 0.25;
      y = y + vy * params.dt * 0.25;
    }
  }

  return { hitTerrain, end: { x, y }, minDistToTarget: minD, hitTarget };
}

export function simulateTrajectory(
  terrain: MaterialQuery,
  params: ProjectileParams,
  target: Vec2,
  targetRadius: number
): TrajectoryResult {
  if (params.mode === 'grenade' && params.grenade) {
    return simulateGrenade(terrain, params, target, targetRadius);
  }
  return simulateProjectile(terrain, params, target, targetRadius);
}

