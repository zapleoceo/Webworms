import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('auth', () => {
  it('register -> verify -> login -> session', async () => {
    const email = `u${Date.now()}@example.com`;
    const username = `user${Date.now()}`;
    const password = 'pass1234';

    const ctx1 = createExecutionContext();
    const registerRes = await worker.fetch(new Request('http://example.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    }), env as any, ctx1 as any);
    await waitOnExecutionContext(ctx1);
    expect(registerRes.status).toBe(201);
    const registerBody = await registerRes.json() as any;
    expect(registerBody.success).toBe(true);
    expect(typeof registerBody.dev_token_link).toBe('string');

    const verifyUrl = new URL(registerBody.dev_token_link);
    const token = verifyUrl.searchParams.get('token');
    expect(token).toBeTruthy();

    const ctx2 = createExecutionContext();
    const verifyRes = await worker.fetch(new Request(`http://example.com/api/auth/verify?token=${token}`, { method: 'GET' }), env as any, ctx2 as any);
    await waitOnExecutionContext(ctx2);
    expect(verifyRes.status).toBe(200);

    const ctx3 = createExecutionContext();
    const loginRes = await worker.fetch(new Request('http://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }), env as any, ctx3 as any);
    await waitOnExecutionContext(ctx3);
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json() as any;
    expect(loginBody.success).toBe(true);
    expect(typeof loginBody.token).toBe('string');

    const ctx4 = createExecutionContext();
    const sessionRes = await worker.fetch(new Request('http://example.com/api/auth/session', {
      method: 'GET',
      headers: { Authorization: `Bearer ${loginBody.token}` }
    }), env as any, ctx4 as any);
    await waitOnExecutionContext(ctx4);
    expect(sessionRes.status).toBe(200);
    const sessionBody = await sessionRes.json() as any;
    expect(sessionBody.success).toBe(true);
    expect(sessionBody.user.email).toBe(email);
    expect(sessionBody.user.username).toBe(username);
  });
});

