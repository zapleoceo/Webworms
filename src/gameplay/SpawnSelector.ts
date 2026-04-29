import type { Landscape } from '../models/Landscape';
import { mulberry32, hashStringToSeed } from '../utils/SeededRng';

export function findSafeWormSpawn(
  landscape: Landscape,
  seed: number,
  salt: string,
  existing: { x: number; y: number }[],
  minDistance: number
): { x: number; y: number } {
  const rng = mulberry32((seed ^ hashStringToSeed(salt)) >>> 0);
  const maxAttempts = 200;
  const hw = 8;
  const hh = 14;
  const clearance = 4;

  const isAirBox = (cx: number, cy: number): boolean => {
    const left = Math.floor(cx - hw - clearance);
    const right = Math.floor(cx + hw + clearance);
    const top = Math.floor(cy - hh - clearance);
    const bottom = Math.floor(cy + hh + clearance);
    for (let y = top; y <= bottom; y += 2) {
      for (let x = left; x <= right; x += 2) {
        if (landscape.getMaterial(x, y) > 0) return false;
      }
    }
    return true;
  };

  for (let i = 0; i < maxAttempts; i++) {
    const x = 80 + rng() * (landscape.width - 160);
    const surfaceY = landscape.getTopSolidY(x);
    const spawnY = surfaceY - hh - 1;
    if (spawnY < 40 || spawnY > landscape.height - 40) continue;

    if (!isAirBox(x, spawnY)) continue;

    const yL = landscape.getTopSolidY(x - 14);
    const yR = landscape.getTopSolidY(x + 14);
    if (Math.abs(yR - yL) > 50) continue;

    let tooClose = false;
    for (const p of existing) {
      const dx = p.x - x;
      const dy = p.y - spawnY;
      if (Math.hypot(dx, dy) < minDistance) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    return { x, y: spawnY };
  }

  const x = landscape.width / 2;
  const y = landscape.getTopSolidY(x) - hh - 1;
  return { x, y: Math.max(40, y) };
}
