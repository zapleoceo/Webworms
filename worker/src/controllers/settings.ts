import { checkAdminAuth } from '../services/adminAuth';

export async function getTurnTime(_request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const row = await env.DB.prepare(`SELECT value FROM Settings WHERE key = ?`).bind('turn_time').first<any>();
    return new Response(JSON.stringify({ turn_time: row ? Number(row.value) : 30 }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function updateTurnTime(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const body = await request.json() as any;
    const turn_time = Number(body.turn_time);

    if (isNaN(turn_time) || turn_time < 10 || turn_time > 120) {
      return new Response(JSON.stringify({ error: 'Invalid turn time' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    await env.DB.prepare(`INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)`).bind('turn_time', turn_time.toString()).run();

    return new Response(JSON.stringify({ success: true, turn_time }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const num = (v: any, fallback: number): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function normalizeAirdropPhysics(raw: any): any {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const fixedStep = clamp(num(r.fixedStep, 1 / 60), 1 / 240, 1 / 20);
  return {
    fixedStep,
    maxSubSteps: Math.floor(clamp(num(r.maxSubSteps, 5), 1, 12)),
    mass: clamp(num(r.mass, 3), 0.5, 50),
    restitution: clamp(num(r.restitution, 0.05), 0, 0.6),
    friction: clamp(num(r.friction, 0.7), 0, 2),
    linearDampingAir: clamp(num(r.linearDampingAir, 0.2), 0, 10),
    linearDampingGround: clamp(num(r.linearDampingGround, 6), 0, 40),
    angularDampingAir: clamp(num(r.angularDampingAir, 0.4), 0, 20),
    angularDampingGround: clamp(num(r.angularDampingGround, 10), 0, 60),
    centerOfMassYOffset: clamp(num(r.centerOfMassYOffset, 0.18), -0.5, 0.8),
    contactSpacing: clamp(num(r.contactSpacing, 26), 10, 80),
    maxContactPoints: Math.floor(clamp(num(r.maxContactPoints, 14), 6, 40)),
    solverIterations: Math.floor(clamp(num(r.solverIterations, 6), 1, 20)),
    maxPenetration: clamp(num(r.maxPenetration, 10), 2, 40),
    penetrationCorrection: clamp(num(r.penetrationCorrection, 0.55), 0.05, 1),
    sleepLinear: clamp(num(r.sleepLinear, 6), 0.2, 30),
    sleepAngular: clamp(num(r.sleepAngular, 0.35), 0.02, 10),
    sleepTime: clamp(num(r.sleepTime, 0.9), 0.1, 5),
    impactShakeTime: clamp(num(r.impactShakeTime, 0.3), 0, 1)
  };
}

export async function getAirdropPhysics(_request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const row = await env.DB.prepare(`SELECT value FROM Settings WHERE key = ?`).bind('airdrop_physics').first<any>();
    if (!row?.value) return new Response(JSON.stringify(normalizeAirdropPhysics({})), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    let parsed: any = {};
    try {
      parsed = JSON.parse(row.value);
    } catch {}
    return new Response(JSON.stringify(normalizeAirdropPhysics(parsed)), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function updateAirdropPhysics(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  try {
    const body = await request.json() as any;
    const cfg = normalizeAirdropPhysics(body);
    await env.DB.prepare(`INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)`).bind('airdrop_physics', JSON.stringify(cfg)).run();
    return new Response(JSON.stringify({ success: true, ...cfg }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function getGameSettings(_request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const rows = await env.DB.prepare(`SELECT key, value FROM Settings WHERE key IN ('turn_time', 'airdrop_physics')`).all<any>();
    const map = new Map<string, string>();
    for (const r of rows.results || []) {
      if (typeof r?.key === 'string' && typeof r?.value === 'string') map.set(r.key, r.value);
    }
    const turn_time = map.has('turn_time') ? Number(map.get('turn_time')) : 30;
    let airdrop: any = {};
    if (map.has('airdrop_physics')) {
      try {
        airdrop = JSON.parse(map.get('airdrop_physics') as string);
      } catch {}
    }
    const airdrop_physics = normalizeAirdropPhysics(airdrop);
    return new Response(JSON.stringify({ turn_time, airdrop_physics }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}
