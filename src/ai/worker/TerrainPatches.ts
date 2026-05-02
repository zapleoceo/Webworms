export type TerrainDfEvent = { kind: 'reset' | 'crater'; x?: number; y?: number; r?: number };

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function applyCraterToGrid(grid: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number): void {
  const effectiveRadius = radius + 1.5;
  const r2 = effectiveRadius * effectiveRadius;
  const minX = Math.max(0, Math.floor(cx - effectiveRadius));
  const maxX = Math.min(width - 1, Math.ceil(cx + effectiveRadius));
  const minY = Math.max(0, Math.floor(cy - effectiveRadius));
  const maxY = Math.min(height - 1, Math.ceil(cy + effectiveRadius));

  for (let y = minY; y <= maxY; y++) {
    const row = y * width;
    for (let x = minX; x <= maxX; x++) {
      if (x < 30 || x >= width - 30 || y >= height - 30) continue;
      const idx = row + x;
      if (grid[idx] === 255) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) grid[idx] = 0;
    }
  }
}

export function applyDfEventsToGrid(
  grid: Uint8Array,
  width: number,
  height: number,
  events: TerrainDfEvent[]
): { ok: boolean; resetSeen: boolean } {
  let resetSeen = false;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.kind === 'reset') {
      resetSeen = true;
      continue;
    }
    if (ev.kind === 'crater') {
      const x = Number(ev.x);
      const y = Number(ev.y);
      const r = Number(ev.r);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) continue;
      const rr = clamp(r, 0, Math.max(width, height));
      applyCraterToGrid(grid, width, height, x, y, rr);
    }
  }
  return { ok: !resetSeen, resetSeen };
}

