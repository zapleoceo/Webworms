import {
  simulateTrajectory as simulateTrajectoryShared,
  type MaterialQuery,
  type ProjectileParams,
  type TrajectoryResult,
  terrainHitCircle,
  type Vec2
} from '../physics/TrajectorySim';

export type TerrainQuery = {
  isSolid(x: number, y: number): boolean;
  width: number;
  height: number;
};

export type TrajectoryParams = ProjectileParams;
export type { TrajectoryResult, Vec2 };

export function simulateTrajectory(
  terrain: TerrainQuery,
  params: TrajectoryParams,
  target: Vec2,
  targetRadius: number
): TrajectoryResult {
  const matTerrain: MaterialQuery = {
    width: terrain.width,
    height: terrain.height,
    getMaterial: (x: number, y: number) => (terrain.isSolid(x, y) ? 1 : 0)
  };
  return simulateTrajectoryShared(matTerrain, params, target, targetRadius);
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

export function resolveProjectileStart(
  terrain: TerrainQuery,
  shooter: { x: number; y: number; height: number },
  globalAngle: number,
  pr: number
): { start: Vec2; adjusted: 0 | 1; forcedOrigin: 0 | 1 } {
  const gunLength = 25;
  const originX = shooter.x;
  const originY = shooter.y - shooter.height / 2;
  const dirX = Math.cos(globalAngle);
  const dirY = Math.sin(globalAngle);
  let startX = originX + dirX * gunLength;
  let startY = originY + dirY * gunLength;

  const matTerrain: MaterialQuery = {
    width: terrain.width,
    height: terrain.height,
    getMaterial: (x: number, y: number) => (terrain.isSolid(x, y) ? 1 : 0)
  };

  if (terrainHitCircle(matTerrain, startX, startY, pr).hit) {
    for (let t = gunLength; t >= 0; t -= 1) {
      const cx = originX + dirX * t;
      const cy = originY + dirY * t;
      if (!terrainHitCircle(matTerrain, cx, cy, pr).hit) {
        return { start: { x: cx, y: cy }, adjusted: 1, forcedOrigin: 0 };
      }
    }
    return { start: { x: originX, y: originY }, adjusted: 1, forcedOrigin: 1 };
  }

  return { start: { x: startX, y: startY }, adjusted: 0, forcedOrigin: 0 };
}
