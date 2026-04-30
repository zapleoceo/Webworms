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
  const border = 30;

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
      if (!landscape.isSpawnFree(c.x, c.y, hw, hh, clearance, border)) continue;
      return { x: c.x, y: c.y };
    }
    for (let i = 0; i < attempts; i++) {
      const idx = Math.floor(rng() * candidates.length);
      const c = candidates[idx];
      if (!c) continue;
      if (!landscape.isSpawnFree(c.x, c.y, hw, hh, clearance, border)) continue;
      return { x: c.x, y: c.y };
    }
  }

  const tryPoint = (x: number): { ok: boolean; x: number; y: number } => {
    const y = landscape.findSpawnYAtX(x, hw, hh, clearance, border);
    if (y === null) return { ok: false, x, y: 0 };
    if (!isFarEnough(x, y)) return { ok: false, x, y };
    return { ok: true, x, y };
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
  const fy = landscape.findSpawnYAtX(fx, hw, hh, clearance, border);
  if (fy !== null) return { x: fx, y: fy };
  const fallbackX0 = border + 80;
  const fallbackX1 = landscape.width - border - 80;
  for (let x = fallbackX0; x <= fallbackX1; x += 24) {
    const y = landscape.findSpawnYAtX(x, hw, hh, clearance, border);
    if (y !== null) return { x, y };
  }
  return { x: fx, y: border + hh + clearance + 2 };
}
