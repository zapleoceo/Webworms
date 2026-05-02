function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return true;
  return origin === 'https://webworms.pages.dev' || origin.startsWith('http://localhost');
}

function parseMatchTs(matchId: string): number {
  const m = /^aivai_(\d+)/.exec(matchId);
  if (!m) return Date.now();
  const ts = Number(m[1]);
  return Number.isFinite(ts) ? ts : Date.now();
}

function keyForMatch(matchId: string): string {
  const ts = parseMatchTs(matchId);
  const d = new Date(ts);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `aivai/${yyyy}/${mm}/${dd}/${matchId}.json`;
}

export async function getAIVaiLogMeta(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (!env.AIVAI_LOGS) {
    return new Response(JSON.stringify({ success: false, error: 'R2 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const url = new URL(request.url);
  const matchId = url.searchParams.get('matchId')?.trim() || '';
  if (!matchId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing matchId' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const key = keyForMatch(matchId);
  const headFn = (env.AIVAI_LOGS as any).head?.bind(env.AIVAI_LOGS);
  const head = typeof headFn === 'function' ? await headFn(key) : null;
  if (!head) {
    return new Response(JSON.stringify({ success: true, exists: false, key }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  return new Response(JSON.stringify({ success: true, exists: true, key, size: head.size, uploaded: head.uploaded }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function getAIVaiLogStats(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (!env.AIVAI_LOGS) {
    return new Response(JSON.stringify({ success: false, error: 'R2 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const url = new URL(request.url);
  const matchId = url.searchParams.get('matchId')?.trim() || '';
  if (!matchId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing matchId' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const key = keyForMatch(matchId);
  const obj = await env.AIVAI_LOGS.get(key);
  if (!obj) {
    return new Response(JSON.stringify({ success: true, exists: false, key }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const bodyText = await obj.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON', key }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const events: any[] = Array.isArray(parsed?.events) ? parsed.events : [];
  let fired = 0;
  let shotEval = 0;
  let good = 0;
  let bad = 0;
  let maxStreak = 0;
  let curStreak = 0;
  let decisionCount = 0;
  let decisionFirstT: number | null = null;
  let decisionLastT: number | null = null;
  const decisionStages: Record<string, number> = {};
  let plannedFirstT: number | null = null;
  let planningFirstT: number | null = null;
  const types: Record<string, number> = {};
  for (const e of events) {
    const t = typeof e?.type === 'string' ? e.type : 'event';
    types[t] = (types[t] || 0) + 1;
    if (t === 'turn_state') {
      const tt = Number(e?.t);
      if (Number.isFinite(tt)) {
        if (planningFirstT === null && Number(e?.planningInProgress) === 1) planningFirstT = tt;
        if (plannedFirstT === null && Number(e?.plannedThisTurn) === 1) plannedFirstT = tt;
      }
    }
    if (t === 'bot_decision') {
      decisionCount += 1;
      const stage = typeof e?.stage === 'string' ? e.stage : 'unknown';
      decisionStages[stage] = (decisionStages[stage] || 0) + 1;
      const tt = Number(e?.t);
      if (Number.isFinite(tt)) {
        if (decisionFirstT === null || tt < decisionFirstT) decisionFirstT = tt;
        if (decisionLastT === null || tt > decisionLastT) decisionLastT = tt;
      }
    }
    if (t === 'weapon_fired') fired += 1;
    if (t === 'shot_eval') {
      shotEval += 1;
      const enemyDelta = Number(e?.enemyDelta) || 0;
      const allyDelta = Number(e?.allyDelta) || 0;
      const ok = enemyDelta > 0.01 && allyDelta <= 0.01;
      if (ok) {
        good += 1;
        curStreak += 1;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        bad += 1;
        curStreak = 0;
      }
    }
  }
  return new Response(JSON.stringify({
    success: true,
    exists: true,
    key,
    uploaded: (obj as any).uploaded || null,
    aiV: parsed?.aiV || null,
    totalEvents: events.length,
    decision: { count: decisionCount, firstT: decisionFirstT, lastT: decisionLastT, stages: decisionStages },
    planningFirstT,
    plannedFirstT,
    fired,
    shotEval,
    good,
    bad,
    maxStreak,
    typesTop: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 12)
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}
