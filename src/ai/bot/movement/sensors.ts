export function detectObstacle(presenter: any, player: any, dir: 'left' | 'right'): boolean {
  const ahead = (player.width || 10) + 10;
  const x = player.x + (dir === 'right' ? 1 : -1) * ahead;
  const yTop = player.y - (player.height || 10) / 2;
  const yMid = player.y;
  const yHead = yTop - 2;
  const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
  const solid = (xx: number, yy: number) => mat(Math.floor(xx), Math.floor(yy)) > 0;
  return solid(x, yMid) || solid(x, yTop) || solid(x, yHead);
}

export function scanCliffAhead(
  presenter: any,
  player: any,
  dir: 'left' | 'right'
): { isGapOrCliff: boolean; isDeepVoid: boolean; maxDrop: number } {
  const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
  const w = presenter.state.width;
  const h = presenter.state.height;
  const sign = dir === 'right' ? 1 : -1;

  const yFoot = player.y + (player.height || 10) / 2 + 2;
  const yStart = Math.max(0, Math.floor(yFoot));
  const maxSearch = 220;

  const distances = [16, 28, 40, 52, 64, 80];
  let maxDrop = 0;
  let missingCount = 0;

  for (const d of distances) {
    const x = Math.floor(player.x + sign * ((player.width || 10) + d));
    if (x < 0 || x >= w) continue;
    let groundY: number | null = null;
    for (let y = yStart; y < Math.min(h, yStart + maxSearch); y++) {
      if (mat(x, y) > 0) {
        groundY = y;
        break;
      }
    }
    if (groundY === null) {
      missingCount += 1;
      maxDrop = Math.max(maxDrop, maxSearch);
    } else {
      maxDrop = Math.max(maxDrop, groundY - yStart);
    }
  }

  const isGapOrCliff = missingCount >= 2 || maxDrop >= 90;
  const isDeepVoid = missingCount >= 4;
  return { isGapOrCliff, isDeepVoid, maxDrop };
}

export function detectCeilingLow(presenter: any, player: any, dir: 'left' | 'right'): boolean {
  const mat = presenter.state.landscape.getMaterial.bind(presenter.state.landscape);
  const w = presenter.state.width;
  const sign = dir === 'right' ? 1 : -1;
  const headY = player.y - (player.height || 10) / 2;
  const checksY = [Math.floor(headY - 6), Math.floor(headY - 14), Math.floor(headY - 22)];
  const checksX = [Math.floor(player.x), Math.floor(player.x + sign * ((player.width || 10) + 10))];
  for (const x of checksX) {
    if (x < 0 || x >= w) continue;
    for (const y of checksY) {
      if (y < 0) continue;
      if (mat(x, y) > 0) return true;
    }
  }
  return false;
}

