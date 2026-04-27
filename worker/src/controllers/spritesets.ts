import { Env } from '../index';

export async function getSpriteSets(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM SpriteSets ORDER BY created_at DESC').all();
  return new Response(JSON.stringify(result.results), { headers: { 'Content-Type': 'application/json' } });
}

export async function createSpriteSet(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const id = 'skin_' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Validate fields
  if (!body.name || !body.idle_src || !body.walk_src || !body.jump_src || !body.grave_src) {
    return new Response(JSON.stringify({ error: 'Missing required sprites' }), { status: 400 });
  }

  await env.DB.prepare(`
    INSERT INTO SpriteSets (id, name, idle_src, walk_src, jump_src, grave_src, aim_bazooka_src, aim_minigun_src, aim_shotgun_src, aim_rocket_src)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.idle_src,
    body.walk_src,
    body.jump_src,
    body.grave_src,
    body.aim_bazooka_src || null,
    body.aim_minigun_src || null,
    body.aim_shotgun_src || null,
    body.aim_rocket_src || null
  ).run();

  return new Response(JSON.stringify({ success: true, id }), { headers: { 'Content-Type': 'application/json' } });
}

export async function updateSpriteSet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return new Response('Bad Request', { status: 400 });

  const body = await request.json() as any;
  if (!body.name || !body.idle_src || !body.walk_src || !body.jump_src || !body.grave_src) {
    return new Response(JSON.stringify({ error: 'Missing required sprites' }), { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE SpriteSets 
    SET name = ?, idle_src = ?, walk_src = ?, jump_src = ?, grave_src = ?, 
        aim_bazooka_src = ?, aim_minigun_src = ?, aim_shotgun_src = ?, aim_rocket_src = ?
    WHERE id = ?
  `).bind(
    body.name,
    body.idle_src,
    body.walk_src,
    body.jump_src,
    body.grave_src,
    body.aim_bazooka_src || null,
    body.aim_minigun_src || null,
    body.aim_shotgun_src || null,
    body.aim_rocket_src || null,
    id
  ).run();

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export async function deleteSpriteSet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return new Response('Bad Request', { status: 400 });

  await env.DB.prepare('DELETE FROM SpriteSets WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}
