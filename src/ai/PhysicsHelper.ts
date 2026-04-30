import {
  simulateTrajectory as simulateTrajectoryShared,
  type MaterialQuery,
  type ProjectileParams,
  type TrajectoryResult,
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
