export type PostShotState = {
  dir: 'left' | 'right' | null;
  until: number;
};

export function applyPostShotMove(params: {
  presenter: any;
  player: any;
  now: number;
  timeLeft: number;
  reserveSeconds: number;
  lastFiredWeaponId: string | null;
  state: PostShotState;
}): PostShotState {
  const { presenter, player, now, timeLeft, reserveSeconds, lastFiredWeaponId } = params;
  if (lastFiredWeaponId === 'homing_missile') return params.state;
  if (timeLeft <= reserveSeconds + 0.35) return params.state;

  if (now < params.state.until && params.state.dir) {
    presenter.handleInput?.(params.state.dir, true, true);
    presenter.handleInput?.(params.state.dir === 'left' ? 'right' : 'left', false, true);
    return params.state;
  }

  const allies: any[] = Array.isArray(presenter?.state?.players)
    ? presenter.state.players.filter((w: any) => w && w.team === player.team && w !== player && w.health > 0)
    : [];

  let dir: 'left' | 'right' | null = null;
  const clusterR = 78;
  let bestD = Infinity;
  let bestDx = 0;
  for (const a of allies) {
    const dx = (Number(player.x) || 0) - (Number(a.x) || 0);
    const dy = (Number(player.y) || 0) - (Number(a.y) || 0);
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      bestDx = dx;
    }
  }
  if (bestD < clusterR) {
    dir = bestDx >= 0 ? 'right' : 'left';
  } else {
    const land = presenter?.state?.landscape;
    if (land && typeof land.getMaterial === 'function') {
      const sampleDx = 38;
      const x0 = Number(player.x) || 0;
      const y0 = Number(player.y) || 0;
      const h = Number(presenter?.state?.height) || 0;
      const groundYAt = (x: number, yHint: number): number | null => {
        const px = Math.floor(x);
        if (px < 0 || px >= (Number(presenter?.state?.width) || 0)) return null;
        const yStart = Math.max(0, Math.min(h - 1, Math.floor(yHint)));
        for (let y = yStart; y < h; y++) {
          if (land.getMaterial(px, y) > 0) return y;
        }
        return null;
      };
      const g0 = groundYAt(x0, y0);
      if (g0 !== null) {
        const gl = groundYAt(x0 - sampleDx, g0) ?? (g0 + 260);
        const gr = groundYAt(x0 + sampleDx, g0) ?? (g0 + 260);
        const dropL = gl - g0;
        const dropR = gr - g0;
        const maxDrop = Math.max(dropL, dropR);
        if (maxDrop > 80) {
          dir = dropL > dropR ? 'right' : 'left';
        }
      }
    }
  }

  if (dir) {
    const next = { dir, until: now + 0.35 } satisfies PostShotState;
    presenter.handleInput?.(dir, true, true);
    presenter.handleInput?.(dir === 'left' ? 'right' : 'left', false, true);
    return next;
  }

  presenter.handleInput?.('left', false, true);
  presenter.handleInput?.('right', false, true);
  return { dir: null, until: params.state.until };
}

