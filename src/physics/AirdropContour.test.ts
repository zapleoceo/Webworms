import { describe, expect, it } from 'vitest';
import { buildPerimeterContactPointsFromAlpha } from './AirdropContour';

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

describe('AirdropContour', () => {
  it('builds perimeter contact points from alpha mask', () => {
    const w = 64;
    const h = 64;
    const alpha = circleMask(w, h, 26);
    const pts = buildPerimeterContactPointsFromAlpha(alpha, w, h, 100, 100, 36, 64, 1);
    expect(pts).not.toBeNull();
    expect(pts!.length).toBeGreaterThanOrEqual(24);
    const maxAbsX = Math.max(...pts!.map(p => Math.abs(p.x)));
    const maxAbsY = Math.max(...pts!.map(p => Math.abs(p.y)));
    expect(maxAbsX).toBeGreaterThan(35);
    expect(maxAbsY).toBeGreaterThan(35);
  });
});

