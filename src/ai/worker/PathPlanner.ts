export type TerrainQuery = { width: number; height: number; isSolid: (x: number, y: number) => boolean };

export type PathPrimitive = 'walk' | 'jump' | 'rope';

export type MovePath = {
  waypoints: Array<{ x: number; y: number }>;
  primitive: PathPrimitive;
};

type Node = { id: number; x: number; y: number; xi: number };

type Edge = { to: number; cost: number; kind: 'walk' | 'jump' | 'rope' };

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

function isSolidSafe(t: TerrainQuery, x: number, y: number): boolean {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (py < 0) return false;
  if (px < 0 || px >= t.width || py >= t.height) return true;
  return t.isSolid(px, py);
}

function surfaceYsInColumn(t: TerrainQuery, x: number, yMin: number, yMax: number, maxSurfaces: number, yRef: number): number[] {
  const px = Math.floor(x);
  if (px < 0 || px >= t.width) return [];
  const ys: number[] = [];
  const a = clamp(Math.floor(yMin), 1, t.height - 1);
  const b = clamp(Math.floor(yMax), 1, t.height - 1);
  for (let y = a; y <= b; y++) {
    if (t.isSolid(px, y) && !t.isSolid(px, y - 1)) ys.push(y);
  }
  ys.sort((u, v) => Math.abs(u - yRef) - Math.abs(v - yRef));
  return ys.slice(0, Math.max(0, maxSurfaces));
}

function isWormPosValid(t: TerrainQuery, x: number, y: number, w: number, h: number): boolean {
  const hw = Math.max(2, w / 2);
  const hh = Math.max(2, h / 2);
  const pts = [
    [0, 0],
    [-hw * 0.7, 0],
    [hw * 0.7, 0],
    [0, -hh * 0.75],
    [0, hh * 0.75]
  ];
  for (const [dx, dy] of pts) {
    if (isSolidSafe(t, x + dx, y + dy)) return false;
  }
  const footY = y + hh + 2;
  if (!isSolidSafe(t, x, footY)) return false;
  return true;
}

function isSegmentClear(t: TerrainQuery, a: { x: number; y: number }, b: { x: number; y: number }, h: number): boolean {
  const n = 6;
  const hh = Math.max(2, h / 2);
  for (let i = 1; i < n; i++) {
    const tt = i / n;
    const x = a.x + (b.x - a.x) * tt;
    const y = a.y + (b.y - a.y) * tt;
    if (isSolidSafe(t, x, y)) return false;
    if (isSolidSafe(t, x, y - hh * 0.6)) return false;
    if (isSolidSafe(t, x, y + hh * 0.6)) return false;
  }
  return true;
}

function isJumpArcClear(t: TerrainQuery, a: { x: number; y: number }, b: { x: number; y: number }, w: number, h: number): boolean {
  const dxAbs = Math.abs(b.x - a.x);
  const arc = 60 + dxAbs * 0.12;
  const n = 12;
  const hh = Math.max(2, h / 2);
  const hw = Math.max(2, w / 2);
  for (let i = 1; i < n; i++) {
    const tt = i / n;
    const x = a.x + (b.x - a.x) * tt;
    const yLin = a.y + (b.y - a.y) * tt;
    const y = yLin - arc * Math.sin(Math.PI * tt);
    if (isSolidSafe(t, x, y)) return false;
    if (isSolidSafe(t, x, y - hh * 0.7)) return false;
    if (isSolidSafe(t, x - hw * 0.6, y)) return false;
    if (isSolidSafe(t, x + hw * 0.6, y)) return false;
  }
  return true;
}

function hasRopeAnchor(t: TerrainQuery, at: { x: number; y: number }, h: number): boolean {
  const r = 210;
  for (let i = 0; i < 18; i++) {
    const ang = -Math.PI + (i / 17) * Math.PI;
    if (ang > -0.2) continue;
    const ax = at.x + Math.cos(ang) * r;
    const ay = at.y + Math.sin(ang) * r;
    if (ax < 0 || ay < 0 || ax >= t.width || ay >= t.height) continue;
    if (!isSolidSafe(t, ax, ay)) continue;
    if (isSegmentClear(t, at, { x: ax, y: ay }, h)) return true;
  }
  return false;
}

function buildGraph(
  t: TerrainQuery,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  step: number,
  wormW: number,
  wormH: number,
  allowRope: boolean
): { nodes: Node[]; edges: Edge[][]; startId: number; goalId: number } | null {
  const padX = 480;
  const padY = 320;
  const minX = clamp(Math.min(start.x, goal.x) - padX, 30, t.width - 30);
  const maxX = clamp(Math.max(start.x, goal.x) + padX, 30, t.width - 30);
  const minY = clamp(Math.min(start.y, goal.y) - padY, 0, t.height - 1);
  const maxY = clamp(Math.max(start.y, goal.y) + padY, 0, t.height - 1);

  const xiMin = Math.floor(minX / step);
  const xiMax = Math.ceil(maxX / step);

  const nodes: Node[] = [];
  const byXi: Map<number, number[]> = new Map();

  const addNode = (xi: number, x: number, y: number) => {
    const id = nodes.length;
    const n: Node = { id, xi, x, y };
    nodes.push(n);
    const arr = byXi.get(xi) || [];
    arr.push(id);
    byXi.set(xi, arr);
  };

  const yRef = start.y;
  for (let xi = xiMin; xi <= xiMax; xi++) {
    const x = xi * step;
    const surfaces = surfaceYsInColumn(t, x, minY, maxY, 3, yRef);
    for (const sy of surfaces) {
      const y = sy - wormH / 2 - 1;
      if (!isWormPosValid(t, x, y, wormW, wormH)) continue;
      addNode(xi, x, y);
    }
  }

  if (nodes.length < 2) return null;

  const closestNode = (p: { x: number; y: number }): number => {
    let best = 0;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = dist(n, p);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  };

  const startId = closestNode(start);
  const goalId = closestNode(goal);

  const edges: Edge[][] = Array.from({ length: nodes.length }, () => []);

  const candidatesAtXi = (xi: number): number[] => byXi.get(xi) || [];

  for (const n of nodes) {
    for (const dir of [-1, 1] as const) {
      const adj = candidatesAtXi(n.xi + dir);
      for (const toId of adj) {
        const m = nodes[toId];
        const dy = m.y - n.y;
        if (Math.abs(dy) > 26) continue;
        if (!isSegmentClear(t, n, m, wormH)) continue;
        edges[n.id].push({ to: toId, cost: 1 + Math.abs(dy) * 0.02, kind: 'walk' });
      }
    }

    for (const dir of [-1, 1] as const) {
      for (let k = 2; k <= 6; k++) {
        const cand = candidatesAtXi(n.xi + dir * k);
        for (const toId of cand) {
          const m = nodes[toId];
          const dx = Math.abs(m.x - n.x);
          const dy = m.y - n.y;
          if (dx < step * 2 - 0.01) continue;
          if (dx > step * 6 + 0.01) continue;
          if (dy > 88) continue;
          if (dy < -140) continue;
          if (!isJumpArcClear(t, n, m, wormW, wormH)) continue;
          edges[n.id].push({ to: toId, cost: 2.4 + dx * 0.01 + Math.max(0, dy) * 0.01, kind: 'jump' });
        }
      }
    }

    if (allowRope && hasRopeAnchor(t, n, wormH)) {
      for (const m of nodes) {
        if (m.id === n.id) continue;
        const d = dist(n, m);
        if (d > 290) continue;
        if (m.y > n.y - 28 && d < 140) continue;
        edges[n.id].push({ to: m.id, cost: 1.9 + d * 0.005, kind: 'rope' });
      }
    }
  }

  return { nodes, edges, startId, goalId };
}

export function findWaypointPath(
  t: TerrainQuery,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  wormW: number,
  wormH: number,
  step: number = 16,
  allowRope: boolean = true
): MovePath | null {
  const g = buildGraph(t, start, goal, step, wormW, wormH, allowRope);
  if (!g) return null;

  const { nodes, edges, startId, goalId } = g;
  const n = nodes.length;
  const gScore = new Array<number>(n).fill(Infinity);
  const fScore = new Array<number>(n).fill(Infinity);
  const cameFrom = new Array<number>(n).fill(-1);
  const cameKind = new Array<Edge['kind']>(n).fill('walk');
  const open: number[] = [];
  const inOpen = new Array<boolean>(n).fill(false);
  const closed = new Array<boolean>(n).fill(false);

  const goalPos = nodes[goalId];
  const h = (id: number) => dist(nodes[id], goalPos) / step;

  gScore[startId] = 0;
  fScore[startId] = h(startId);
  open.push(startId);
  inOpen[startId] = true;

  while (open.length) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestIdx]]) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];
    inOpen[current] = false;
    if (current === goalId) break;
    closed[current] = true;

    for (const e of edges[current]) {
      if (closed[e.to]) continue;
      const tentative = gScore[current] + e.cost;
      if (tentative + 1e-9 < gScore[e.to]) {
        cameFrom[e.to] = current;
        cameKind[e.to] = e.kind;
        gScore[e.to] = tentative;
        fScore[e.to] = tentative + h(e.to);
        if (!inOpen[e.to]) {
          open.push(e.to);
          inOpen[e.to] = true;
        }
      }
    }
  }

  if (cameFrom[goalId] === -1 && goalId !== startId) return null;

  const chain: number[] = [];
  let cur = goalId;
  chain.push(cur);
  while (cur !== startId && cameFrom[cur] !== -1) {
    cur = cameFrom[cur];
    chain.push(cur);
  }
  chain.reverse();

  const fullWaypoints = chain.map(id => ({ x: nodes[id].x, y: nodes[id].y }));
  const withoutStart = fullWaypoints.slice(1);
  if (withoutStart.length === 0) return { waypoints: [], primitive: 'walk' };

  const maxPts = 8;
  const stepPick = Math.max(1, Math.ceil(withoutStart.length / maxPts));
  const compact: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < withoutStart.length; i += stepPick) compact.push(withoutStart[i]);
  const last = withoutStart[withoutStart.length - 1];
  if (compact.length === 0 || dist(compact[compact.length - 1], last) > 1) compact.push(last);

  const firstId = chain.length >= 2 ? chain[1] : chain[0];
  const primitive: PathPrimitive = cameKind[firstId] === 'rope' ? 'rope' : cameKind[firstId] === 'jump' ? 'jump' : 'walk';

  return { waypoints: compact, primitive };
}
