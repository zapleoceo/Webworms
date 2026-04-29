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
