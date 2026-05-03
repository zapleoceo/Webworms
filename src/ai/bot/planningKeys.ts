import { hashStringToSeed } from '../../utils/SeededRng';

export type TerrainSig = { rev: number; df: number; dimKey: string };

export function terrainSig(presenter: any): TerrainSig {
  const terrain = presenter?.state?.landscape;
  const dfEvents: any[] = Array.isArray((terrain as any)?.dfEvents) ? (terrain as any).dfEvents : [];
  const rev = Number((terrain as any)?.revision) || 0;
  const df = dfEvents.length;
  const dimKey = `${terrain?.width || 0}x${terrain?.height || 0}`;
  return { rev, df, dimKey };
}

export function prunePlanCache(
  presenter: any,
  planCache: Map<string, { createdAt: number; shooterId: string; rev: number; df: number }>,
  lastCacheRev: number,
  lastCacheDf: number
): { lastCacheRev: number; lastCacheDf: number } {
  const sig = terrainSig(presenter);
  let rev = lastCacheRev;
  let df = lastCacheDf;
  if (sig.rev !== rev || sig.df !== df) {
    rev = sig.rev;
    df = sig.df;
    for (const [k, v] of planCache.entries()) {
      if (v.rev !== sig.rev || v.df !== sig.df) planCache.delete(k);
    }
  }
  if (planCache.size > 140) {
    const entries = Array.from(planCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < Math.max(0, entries.length - 110); i++) planCache.delete(entries[i][0]);
  }
  const alive = presenter?.state?.players?.map((p: any, idx: number) => (p && p.health > 0) ? String(idx) : null).filter(Boolean) as string[] || [];
  if (alive.length > 0) {
    const aliveSet = new Set(alive);
    for (const [k, v] of planCache.entries()) {
      if (!aliveSet.has(v.shooterId)) planCache.delete(k);
    }
  }
  return { lastCacheRev: rev, lastCacheDf: df };
}

export function worldKey(params: { presenter: any; matchKey: string; shooterIndex: number; ropeRemaining: number }): string {
  const { presenter, matchKey, shooterIndex, ropeRemaining } = params;
  const sig = terrainSig(presenter);
  const wind = Number.isFinite(presenter?.state?.wind) ? Number(presenter.state.wind) : 0;
  const windBin = Math.round(wind / 10);
  const g1 = presenter?.state?.teamAmmo?.team1?.grenade;
  const g2 = presenter?.state?.teamAmmo?.team2?.grenade;
  const a1 = (typeof g1 === 'number' && Number.isFinite(g1)) ? Math.max(0, Math.floor(g1)) : -1;
  const a2 = (typeof g2 === 'number' && Number.isFinite(g2)) ? Math.max(0, Math.floor(g2)) : -1;
  const players: any[] = Array.isArray(presenter?.state?.players) ? presenter.state.players : [];
  const parts: string[] = [];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p || p.health <= 0) continue;
    const qx = Math.round((Number(p.x) || 0) / 16);
    const qy = Math.round((Number(p.y) || 0) / 16);
    const hh = Math.max(0, Math.min(10, Math.round((Number(p.health) || 0) / 10)));
    parts.push(`${i}${p.team === 'team1' ? 'a' : 'b'}${qx},${qy},${hh}`);
  }
  const raw = `${matchKey}|rev${sig.rev}|df${sig.df}|w${windBin}|g${a1}:${a2}|r${Math.round(ropeRemaining)}|s${shooterIndex}|${parts.join('|')}`;
  return String(hashStringToSeed(raw) >>> 0);
}

