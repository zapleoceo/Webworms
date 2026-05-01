import { checkAdminAuth } from '../services/adminAuth';

function num(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function listAIVaiLogs(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (!env.AIVAI_LOGS) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || 'aivai/';
  const limit = Math.max(1, Math.min(200, Math.floor(num(url.searchParams.get('limit'), 25))));
  const cursor = url.searchParams.get('cursor') || undefined;

  const res = await env.AIVAI_LOGS.list({ prefix, limit, cursor });
  const objects = (res.objects || []).map((o: any) => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded
  }));

  return new Response(JSON.stringify({ prefix, limit, cursor: res.cursor || null, truncated: !!res.truncated, objects }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function getAIVaiLog(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (!env.AIVAI_LOGS) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key || !key.startsWith('aivai/')) {
    return new Response(JSON.stringify({ error: 'Invalid key' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const obj = await env.AIVAI_LOGS.get(key);
  if (!obj) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const text = await obj.text();
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

