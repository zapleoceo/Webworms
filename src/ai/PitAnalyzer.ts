export type TerrainQuery = {
  width: number;
  height: number;
  isSolid: (x: number, y: number) => boolean;
};

export type PitInfo = {
  isTrapped: boolean;
  depthPx: number;
  widthPx: number;
  rimY: number | null;
  rimLeftX: number | null;
  rimRightX: number | null;
  escapeDir: 'left' | 'right' | 'both' | 'none';
  canJumpOut: boolean;
  canRopeOut: boolean;
  thinWallDir: 'left' | 'right' | 'none';
  attackVuln: number;
};

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const isSolidSafe = (t: TerrainQuery, x: number, y: number): boolean => {
  if (y < 0) return false;
  if (x < 0 || x >= t.width || y >= t.height) return true;
  return !!t.isSolid(x, y);
};

const findGroundY = (t: TerrainQuery, x: number, yStart: number, maxDown: number): number | null => {
  const xx = Math.floor(x);
  if (xx < 0 || xx >= t.width) return null;
  const y0 = Math.max(0, Math.min(t.height - 1, Math.floor(yStart)));
  const y1 = Math.min(t.height - 1, y0 + Math.max(1, Math.floor(maxDown)));
  for (let y = y0; y <= y1; y++) {
    if (isSolidSafe(t, xx, y)) return y;
  }
  return null;
};

const hasBodyClearance = (t: TerrainQuery, x: number, groundY: number, hw: number, hh: number): boolean => {
  const left = Math.floor(x - hw);
  const right = Math.floor(x + hw);
  const top = Math.floor((groundY - 1) - hh);
  const bottom = Math.floor(groundY - 1);
  for (let yy = top; yy <= bottom; yy++) {
    for (let xx = left; xx <= right; xx++) {
      if (isSolidSafe(t, xx, yy)) return false;
    }
  }
  return true;
};

const findNearestWallX = (t: TerrainQuery, x: number, y: number, dir: -1 | 1, maxDx: number): number | null => {
  const yy = Math.floor(y);
  const step = dir;
  const x0 = Math.floor(x);
  for (let d = 1; d <= maxDx; d++) {
    const xx = x0 + step * d;
    if (xx < 0 || xx >= t.width) return xx;
    if (isSolidSafe(t, xx, yy)) return xx;
  }
  return null;
};

const estimateWallThickness = (t: TerrainQuery, wallX: number | null, y: number, dirOut: -1 | 1, maxScan: number): number | null => {
  if (wallX === null) return null;
  const yy = Math.floor(y);
  let solidCount = 0;
  for (let d = 0; d <= maxScan; d++) {
    const xx = wallX + dirOut * d;
    if (xx < 0 || xx >= t.width) return solidCount;
    if (isSolidSafe(t, xx, yy)) solidCount += 1;
    else return solidCount;
  }
  return solidCount;
};

const anyRopeAnchorAbove = (t: TerrainQuery, x: number, yHead: number, rimY: number, maxDist: number): boolean => {
  const angles = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI * 0.42, Math.PI * 0.55, Math.PI * 0.62];
  const step = 4;
  for (const a0 of angles) {
    const globals = [-a0, Math.PI - a0];
    for (const a of globals) {
      for (let d = 16; d <= maxDist; d += step) {
        const xx = x + Math.cos(a) * d;
        const yy = yHead + Math.sin(a) * d;
        if (xx <= 30 || xx >= t.width - 30 || yy <= 0 || yy >= t.height - 30) break;
        if (isSolidSafe(t, Math.floor(xx), Math.floor(yy))) {
          if (yy < rimY - 10) return true;
          break;
        }
      }
    }
  }
  return false;
};

export function analyzePit(
  terrain: TerrainQuery,
  worm: { x: number; y: number; width: number; height: number; ropeRemaining?: number }
): PitInfo {
  const hw = Math.max(4, (Number(worm.width) || 10) / 2);
  const hh = Math.max(6, (Number(worm.height) || 10) / 2);
  const x = Number(worm.x) || 0;
  const y = Number(worm.y) || 0;
  const yFoot = y + hh + 2;
  const yMid = y;
  const yHead = y - hh;

  const curGround = findGroundY(terrain, x, yFoot, 280);
  if (curGround === null) {
    return { isTrapped: false, depthPx: 0, widthPx: 0, rimY: null, rimLeftX: null, rimRightX: null, escapeDir: 'none', canJumpOut: false, canRopeOut: false, thinWallDir: 'none', attackVuln: 0 };
  }

  const maxDxWall = 80;
  const wallL = findNearestWallX(terrain, x, yMid, -1, maxDxWall);
  const wallR = findNearestWallX(terrain, x, yMid, 1, maxDxWall);
  const widthPx = (wallL !== null && wallR !== null) ? Math.max(0, wallR - wallL) : 999;

  const scanX = 260;
  const stepX = 6;
  let rimLeft: { x: number; groundY: number } | null = null;
  let rimRight: { x: number; groundY: number } | null = null;

  for (let dx = 18; dx <= scanX; dx += stepX) {
    const xxL = x - dx;
    const gL = findGroundY(terrain, xxL, yFoot, 320);
    if (gL !== null && gL < curGround - 18 && hasBodyClearance(terrain, xxL, gL, hw, hh)) {
      rimLeft = { x: xxL, groundY: gL };
      break;
    }
  }
  for (let dx = 18; dx <= scanX; dx += stepX) {
    const xxR = x + dx;
    const gR = findGroundY(terrain, xxR, yFoot, 320);
    if (gR !== null && gR < curGround - 18 && hasBodyClearance(terrain, xxR, gR, hw, hh)) {
      rimRight = { x: xxR, groundY: gR };
      break;
    }
  }

  let rimY: number | null = null;
  if (rimLeft && rimRight) rimY = Math.min(rimLeft.groundY, rimRight.groundY);
  else if (rimLeft) rimY = rimLeft.groundY;
  else if (rimRight) rimY = rimRight.groundY;

  const depthPx = rimY !== null ? Math.max(0, curGround - rimY) : 0;
  const escapeDir: PitInfo['escapeDir'] = rimLeft && rimRight ? 'both' : rimLeft ? 'left' : rimRight ? 'right' : 'none';

  const ceilingBlocked = (() => {
    for (let dy = 6; dy <= 34; dy += 7) {
      const yy = Math.floor(yHead - dy);
      if (isSolidSafe(terrain, Math.floor(x), yy)) return true;
    }
    return false;
  })();

  const canJumpOut = !ceilingBlocked && rimY !== null && depthPx <= 120;
  const ropeRemaining = Number(worm.ropeRemaining) || 0;
  const canRopeOut = ropeRemaining > 0 && rimY !== null && anyRopeAnchorAbove(terrain, x, yHead, rimY, 260);

  const thickL = estimateWallThickness(terrain, wallL, yMid, -1, 120);
  const thickR = estimateWallThickness(terrain, wallR, yMid, 1, 120);
  let thinWallDir: PitInfo['thinWallDir'] = 'none';
  if (typeof thickL === 'number' && typeof thickR === 'number') thinWallDir = thickL <= thickR ? 'left' : 'right';
  else if (typeof thickL === 'number') thinWallDir = 'left';
  else if (typeof thickR === 'number') thinWallDir = 'right';

  const deepEnough = depthPx >= 44;
  const narrowEnough = widthPx <= 34;
  const noEscape = escapeDir === 'none';
  const isTrapped = deepEnough && (noEscape || narrowEnough || (!canJumpOut && !canRopeOut));

  const vulnDepth = clamp(depthPx / 140, 0, 1);
  const vulnNarrow = clamp(46 / Math.max(10, widthPx), 0, 1);
  const attackVuln = clamp(vulnDepth * 0.65 + vulnDepth * vulnNarrow * 0.55, 0, 1);

  return {
    isTrapped,
    depthPx,
    widthPx,
    rimY,
    rimLeftX: rimLeft ? rimLeft.x : null,
    rimRightX: rimRight ? rimRight.x : null,
    escapeDir,
    canJumpOut,
    canRopeOut,
    thinWallDir,
    attackVuln
  };
}

