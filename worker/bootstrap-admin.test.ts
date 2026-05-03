import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('bootstrap admin', () => {
  it('creates admin when configured and allows admin auth', async () => {
    const email = `admin${Date.now()}@example.com`;
    const password = 'pass1234';
    (env as any).BOOTSTRAP_ADMIN_EMAIL = email;
    (env as any).BOOTSTRAP_ADMIN_PASSWORD = password;

    const ctx0 = createExecutionContext();
    const pingRes = await worker.fetch(new Request('http://example.com/api/ping', { method: 'GET' }), env as any, ctx0 as any);
    await waitOnExecutionContext(ctx0);
    expect(pingRes.status).toBe(200);

    const ctx1 = createExecutionContext();
    const createRes = await worker.fetch(new Request('http://example.com/api/admin/weapons', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': email,
        'X-Admin-Password': encodeURIComponent(password)
      },
      body: JSON.stringify({
        name: 'Test Weapon',
        color: '#ffffff',
        damage: 10,
        explosionRadius: 10,
        knockback: 10,
        windMultiplier: 1,
        spread: 0,
        projectilesPerShot: 1,
        cooldown: 0.1,
        chargeSpeed: 1,
        speedModifier: 1
      })
    }), env as any, ctx1 as any);
    await waitOnExecutionContext(ctx1);
    expect(createRes.status).toBe(200);
    const body = await createRes.json() as any;
    expect(body.success).toBe(true);
  });
});
