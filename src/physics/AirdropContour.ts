type Vec = { x: number; y: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function buildPerimeterContactPointsFromAlpha(
  alpha: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  collisionW: number,
  collisionH: number,
  count: number,
  alphaThreshold: number,
  insetPx: number
): Vec[] | null {
  if (!alpha || w <= 1 || h <= 1) return null;

  const ok = (x: number, y: number): boolean => {
    const ix = Math.max(0, Math.min(w - 1, x));
    const iy = Math.max(0, Math.min(h - 1, y));
    return alpha[iy * w + ix] > alphaThreshold;
  };

  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  const maxR = Math.hypot(w, h) * 0.6 + 4;
  const samples = Math.max(count * 2, count);

  const pixPts: Array<{ x: number; y: number }> = [];
  const seenPix = new Set<string>();

  for (let i = 0; i < samples; i++) {
    const ang = (i / samples) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let found: { x: number; y: number } | null = null;
    for (let t = 0; t <= maxR; t += 1) {
      const px = cx + dx * t;
      const py = cy + dy * t;
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (ix < 0 || ix >= w || iy < 0 || iy >= h) break;
      if (ok(ix, iy)) found = { x: px, y: py };
    }
    if (!found) continue;
    const inset = Math.max(0, insetPx);
    const fx = clamp(found.x - dx * inset, 0, w - 1);
    const fy = clamp(found.y - dy * inset, 0, h - 1);
    const k = `${Math.round(fx)}:${Math.round(fy)}`;
    if (seenPix.has(k)) continue;
    seenPix.add(k);
    pixPts.push({ x: fx, y: fy });
  }

  if (pixPts.length < 6) return null;

  const pts = pixPts.map((p) => ({
    x: ((p.x / Math.max(1, w - 1)) - 0.5) * collisionW,
    y: ((p.y / Math.max(1, h - 1)) - 0.5) * collisionH
  }));

  if (pts.length <= count) return pts;
  const out: Vec[] = [];
  const step = pts.length / count;
  for (let i = 0; i < count; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

