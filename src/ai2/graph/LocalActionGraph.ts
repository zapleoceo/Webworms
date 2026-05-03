type TerrainQuery = { width: number; height: number; isSolid: (x: number, y: number) => boolean };

export type ActionGraphNodeV2 = {
  id: number;
  x: number;
  y: number;
  groundY: number;
  edgePenalty: number;
  coverL: number;
  coverR: number;
};

export type ActionGraphEdgeV2 = { to: number; kind: 'walk' | 'jump' | 'fall'; cost: number };

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export type SurfaceSamplerV2 = {
  surfaceYAt: (x: number, y0: number) => number | null;
  edgePenaltyAt: (x: number, groundY: number) => number;
  coverScore: (x: number, y: number, dir: -1 | 1) => number;
};

const surfaceYAt0 = (terrain: TerrainQuery, x: number, y0: number): number | null => {
  const w = terrain.width;
  const h = terrain.height;
  const px = clamp(Math.round(x), 0, w - 1);
  const start = clamp(Math.round(y0), 0, h - 1);
  for (let y = start; y < h; y++) if (terrain.isSolid(px, y)) return y;
  for (let y = 0; y < start; y++) if (terrain.isSolid(px, y)) return y;
  return null;
};

const edgePenaltyAt0 = (terrain: TerrainQuery, x: number, groundY: number): number => {
  const w = terrain.width;
  const borderMargin = 72;
  if (x < borderMargin || x > (w - borderMargin)) return 1200;
  const sampleDx = 38;
  const left = surfaceYAt0(terrain, x - sampleDx, groundY);
  const right = surfaceYAt0(terrain, x + sampleDx, groundY);
  if (left === null || right === null) return 1200;
  const dropL = left - groundY;
  const dropR = right - groundY;
  const maxDrop = Math.max(dropL, dropR);
  if (maxDrop <= 60) return 0;
  if (maxDrop >= 220) return 1200;
  if (maxDrop >= 120) return Math.min(1200, 240 + (maxDrop - 120) * 4.2);
  return Math.min(700, 80 + (maxDrop - 60) * 2.2);
};

const coverScore0 = (terrain: TerrainQuery, x: number, y: number, dir: -1 | 1): number => {
  const w = terrain.width;
  const h = terrain.height;
  let c = 0;
  const yy = clamp(Math.round(y), 0, h - 1);
  for (let i = 1; i <= 6; i++) {
    const xx = clamp(Math.round(x + dir * i * 16), 0, w - 1);
    if (terrain.isSolid(xx, yy)) c++;
  }
  return c;
};

export function buildLocalActionGraphV2(args: {
  terrain: TerrainQuery;
  shooterX: number;
  shooterY: number;
  wormH: number;
  minX: number;
  maxX: number;
  stepX?: number;
  sampler?: SurfaceSamplerV2;
}): { nodes: ActionGraphNodeV2[]; edges: ActionGraphEdgeV2[][]; startId: number } {
  const { terrain, shooterY } = args;
  const wormH = Number(args.wormH) || 10;
  const w = terrain.width;
  const h = terrain.height;
  const stepX = Math.max(24, Math.min(96, Number(args.stepX) || 56));
  const minX = clamp(args.minX, 0, w - 1);
  const maxX = clamp(args.maxX, 0, w - 1);
  const sampler: SurfaceSamplerV2 = args.sampler || {
    surfaceYAt: (x: number, y0: number) => surfaceYAt0(terrain, x, y0),
    edgePenaltyAt: (x: number, groundY: number) => edgePenaltyAt0(terrain, x, groundY),
    coverScore: (x: number, y: number, dir: -1 | 1) => coverScore0(terrain, x, y, dir)
  };

  const nodes: ActionGraphNodeV2[] = [];
  let id = 0;
  for (let x = minX; x <= maxX + 0.001; x += stepX) {
    const groundY = sampler.surfaceYAt(x, shooterY);
    if (groundY === null) continue;
    const y = clamp(groundY - wormH / 2 - 1, 25, h - 25);
    const edgePenalty = sampler.edgePenaltyAt(x, groundY);
    const coverL = sampler.coverScore(x, y - wormH * 0.2, -1);
    const coverR = sampler.coverScore(x, y - wormH * 0.2, 1);
    nodes.push({ id: id++, x, y, groundY, edgePenalty, coverL, coverR });
  }
  const edges: ActionGraphEdgeV2[][] = nodes.map(() => []);
  const addEdge = (a: number, b: number) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (!na || !nb) return;
    if (na.edgePenalty >= 900 || nb.edgePenalty >= 900) return;
    const dx = Math.abs(nb.x - na.x);
    const dy = nb.y - na.y;
    if (dx < 1) return;
    let kind: ActionGraphEdgeV2['kind'] | null = null;
    if (Math.abs(dy) <= 16) kind = 'walk';
    else if (dy > 0 && dy <= 88 && dx <= 160) kind = 'jump';
    else if (dy < 0 && -dy <= 160 && dx <= 220) kind = 'fall';
    if (!kind) return;
    const kindCost = kind === 'walk' ? 0 : (kind === 'jump' ? 0.35 : 0.15);
    const cost = 1.1 + dx / stepX + Math.abs(dy) / 110 + kindCost;
    edges[a].push({ to: b, kind, cost });
  };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length && (nodes[j].x - nodes[i].x) <= 220; j++) {
      addEdge(i, j);
      addEdge(j, i);
    }
  }
  let startId = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (Math.abs(nodes[i].x - args.shooterX) < Math.abs(nodes[startId].x - args.shooterX)) startId = i;
  }
  return { nodes, edges, startId };
}
