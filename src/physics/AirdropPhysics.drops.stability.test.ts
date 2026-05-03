import { describe, expect, it } from 'vitest';
import { BrandLogo } from '../models/BrandLogo';
import { buildPerimeterContactPointsFromAlpha } from './AirdropContour';

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const circleMask = (w: number, h: number, r: number) => {
  const a = new Uint8ClampedArray(w * h);
  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      a[y * w + x] = d <= r ? 255 : 0;
    }
  }
  return a;
};

describe('AirdropPhysics (drops stability)', () => {
  it('settles 30 drops on a flat floor without NaNs', () => {
    const W = 1400;
    const floorY = 720;
    const landscape = {
      getMaterial: (_x: number, y: number) => (y >= floorY ? 1 : 0)
    } as any;

    const alpha = circleMask(64, 64, 26);
    const pts = buildPerimeterContactPointsFromAlpha(alpha, 64, 64, 100, 60, 36, 64, 1);
    expect(pts).not.toBeNull();

    const rng = seeded(12345);
    const logos: BrandLogo[] = [];
    const traceCounts: number[] = [];
    for (let i = 0; i < 30; i++) {
      const x = 80 + rng() * (W - 160);
      const y = 80 + rng() * 160;
      const vx = (rng() - 0.5) * 80;
      const vy = rng() * 20;
      const ang = (rng() - 0.5) * 0.6;
      const av = (rng() - 0.5) * 2.5;
      const l = new BrandLogo('test', x, y, vx, vy, ang, av);
      l.width = 100;
      l.height = 60;
      l.collisionWidth = 100;
      l.collisionHeight = 60;
      (l as any).customContactPointsLocal = pts;
      (l as any).customContactKey = 't';
      (l as any).customContactWantKey = 't';
      traceCounts.push(0);
      (l as any).onTrace = (e: any) => {
        if (e?.kind === 'airdrop_contact') traceCounts[i] += 1;
      };
      logos.push(l);
    }

    const gravity = 195;
    const dt = 1 / 60;
    for (let step = 0; step < 60 * 20; step++) {
      for (const l of logos) {
        l.update(dt, gravity, landscape, []);
        expect(Number.isFinite(l.x)).toBe(true);
        expect(Number.isFinite(l.y)).toBe(true);
        expect(Number.isFinite(l.vx)).toBe(true);
        expect(Number.isFinite(l.vy)).toBe(true);
        expect(Number.isFinite(l.angle)).toBe(true);
        expect(Number.isFinite(l.angularVelocity)).toBe(true);
      }
    }

    const dynamic = logos.filter(l => l.isDynamic);
    expect(dynamic.length).toBeLessThanOrEqual(2);

    const total = traceCounts.reduce((a, b) => a + b, 0);
    const max = traceCounts.reduce((a, b) => Math.max(a, b), 0);
    const avg = total / Math.max(1, traceCounts.length);
    console.log('[drops] airdrop_contact traces total=%d avg=%.2f max=%d', total, avg, max);
  }, 15000);
});
