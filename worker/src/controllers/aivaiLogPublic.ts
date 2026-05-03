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
  const weaponCounts: Record<string, number> = {};
  const stageWeaponCounts: Record<string, Record<string, number>> = {};
  const turnAgg: Record<string, any> = {};
  const expectedLastByWorm: Record<string, number> = {};
  const perWorm: Record<string, any> = {};
  const lastN: any[] = [];
  for (const e of events) {
    const t = typeof e?.type === 'string' ? e.type : 'event';
    types[t] = (types[t] || 0) + 1;
    const wormId = typeof e?.wormId === 'string' ? e.wormId : null;
    const turnNo = typeof e?.turnNo === 'number' ? e.turnNo : null;
    if (wormId && turnNo !== null) {
      const k = `${wormId}|${turnNo}`;
      const a = (turnAgg[k] ||= { wormId, turnNo, planIntent: null as any, expectedDamage: null as any, weaponId: null as any, enemyDelta: 0, allyDelta: 0, wallStall: 0 });
      if (t === 'bot_plan_start') {
        a.planIntent = e?.plan?.intent || null;
        const ex = Number(e?.expectedDamage);
        a.expectedDamage = Number.isFinite(ex) ? ex : null;
        const prev = expectedLastByWorm[wormId];
        if (Number.isFinite(prev) && Number.isFinite(a.expectedDamage)) {
          const pw = (perWorm[wormId] ||= { turns: 0, goal: 0, enemy: 0, ally: 0, wall: 0, posN: 0, pos: 0, weapons: {} as Record<string, number> });
          pw.posN += 1;
          if (a.expectedDamage >= prev - 1) pw.pos += 1;
        }
        if (Number.isFinite(a.expectedDamage)) expectedLastByWorm[wormId] = a.expectedDamage;
      }
      if (t === 'weapon_fired') a.weaponId = typeof e?.weaponId === 'string' ? e.weaponId : a.weaponId;
      if (t === 'bot_wall_stall') a.wallStall = 1;
      if (t === 'shot_eval') {
        a.enemyDelta += Number(e?.enemyDelta) || 0;
        a.allyDelta += Number(e?.allyDelta) || 0;
      }
    }
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
      const weapon = typeof e?.weapon === 'string' ? e.weapon : typeof e?.weaponName === 'string' ? e.weaponName : typeof e?.weaponId === 'string' ? e.weaponId : 'unknown';
      weaponCounts[weapon] = (weaponCounts[weapon] || 0) + 1;
      stageWeaponCounts[stage] = stageWeaponCounts[stage] || {};
      stageWeaponCounts[stage][weapon] = (stageWeaponCounts[stage][weapon] || 0) + 1;
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
    if (lastN.length < 50) lastN.push(e);
    else {
      lastN.shift();
      lastN.push(e);
    }
  }

  for (const a of Object.values(turnAgg)) {
    const wormId = String((a as any).wormId || '');
    if (!wormId) continue;
    const pw = (perWorm[wormId] ||= { turns: 0, goal: 0, enemy: 0, ally: 0, wall: 0, posN: 0, pos: 0, weapons: {} as Record<string, number> });
    if ((a as any).planIntent) pw.turns += 1;
    if ((a as any).wallStall) pw.wall += 1;
    const enemyDelta = Number((a as any).enemyDelta) || 0;
    const allyDelta = Number((a as any).allyDelta) || 0;
    if (enemyDelta > 0.01) pw.enemy += 1;
    if (allyDelta > 0.01) pw.ally += 1;
    if ((a as any).planIntent === 'attack' && enemyDelta > 0.01) pw.goal += 1;
    const w = (a as any).weaponId;
    if (typeof w === 'string' && w) pw.weapons[w] = (pw.weapons[w] || 0) + 1;
  }

  const perWormSummary = Object.fromEntries(Object.entries(perWorm).map(([wormId, pw]) => {
    const turns = Number(pw.turns) || 0;
    const posN = Number(pw.posN) || 0;
    const weaponsTop = Object.entries(pw.weapons || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return [wormId, {
      turns,
      goalRate: turns ? (Number(pw.goal) || 0) / turns : 0,
      enemyRate: turns ? (Number(pw.enemy) || 0) / turns : 0,
      allyRate: turns ? (Number(pw.ally) || 0) / turns : 0,
      wallRate: turns ? (Number(pw.wall) || 0) / turns : 0,
      posRate: posN ? (Number(pw.pos) || 0) / posN : 0,
      weaponsTop
    }];
  }));
  return new Response(JSON.stringify({
    success: true,
    exists: true,
    key,
    uploaded: (obj as any).uploaded || null,
    aiV: parsed?.aiV || null,
    totalEvents: events.length,
    decision: { count: decisionCount, firstT: decisionFirstT, lastT: decisionLastT, stages: decisionStages },
    weaponsTop: Object.entries(weaponCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    stageWeaponsTop: Object.fromEntries(Object.entries(stageWeaponCounts).map(([stage, m]) => [stage, Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6)])),
    planningFirstT,
    plannedFirstT,
    fired,
    shotEval,
    good,
    bad,
    maxStreak,
    perWorm: perWormSummary,
    typesTop: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 12)
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function getAIVaiLogExtract(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
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
  const limit = Math.max(1, Math.min(400, Number(url.searchParams.get('limit') || '120') || 120));
  const fromEnd = (url.searchParams.get('fromEnd') || '1') !== '0';
  const typesParam = (url.searchParams.get('types') || '').trim();
  const allowedDefault = ['bot_decision', 'weapon_fired', 'shot_eval', 'bot_move_strategy', 'bot_movement_summary', 'bot_rope_attempt', 'anomaly', 'turn_state'];
  const allowed = new Set<string>((typesParam ? typesParam.split(',') : allowedDefault).map(s => s.trim()).filter(Boolean));

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
  const filtered: any[] = [];
  if (fromEnd) {
    for (let i = events.length - 1; i >= 0 && filtered.length < limit; i--) {
      const e = events[i];
      const t = typeof e?.type === 'string' ? e.type : '';
      if (allowed.has(t)) filtered.push(e);
    }
    filtered.reverse();
  } else {
    for (let i = 0; i < events.length && filtered.length < limit; i++) {
      const e = events[i];
      const t = typeof e?.type === 'string' ? e.type : '';
      if (allowed.has(t)) filtered.push(e);
    }
  }
  return new Response(JSON.stringify({ success: true, exists: true, key, uploaded: (obj as any).uploaded || null, count: filtered.length, events: filtered }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}
