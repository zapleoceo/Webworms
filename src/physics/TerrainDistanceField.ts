import type { Landscape } from '../models/Landscape';

type TileKey = string;

type Tile = {
  x0: number;
  y0: number;
  w: number;
  h: number;
  distToSolid: Float32Array;
  distToAir: Float32Array;
};

class MinHeap {
  private d: Float32Array;
  private i: Int32Array;
  private n: number = 0;

  constructor(capacity: number) {
    this.d = new Float32Array(Math.max(16, capacity));
    this.i = new Int32Array(Math.max(16, capacity));
  }

  public get size(): number {
    return this.n;
  }

  public push(idx: number, dist: number): void {
    if (this.n >= this.d.length) {
      const nd = new Float32Array(this.d.length * 2);
      nd.set(this.d);
      this.d = nd;
      const ni = new Int32Array(this.i.length * 2);
      ni.set(this.i);
      this.i = ni;
    }
    let k = this.n++;
    this.d[k] = dist;
    this.i[k] = idx;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.d[p] <= dist) break;
      this.d[k] = this.d[p];
      this.i[k] = this.i[p];
      k = p;
    }
    this.d[k] = dist;
    this.i[k] = idx;
  }

  public pop(): { idx: number; dist: number } | null {
    if (this.n <= 0) return null;
    const outIdx = this.i[0];
    const outDist = this.d[0];
    const last = --this.n;
    const lastIdx = this.i[last];
    const lastDist = this.d[last];
    if (last === 0) return { idx: outIdx, dist: outDist };

    let k = 0;
    while (true) {
      const l = k * 2 + 1;
      const r = l + 1;
      if (l >= last) break;
      let m = l;
      if (r < last && this.d[r] < this.d[l]) m = r;
      if (this.d[m] >= lastDist) break;
      this.d[k] = this.d[m];
      this.i[k] = this.i[m];
      k = m;
    }
    this.d[k] = lastDist;
    this.i[k] = lastIdx;
    return { idx: outIdx, dist: outDist };
  }
}

export class TerrainDistanceField {
  private landscape: Landscape;
  private tileSize: number;
  private cap: number;
  private tiles: Map<TileKey, Tile> = new Map();
  private lastEventIndex: number = 0;

  constructor(landscape: Landscape, tileSize: number = 64, cap: number = 96) {
    this.landscape = landscape;
    this.tileSize = Math.max(16, Math.floor(tileSize));
    this.cap = Math.max(16, Math.floor(cap));
  }

  public setLandscape(landscape: Landscape): void {
    this.landscape = landscape;
    this.tiles.clear();
    this.lastEventIndex = 0;
  }

  private key(tx: number, ty: number): TileKey {
    return `${tx},${ty}`;
  }

  private clampInt(v: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, v));
  }

  private computeTile(tx: number, ty: number): Tile {
    const w = this.landscape.width;
    const h = this.landscape.height;

    const x0 = tx * this.tileSize;
    const y0 = ty * this.tileSize;
    const x1 = Math.min(w, x0 + this.tileSize);
    const y1 = Math.min(h, y0 + this.tileSize);

    const extX0 = this.clampInt(x0 - this.cap, 0, w - 1);
    const extY0 = this.clampInt(y0 - this.cap, 0, h - 1);
    const extX1 = this.clampInt(x1 + this.cap, 0, w);
    const extY1 = this.clampInt(y1 + this.cap, 0, h);

    const extW = Math.max(1, extX1 - extX0);
    const extH = Math.max(1, extY1 - extY0);
    const extN = extW * extH;

    const INF = 1e9;
    const distSolid = new Float32Array(extN);
    const distAir = new Float32Array(extN);
    distSolid.fill(INF);
    distAir.fill(INF);

    const heapSolid = new MinHeap(Math.min(extN, 4096));
    const heapAir = new MinHeap(Math.min(extN, 4096));

    for (let yy = 0; yy < extH; yy++) {
      const gy = extY0 + yy;
      const row = yy * extW;
      for (let xx = 0; xx < extW; xx++) {
        const gx = extX0 + xx;
        const idx = row + xx;
        const solid = this.landscape.getMaterial(gx, gy) > 0;
        if (solid) {
          distSolid[idx] = 0;
          heapSolid.push(idx, 0);
        } else {
          distAir[idx] = 0;
          heapAir.push(idx, 0);
        }
      }
    }

    const SQRT2 = 1.41421356237;
    const relax = (heap: MinHeap, dist: Float32Array) => {
      while (heap.size > 0) {
        const cur = heap.pop();
        if (!cur) break;
        const cd = cur.dist;
        const idx = cur.idx;
        if (cd !== dist[idx]) continue;
        if (cd > this.cap) continue;

        const x = idx % extW;
        const y = (idx / extW) | 0;

        const tryN = (nx: number, ny: number, w: number) => {
          const xx = x + nx;
          const yy = y + ny;
          if (xx < 0 || yy < 0 || xx >= extW || yy >= extH) return;
          const nidx = yy * extW + xx;
          const nd = cd + w;
          if (nd < dist[nidx] && nd <= this.cap) {
            dist[nidx] = nd;
            heap.push(nidx, nd);
          }
        };

        tryN(1, 0, 1);
        tryN(-1, 0, 1);
        tryN(0, 1, 1);
        tryN(0, -1, 1);
        tryN(1, 1, SQRT2);
        tryN(1, -1, SQRT2);
        tryN(-1, 1, SQRT2);
        tryN(-1, -1, SQRT2);
      }
    };

    relax(heapSolid, distSolid);
    relax(heapAir, distAir);

    const tileW = x1 - x0;
    const tileH = y1 - y0;
    const tileN = tileW * tileH;
    const outSolid = new Float32Array(tileN);
    const outAir = new Float32Array(tileN);

    for (let yy = 0; yy < tileH; yy++) {
      const gy = y0 + yy;
      const srcY = gy - extY0;
      const dstRow = yy * tileW;
      const srcRow = srcY * extW;
      for (let xx = 0; xx < tileW; xx++) {
        const gx = x0 + xx;
        const srcX = gx - extX0;
        const sidx = srcRow + srcX;
        const didx = dstRow + xx;
        outSolid[didx] = distSolid[sidx];
        outAir[didx] = distAir[sidx];
      }
    }

    return {
      x0,
      y0,
      w: tileW,
      h: tileH,
      distToSolid: outSolid,
      distToAir: outAir
    };
  }

  private applyLandscapeDfEvents(): void {
    const events = (this.landscape as any).dfEvents as Array<{ kind: 'reset' | 'crater'; x?: number; y?: number; r?: number }> | undefined;
    if (!events || events.length <= this.lastEventIndex) return;

    for (let i = this.lastEventIndex; i < events.length; i++) {
      const ev = events[i];
      if (!ev) continue;
      if (ev.kind === 'reset') {
        this.tiles.clear();
        continue;
      }
      if (ev.kind === 'crater' && typeof ev.x === 'number' && typeof ev.y === 'number' && typeof ev.r === 'number') {
        const pad = this.cap + 2;
        const minX = Math.floor(ev.x - ev.r - pad);
        const maxX = Math.ceil(ev.x + ev.r + pad);
        const minY = Math.floor(ev.y - ev.r - pad);
        const maxY = Math.ceil(ev.y + ev.r + pad);

        const tx0 = (minX / this.tileSize) | 0;
        const tx1 = (maxX / this.tileSize) | 0;
        const ty0 = (minY / this.tileSize) | 0;
        const ty1 = (maxY / this.tileSize) | 0;

        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            this.tiles.delete(this.key(tx, ty));
          }
        }
      }
    }

    this.lastEventIndex = events.length;
  }

  private getTileFor(ix: number, iy: number): Tile | null {
    this.applyLandscapeDfEvents();
    const w = this.landscape.width;
    const h = this.landscape.height;
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null;

    const tx = (ix / this.tileSize) | 0;
    const ty = (iy / this.tileSize) | 0;
    const k = this.key(tx, ty);
    const cached = this.tiles.get(k);
    if (cached) return cached;
    const tile = this.computeTile(tx, ty);
    this.tiles.set(k, tile);
    return tile;
  }

  private getCellSignedDistance(ix: number, iy: number): number {
    const tile = this.getTileFor(ix, iy);
    if (!tile) return -this.cap;
    const solid = this.landscape.getMaterial(ix, iy) > 0;
    const lx = ix - tile.x0;
    const ly = iy - tile.y0;
    const idx = ly * tile.w + lx;
    if (idx < 0 || idx >= tile.distToSolid.length) return -this.cap;
    return solid ? -tile.distToAir[idx] : tile.distToSolid[idx];
  }

  public signedDistance(x: number, y: number): number {
    const ix0 = Math.floor(x);
    const iy0 = Math.floor(y);
    const fx = x - ix0;
    const fy = y - iy0;

    const s00 = this.getCellSignedDistance(ix0, iy0);
    const s10 = this.getCellSignedDistance(ix0 + 1, iy0);
    const s01 = this.getCellSignedDistance(ix0, iy0 + 1);
    const s11 = this.getCellSignedDistance(ix0 + 1, iy0 + 1);

    const a = s00 + (s10 - s00) * fx;
    const b = s01 + (s11 - s01) * fx;
    return a + (b - a) * fy;
  }

  public normal(x: number, y: number): { nx: number; ny: number } {
    const sL = this.signedDistance(x - 1, y);
    const sR = this.signedDistance(x + 1, y);
    const sU = this.signedDistance(x, y - 1);
    const sD = this.signedDistance(x, y + 1);
    let nx = sL - sR;
    let ny = sU - sD;
    const n = Math.hypot(nx, ny);
    if (!Number.isFinite(n) || n < 1e-6) return { nx: 0, ny: -1 };
    nx /= n;
    ny /= n;
    return { nx, ny };
  }
}
