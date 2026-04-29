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

  const isFarEnough = (x: number, y: number): boolean => {
    for (const p of existing) {
      if (Math.hypot(p.x - x, p.y - y) < minDistance) return false;
    }
    return true;
  };

  const candidates = (landscape as any).spawnCandidates as Array<{ x: number; y: number }> | undefined;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const attempts = Math.min(1200, candidates.length * 2);
    for (let i = 0; i < attempts; i++) {
      const idx = Math.floor(rng() * candidates.length);
      const c = candidates[idx];
      if (!c) continue;
      if (!isFarEnough(c.x, c.y)) continue;
      return { x: c.x, y: c.y };
    }
    for (let i = 0; i < attempts; i++) {
      const idx = Math.floor(rng() * candidates.length);
      const c = candidates[idx];
      if (!c) continue;
      return { x: c.x, y: c.y };
    }
  }

  const tryPoint = (x: number): { ok: boolean; x: number; y: number } => {
    const surfaceY = landscape.getTopSolidY(x);
    const spawnY = surfaceY - hh - clearance - 1;
    if (spawnY < 40 || spawnY > landscape.height - 40) return { ok: false, x, y: spawnY };
    if (!isAirBox(x, spawnY)) return { ok: false, x, y: spawnY };
    const yL = landscape.getTopSolidY(x - 14);
    const yR = landscape.getTopSolidY(x + 14);
    if (Math.abs(yR - yL) > 50) return { ok: false, x, y: spawnY };
    if (!isFarEnough(x, spawnY)) return { ok: false, x, y: spawnY };
    return { ok: true, x, y: spawnY };
  };

  const centerX = 80 + rng() * (landscape.width - 160);
  for (let radius = 0; radius <= 520; radius += 24) {
    const samples = radius === 0 ? 1 : 16;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const x = centerX + Math.cos(a) * radius;
      if (x < 80 || x > landscape.width - 80) continue;
      const res = tryPoint(x);
      if (res.ok) return { x: res.x, y: res.y };
    }
  }

  for (let x = 80; x <= landscape.width - 80; x += 32) {
    const res = tryPoint(x);
    if (res.ok) return { x: res.x, y: res.y };
  }

  const fx = landscape.width / 2;
  const fy = landscape.getTopSolidY(fx) - hh - clearance - 1;
  return { x: fx, y: Math.max(40, fy) };
}
