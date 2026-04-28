import { checkAdminAuth } from '../services/adminAuth';

export async function getLogos(env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const res = await env.DB.prepare('SELECT * FROM Logos').all();
    return new Response(JSON.stringify(res.results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function createLogo(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const { image_data, width, height, hardness } = await request.json() as any;
    
    if (!image_data || !width || !height || !hardness) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO Logos (id, image_data, width, height, hardness) VALUES (?, ?, ?, ?, ?)')
      .bind(id, image_data, width, height, hardness).run();

    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function updateLogo(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const body = await request.json() as any;
    const hasAnyField =
      body.image_data !== undefined ||
      body.width !== undefined ||
      body.height !== undefined ||
      body.hardness !== undefined;

    if (!hasAnyField) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const existing = await env.DB.prepare('SELECT * FROM Logos WHERE id = ?').bind(id).first<any>();
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Logo not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const image_data = body.image_data !== undefined ? body.image_data : existing.image_data;
    const width = body.width !== undefined ? body.width : existing.width;
    const height = body.height !== undefined ? body.height : existing.height;
    const hardness = body.hardness !== undefined ? body.hardness : existing.hardness;

    await env.DB.prepare('UPDATE Logos SET image_data = ?, width = ?, height = ?, hardness = ? WHERE id = ?')
      .bind(image_data, width, height, hardness, id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function deleteLogo(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    await env.DB.prepare('DELETE FROM Logos WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

