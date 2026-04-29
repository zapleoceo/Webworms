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
  const maxAttempts = 250;
  const hw = 8;
  const hh = 14;
  const clearance = 2;

  const isAreaAir = (cx: number, cy: number): boolean => {
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

  const hasGroundBelow = (cx: number, cy: number): number | null => {
    const x = Math.floor(cx);
    const start = Math.floor(cy + hh + 1);
    const end = Math.min(landscape.height - 20, start + 240);
    for (let y = start; y <= end; y++) {
      if (landscape.getMaterial(x, y) > 0) return y;
    }
    return null;
  };

  for (let i = 0; i < maxAttempts; i++) {
    const x = 60 + rng() * (landscape.width - 120);
    const y = 60 + rng() * (landscape.height - 200);
    if (!isAreaAir(x, y)) continue;
    const gy = hasGroundBelow(x, y);
    if (gy === null) continue;

    const spawnY = gy - hh - 1;
    if (!isAreaAir(x, spawnY)) continue;

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

  return { x: landscape.width / 2, y: 80 };
}

