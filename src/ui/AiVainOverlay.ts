export type AivaiOverlayStats = {
  left: Record<string, any>;
  right: Record<string, any>;
};

const fmt = (v: any, digits: number = 1): string => {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(digits);
};

const ensure = (id: string, side: 'left' | 'right'): HTMLElement => {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement('div');
  el.id = id;
  el.className = `aivai-ai-stats ${side}`;
  const root = document.querySelector(side === 'left' ? '.team-status.left-team' : '.team-status.right-team');
  (root || document.body).appendChild(el);
  return el;
};

export function updateAivaiOverlay(state: any): void {
  try {
    if (!state || state.mode !== 'aivai') {
      const a = document.getElementById('aivai-ai-stats-left');
      const b = document.getElementById('aivai-ai-stats-right');
      if (a) a.style.display = 'none';
      if (b) b.style.display = 'none';
      return;
    }

    const leftEl = ensure('aivai-ai-stats-left', 'left');
    const rightEl = ensure('aivai-ai-stats-right', 'right');
    leftEl.style.display = 'block';
    rightEl.style.display = 'block';

    const mode = (window as any).currentMode || state.mode || 'aivai';
    const hud = (window as any).getHudSides ? (window as any).getHudSides(mode, state) : null;
    const leftTeam = hud?.leftTeam || 'team1';
    const rightTeam = hud?.rightTeam || 'team2';

    const ai = state.aiStats || {};
    const mk = (team: string) => {
      const s = ai[team] || {};
      const fail = s.fail || {};
      return [
        `think ${s.thinkSrc || '-'}  w=${fmt(s.workerMs, 0)}ms  c=${fmt(s.computeMs, 0)}ms`,
        `best ${fmt(s.bestScore, 1)}  eval ${fmt(s.evals, 0)}  combo ${fmt(s.comboCount, 0)}`,
        `cacheHit ${fmt(s.cacheHit, 0)}  rope(b=${fmt(fail.ropeBorder, 0)} na=${fmt(fail.ropeNoAttach, 0)})  walk(c=${fmt(fail.walkCliff, 0)} o=${fmt(fail.walkObstacle, 0)})`
      ].join('<br>');
    };

    leftEl.innerHTML = mk(leftTeam);
    rightEl.innerHTML = mk(rightTeam);
  } catch {}
}
