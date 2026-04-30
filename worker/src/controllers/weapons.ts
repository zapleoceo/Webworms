import { Env } from '../index';

export async function getWeapons(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM Weapons ORDER BY created_at ASC').all();
  return new Response(JSON.stringify(result.results), { headers: { 'Content-Type': 'application/json' } });
}

export async function createWeapon(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  const id = (typeof body.id === 'string' && body.id.trim().length > 0)
    ? body.id.trim()
    : 'wpn_' + Math.random().toString(36).substring(2, 8).toLowerCase();

  // Basic validation
  if (!body.name || !body.color || typeof body.damage !== 'number') {
    return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 });
  }
  const maxRange = typeof body.maxRange === 'number' ? body.maxRange : 1900;

  await env.DB.prepare(`
    INSERT INTO Weapons (
      id, name, damage, explosionRadius, knockback, windMultiplier, spread, projectilesPerShot, cooldown, chargeSpeed, speedModifier, maxRange, icon_src, projectile_src, color
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.damage,
    body.explosionRadius,
    body.knockback,
    body.windMultiplier,
    body.spread,
    body.projectilesPerShot,
    body.cooldown,
    body.chargeSpeed,
    body.speedModifier,
    maxRange,
    body.icon_src || null,
    body.projectile_src || null,
    body.color
  ).run();

  return new Response(JSON.stringify({ success: true, id }), { headers: { 'Content-Type': 'application/json' } });
}

export async function updateWeapon(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return new Response('Bad Request', { status: 400 });

  const body = await request.json() as any;
  if (!body.name || !body.color || typeof body.damage !== 'number') {
    return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 });
  }
  const maxRange = typeof body.maxRange === 'number' ? body.maxRange : 1900;

  await env.DB.prepare(`
    UPDATE Weapons SET 
      name = ?, damage = ?, explosionRadius = ?, knockback = ?, windMultiplier = ?, spread = ?, 
      projectilesPerShot = ?, cooldown = ?, chargeSpeed = ?, speedModifier = ?, maxRange = ?, icon_src = ?, projectile_src = ?, color = ?
    WHERE id = ?
  `).bind(
    body.name,
    body.damage,
    body.explosionRadius,
    body.knockback,
    body.windMultiplier,
    body.spread,
    body.projectilesPerShot,
    body.cooldown,
    body.chargeSpeed,
    body.speedModifier,
    maxRange,
    body.icon_src || null,
    body.projectile_src || null,
    body.color,
    id
  ).run();

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export async function deleteWeapon(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return new Response('Bad Request', { status: 400 });

  await env.DB.prepare('DELETE FROM Weapons WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}
