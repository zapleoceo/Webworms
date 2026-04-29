export type Vec2 = { x: number; y: number };

export type TerrainQuery = {
  isSolid(x: number, y: number): boolean;
  width: number;
  height: number;
};

export interface TrajectoryParams {
  start: Vec2;
  velocity: Vec2;
  gravity: number;
  wind: number;
  windMultiplier: number;
  radius: number;
  dt: number;
  maxTime: number;
  mode?: 'projectile' | 'grenade';
  grenade?: {
    fuseSeconds: number;
    restitution: number;
    friction: number;
    stopSpeed: number;
  };
}

export interface TrajectoryResult {
  hitTerrain: boolean;
  end: Vec2;
  minDistToTarget: number;
  hitTarget: boolean;
}

export function simulateTrajectory(
  terrain: TerrainQuery,
  params: TrajectoryParams,
  target: Vec2,
  targetRadius: number
): TrajectoryResult {
  if (params.mode === 'grenade' && params.grenade) {
    return simulateGrenade(terrain, params, target, targetRadius);
  }

  let x = params.start.x;
  let y = params.start.y;
  let vx = params.velocity.x;
  let vy = params.velocity.y;

  let minD = Infinity;
  let hitTarget = false;
  let hitTerrain = false;

  const steps = Math.max(1, Math.floor(params.maxTime / params.dt));
  for (let i = 0; i < steps; i++) {
    vy += params.gravity * params.dt;
    if (params.wind) vx += params.wind * params.dt * params.windMultiplier;

    const nx = x + vx * params.dt;
    const ny = y + vy * params.dt;

    const dist = Math.hypot(nx - target.x, ny - target.y);
    if (dist < minD) minD = dist;
    if (dist <= targetRadius + params.radius) {
      hitTarget = true;
      x = nx;
      y = ny;
      break;
    }

    const px = Math.floor(nx);
    const py = Math.floor(ny);
    if (px < 0 || px >= terrain.width || py >= terrain.height) {
      x = nx;
      y = ny;
      break;
    }
    if (py >= 0 && terrain.isSolid(px, py)) {
      hitTerrain = true;
      x = nx;
      y = ny;
      break;
    }

    x = nx;
    y = ny;
  }

  return { hitTerrain, end: { x, y }, minDistToTarget: minD, hitTarget };
}

function isSolidSafe(terrain: TerrainQuery, x: number, y: number): boolean {
  if (x < 0 || x >= terrain.width || y < 0 || y >= terrain.height) return false;
  return terrain.isSolid(x, y);
}

function estimateNormal(terrain: TerrainQuery, x: number, y: number): Vec2 {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  const l = isSolidSafe(terrain, sx - 2, sy) ? 1 : 0;
  const r = isSolidSafe(terrain, sx + 2, sy) ? 1 : 0;
  const u = isSolidSafe(terrain, sx, sy - 2) ? 1 : 0;
  const d = isSolidSafe(terrain, sx, sy + 2) ? 1 : 0;
  const gx = r - l;
  const gy = d - u;
  let nx = -gx;
  let ny = -gy;
  const n = Math.hypot(nx, ny);
  if (n < 1e-6) {
    nx = 0;
    ny = -1;
  } else {
    nx /= n;
    ny /= n;
  }
  return { x: nx, y: ny };
}

function simulateGrenade(
  terrain: TerrainQuery,
  params: TrajectoryParams,
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

  const steps = Math.max(1, Math.floor(g.fuseSeconds / params.dt));
  const fric = Math.max(0, Math.min(2, g.friction));
  const rest = Math.max(0, Math.min(0.85, g.restitution));

  for (let i = 0; i < steps; i++) {
    if (!resting) {
      vy += params.gravity * params.dt;
      if (params.wind) vx += params.wind * params.dt * params.windMultiplier;
    }

    const nx = x + vx * params.dt;
    const ny = y + vy * params.dt;

    const dist = Math.hypot(nx - target.x, ny - target.y);
    if (dist < minD) minD = dist;
    if (dist <= targetRadius + params.radius) hitTarget = true;

    const px = Math.floor(nx);
    const py = Math.floor(ny);
    if (px < 0 || px >= terrain.width || py >= terrain.height) {
      x = nx;
      y = ny;
      break;
    }

    if (!resting && py >= 0 && terrain.isSolid(px, py)) {
      hitTerrain = true;
      const nrm = estimateNormal(terrain, nx, ny);
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
      continue;
    }

    x = nx;
    y = ny;
  }

  return { hitTerrain, end: { x, y }, minDistToTarget: minD, hitTarget };
}

export function gunMuzzlePosition(
  shooter: { x: number; y: number; height: number },
  globalAngle: number
): Vec2 {
  const gunLength = 25;
  return {
    x: shooter.x + Math.cos(globalAngle) * gunLength,
    y: (shooter.y - shooter.height / 2) + Math.sin(globalAngle) * gunLength
  };
}
