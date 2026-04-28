import { checkAdminAuth } from '../services/adminAuth';

export async function getMaps(env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const res = await env.DB.prepare('SELECT id, name, image_data, width, height, created_at FROM Maps ORDER BY created_at DESC').all();
    return new Response(JSON.stringify(res.results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function getMapImage(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 2];
    if (!id) return new Response('Missing ID', { status: 400, headers: corsHeaders });

    const data = await env.ROOMS.get('map_img_' + id);
    if (!data) return new Response('Not found', { status: 404, headers: corsHeaders });

    const b64 = data.split(',')[1];
    const mimeMatch = data.match(/^data:(image\/[a-zA-Z]+);base64,/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/png';

    if (!b64) {
      return new Response(data, { headers: { 'Content-Type': 'image/png', ...corsHeaders }});
    }

    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        ...corsHeaders
      }
    });
  } catch (e: any) {
    return new Response(e.message, { status: 500, headers: corsHeaders });
  }
}

export async function getMapById(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const res = await env.DB.prepare('SELECT * FROM Maps WHERE id = ?').bind(id).first();
    if (!res) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function createMap(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const { name, image_data, width, height } = await request.json() as any;
    
    if (!name || !image_data) {
      return new Response(JSON.stringify({ error: 'Missing name or image_data' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const id = crypto.randomUUID();
    const imageUrl = `/api/maps/${id}/image`;
    
    await env.ROOMS.put('map_img_' + id, image_data);

    await env.DB.prepare('INSERT INTO Maps (id, name, image_data, width, height) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, imageUrl, width || 1500, height || 800).run();

    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function updateMap(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { image_data, width, height, name } = await request.json() as any;
    
    if (!image_data) {
      return new Response(JSON.stringify({ error: 'Missing image_data' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const newWidth = Math.round(width || 3840);
    const newHeight = Math.round(height || 2160);

    const existing = await env.DB.prepare('SELECT id FROM Maps WHERE id = ?').bind(id).first();
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Map not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (image_data.length > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Image data too large (max 25MB)' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    await env.ROOMS.put('map_img_' + id, image_data);

    if (typeof name === 'string' && name.trim()) {
      await env.DB.prepare('UPDATE Maps SET name = ?, width = ?, height = ? WHERE id = ?')
        .bind(name.trim(), newWidth, newHeight, id).run();
    } else {
      await env.DB.prepare('UPDATE Maps SET width = ?, height = ? WHERE id = ?')
        .bind(newWidth, newHeight, id).run();
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function deleteMap(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    await env.ROOMS.delete('map_img_' + id);

    await env.DB.prepare('DELETE FROM Maps WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}
