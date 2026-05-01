import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SRC = path.resolve(process.cwd(), 'allsrites.png');
const OUT_DIR = path.resolve(process.cwd(), 'public/sprites/custom_weapons');
const FRAMES_DIR = path.join(OUT_DIR, 'frames');
const ATLAS_PATH = path.join(OUT_DIR, 'atlas.json');

const alphaThr = 20;
const rowCountThr = 180;
const colCountThr = 18;
const mergeGap = 8;
const pad = 1;

const expectedColsByRow = {
  1: 7,
  2: 6,
  3: 8,
  4: 7,
  5: 7,
  6: 5,
  7: 8,
  8: 8,
  9: 6
};

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function alphaAt(data, w, x, y) {
  return data[(y * w + x) * 4 + 3];
}

function findRunsOverThreshold(arr, thr) {
  const runs = [];
  let on = false;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] > thr;
    if (v && !on) {
      on = true;
      s = i;
    } else if (!v && on) {
      on = false;
      runs.push([s, i - 1]);
    }
  }
  if (on) runs.push([s, arr.length - 1]);
  return runs;
}

function mergeRuns(runs, gap) {
  if (runs.length === 0) return [];
  const out = [runs[0].slice()];
  for (let i = 1; i < runs.length; i++) {
    const prev = out[out.length - 1];
    const cur = runs[i];
    if (cur[0] - prev[1] <= gap) {
      prev[1] = cur[1];
    } else {
      out.push(cur.slice());
    }
  }
  return out;
}

function mergeToCount(runs, wantCount) {
  const out = runs.map(r => r.slice());
  while (out.length > wantCount) {
    let bestI = -1;
    let bestGap = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const gap = out[i + 1][0] - out[i][1];
      if (gap < bestGap) {
        bestGap = gap;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    out[bestI][1] = out[bestI + 1][1];
    out.splice(bestI + 1, 1);
  }
  return out;
}

function splitWidestByValley(runs, colCounts, wantCount, splitThr) {
  const out = runs.map(r => r.slice());
  const pickSplit = (x0, x1) => {
    const mid = (x0 + x1) * 0.5;
    let bestX = -1;
    let bestScore = Infinity;
    for (let x = x0 + 6; x <= x1 - 6; x++) {
      const v = colCounts[x];
      if (v > splitThr) continue;
      const score = v + Math.abs(x - mid) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    return bestX;
  };
  while (out.length < wantCount) {
    let idx = -1;
    let bestW = -1;
    for (let i = 0; i < out.length; i++) {
      const w = out[i][1] - out[i][0] + 1;
      if (w > bestW) {
        bestW = w;
        idx = i;
      }
    }
    if (idx < 0) break;
    const [x0, x1] = out[idx];
    const cut = pickSplit(x0, x1);
    if (cut < 0) break;
    const left = [x0, cut - 1];
    const right = [cut + 1, x1];
    if (left[1] - left[0] < 6 || right[1] - right[0] < 6) break;
    out.splice(idx, 1, left, right);
  }
  return out;
}

function tightBBox(png, x0, y0, x1, y1, thr) {
  const { width: w, height: h, data } = png;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (alphaAt(data, w, x, y) > thr) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: clamp(minX - pad, 0, w - 1),
    y: clamp(minY - pad, 0, h - 1),
    w: clamp(maxX - minX + 1 + pad * 2, 1, w),
    h: clamp(maxY - minY + 1 + pad * 2, 1, h)
  };
}

function cropToPng(png, box) {
  const out = new PNG({ width: box.w, height: box.h });
  PNG.bitblt(png, out, box.x, box.y, box.w, box.h, 0, 0);
  return out;
}

function main() {
  ensureDir(OUT_DIR);
  ensureDir(FRAMES_DIR);
  const srcBuf = fs.readFileSync(SRC);
  const png = PNG.sync.read(srcBuf);
  const { width: w, height: h, data } = png;

  const rowCounts = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) {
      if (alphaAt(data, w, x, y) > alphaThr) c++;
    }
    rowCounts[y] = c;
  }

  let rowRuns = findRunsOverThreshold(rowCounts, rowCountThr);
  rowRuns = mergeRuns(rowRuns, mergeGap);
  if (rowRuns.length === 0) throw new Error('no rows detected');

  const rows = [];
  for (let r = 0; r < rowRuns.length; r++) {
    const [ry0, ry1] = rowRuns[r];
    const colCounts = new Array(w).fill(0);
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let y = ry0; y <= ry1; y++) {
        if (alphaAt(data, w, x, y) > alphaThr) c++;
      }
      colCounts[x] = c;
    }
    let colRuns = findRunsOverThreshold(colCounts, colCountThr);
    colRuns = mergeRuns(colRuns, mergeGap);

    const wantCols = expectedColsByRow[r + 1];
    if (typeof wantCols === 'number' && wantCols > 0) {
      if (colRuns.length > wantCols) {
        colRuns = mergeToCount(colRuns, wantCols);
      } else if (colRuns.length < wantCols) {
        colRuns = splitWidestByValley(colRuns, colCounts, wantCols, Math.max(1, colCountThr + 12));
      }
    }
    const frames = [];
    for (let c = 0; c < colRuns.length; c++) {
      const [cx0, cx1] = colRuns[c];
      const bbox = tightBBox(png, cx0, ry0, cx1, ry1, alphaThr);
      if (!bbox) continue;
      const key = `row${r + 1}_col${c}`;
      const framePath = `sprites/custom_weapons/frames/${key}.png`;
      const outPng = cropToPng(png, bbox);
      fs.writeFileSync(path.join(process.cwd(), 'public', framePath), PNG.sync.write(outPng));
      frames.push({ key, framePath: '/' + framePath.replaceAll('\\\\', '/'), ...bbox });
    }
    rows.push({ row: r + 1, y0: ry0, y1: ry1, frames });
  }

  fs.writeFileSync(ATLAS_PATH, JSON.stringify({ src: '/allsrites.png', alphaThr, rows }, null, 2));
  console.log('rows', rows.length);
  for (const r of rows) {
    console.log('row', r.row, 'frames', r.frames.length);
  }
}

main();
