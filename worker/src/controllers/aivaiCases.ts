import { d1Retry } from '../services/d1';

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return true;
  return origin === 'https://webworms.pages.dev' || origin.startsWith('http://localhost');
}

const safeJson = async (request: Request): Promise<any> => {
  const text = await request.text();
  if (!text || text.length < 2) return null;
  try { return JSON.parse(text); } catch { return null; }
};

export async function ingestAIVaiCases(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!isAllowedOrigin(request)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (!env?.DB) {
      return new Response(JSON.stringify({ success: false, error: 'DB not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const body = await safeJson(request);
    if (!body) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const aiV = typeof body.aiV === 'string' ? body.aiV.slice(0, 32) : '';
    const cases = Array.isArray(body.cases) ? body.cases : [];
    if (!aiV) {
      return new Response(JSON.stringify({ success: false, error: 'Missing aiV' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (cases.length === 0) {
      return new Response(JSON.stringify({ success: true, ingested: 0 }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (cases.length > 20) {
      return new Response(JSON.stringify({ success: false, error: 'Too many cases' }), { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const alpha = 0.15;
    const a0 = 1 - alpha;
    const now = Date.now();
    let ingested = 0;
    const sql = `
      INSERT INTO AIVaiCases (
        aiV, stateKey, caseId, planJson, weaponId,
        samples, emaUtility, lastUtility, lastEnemyDelta, lastAllyDelta, lastExpectedDamage, updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?,
        1, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(aiV, stateKey, caseId) DO UPDATE SET
        samples = samples + 1,
        emaUtility = (emaUtility * ${a0}) + (excluded.lastUtility * ${alpha}),
        lastUtility = excluded.lastUtility,
        lastEnemyDelta = excluded.lastEnemyDelta,
        lastAllyDelta = excluded.lastAllyDelta,
        lastExpectedDamage = excluded.lastExpectedDamage,
        planJson = excluded.planJson,
        weaponId = excluded.weaponId,
        updatedAt = excluded.updatedAt
    `;

    for (const c of cases) {
      const stateKey = typeof c?.stateKey === 'string' ? c.stateKey.slice(0, 200) : '';
      const caseId = typeof c?.caseId === 'string' ? c.caseId.slice(0, 80) : '';
      const planJson = typeof c?.planJson === 'string' ? c.planJson : (c?.plan ? JSON.stringify(c.plan) : '');
      const weaponId = typeof c?.weaponId === 'string' ? c.weaponId.slice(0, 40) : null;
      const lastUtility = Number(c?.utility);
      const lastEnemyDelta = Number(c?.enemyDelta);
      const lastAllyDelta = Number(c?.allyDelta);
      const lastExpectedDamage = Number(c?.expectedDamage);
      if (!stateKey || !caseId || !planJson) continue;
      if (!Number.isFinite(lastUtility) || !Number.isFinite(lastEnemyDelta) || !Number.isFinite(lastAllyDelta) || !Number.isFinite(lastExpectedDamage)) continue;
      const updatedAt = Number.isFinite(Number(c?.updatedAt)) ? Number(c.updatedAt) : now;
      await d1Retry(() => env.DB.prepare(sql).bind(
        aiV, stateKey, caseId, planJson, weaponId,
        lastUtility, lastUtility, lastEnemyDelta, lastAllyDelta, lastExpectedDamage, updatedAt
      ).run());
      ingested += 1;
    }

    return new Response(JSON.stringify({ success: true, ingested }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function getAIVaiCasesTop(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!isAllowedOrigin(request)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (!env?.DB) {
      return new Response(JSON.stringify({ success: false, error: 'DB not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const url = new URL(request.url);
    const aiV = url.searchParams.get('aiV')?.trim() || '';
    const stateKey = url.searchParams.get('stateKey')?.trim() || '';
    const limit = Math.max(1, Math.min(40, Number(url.searchParams.get('limit') || '20') || 20));
    if (!aiV || !stateKey) {
      return new Response(JSON.stringify({ success: false, error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const res = await d1Retry(() => env.DB.prepare(`
      SELECT aiV, stateKey, caseId, planJson, weaponId, samples, emaUtility, lastUtility, lastEnemyDelta, lastAllyDelta, lastExpectedDamage, updatedAt
      FROM AIVaiCases
      WHERE aiV = ? AND stateKey = ?
      ORDER BY emaUtility DESC
      LIMIT ?
    `).bind(aiV, stateKey, limit).all<any>());
    const rows = Array.isArray(res?.results) ? res.results : [];
    return new Response(JSON.stringify({ success: true, cases: rows }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function getAIVaiCasesBootstrap(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!isAllowedOrigin(request)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (!env?.DB) {
      return new Response(JSON.stringify({ success: false, error: 'DB not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const url = new URL(request.url);
    const aiV = url.searchParams.get('aiV')?.trim() || '';
    const limit = Math.max(1, Math.min(800, Number(url.searchParams.get('limit') || '400') || 400));
    if (!aiV) {
      return new Response(JSON.stringify({ success: false, error: 'Missing aiV' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const res = await d1Retry(() => env.DB.prepare(`
      SELECT aiV, stateKey, caseId, planJson, weaponId, samples, emaUtility, lastUtility, lastEnemyDelta, lastAllyDelta, lastExpectedDamage, updatedAt
      FROM AIVaiCases
      WHERE aiV = ?
      ORDER BY updatedAt DESC
      LIMIT ?
    `).bind(aiV, limit).all<any>());
    const rows = Array.isArray(res?.results) ? res.results : [];
    return new Response(JSON.stringify({ success: true, cases: rows }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

