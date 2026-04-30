type Plan = {
  id: 'premium_7d_1' | 'premium_30d_5';
  days: number;
  amountCents: number;
  amountValue: string;
  currency: 'USD';
  description: string;
};

const PLANS: Record<Plan['id'], Plan> = {
  premium_7d_1: { id: 'premium_7d_1', days: 7, amountCents: 100, amountValue: '1.00', currency: 'USD', description: 'WebWorms Premium (7 Days)' },
  premium_30d_5: { id: 'premium_30d_5', days: 30, amountCents: 500, amountValue: '5.00', currency: 'USD', description: 'WebWorms Premium (30 Days)' },
};

function jsonResponse(body: any, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

function parseBearerSessionId(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  const v = authHeader.replace('Bearer ', '').trim();
  return v || null;
}

async function requireSession(env: any, sessionId: string): Promise<{ id: string; premium_until: number } | null> {
  const row = await env.DB.prepare(`SELECT id, premium_until FROM Users WHERE id = ?`).bind(sessionId).first<any>();
  if (!row) return null;
  return { id: row.id, premium_until: row.premium_until || 0 };
}

async function ensurePaymentsTable(env: any): Promise<void> {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS Payments (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      captured_at INTEGER,
      premium_until INTEGER
    )
  `).run();
}

async function getPayPalAccessToken(env: any): Promise<string> {
  const PAYPAL_CLIENT_ID = env.PAYPAL_CLIENT_ID;
  const PAYPAL_SECRET = env.PAYPAL_SECRET;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) throw new Error('PayPal not configured');

  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
  const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials'
  });
  if (!tokenRes.ok) throw new Error('Payment gateway authentication failed');
  const tokenData = await tokenRes.json() as any;
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error('Payment gateway authentication failed');
  return accessToken;
}

function extractCompletedAmount(data: any): { currency: string; value: string } | null {
  const pu = data?.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  const amount = cap?.amount;
  if (!amount?.currency_code || !amount?.value) return null;
  return { currency: amount.currency_code, value: amount.value };
}

function valueToCents(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function createPayPalOrder(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const sessionId = parseBearerSessionId(request);
    if (!sessionId) return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);

    const sessionData = await requireSession(env, sessionId);
    if (!sessionData) return jsonResponse({ success: false, error: 'Invalid session' }, 401, corsHeaders);

    const { planId } = await request.json() as { planId: Plan['id'] };
    const plan = (planId && PLANS[planId]) ? PLANS[planId] : null;
    if (!plan) return jsonResponse({ success: false, error: 'Invalid plan' }, 400, corsHeaders);

    await ensurePaymentsTable(env);

    const accessToken = await getPayPalAccessToken(env);
    const orderRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: plan.currency, value: plan.amountValue },
          description: plan.description
        }]
      })
    });

    const orderData = await orderRes.json() as any;
    const orderID = orderData?.id;
    if (!orderRes.ok || !orderID) {
      return jsonResponse({ success: false, error: 'Failed to create order' }, 400, corsHeaders);
    }

    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO Payments (order_id, user_id, plan_id, amount_cents, currency, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        user_id = excluded.user_id,
        plan_id = excluded.plan_id,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = excluded.status,
        created_at = excluded.created_at
    `).bind(orderID, sessionData.id, plan.id, plan.amountCents, plan.currency, 'CREATED', now).run();

    return jsonResponse({ success: true, orderID }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ success: false, error: e?.message || 'Server error' }, 500, corsHeaders);
  }
}

export async function capturePayPalOrder(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const sessionId = parseBearerSessionId(request);
    if (!sessionId) return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);

    const sessionData = await requireSession(env, sessionId);
    if (!sessionData) return jsonResponse({ success: false, error: 'Invalid session' }, 401, corsHeaders);

    const { orderID, planId } = await request.json() as { orderID: string; planId: Plan['id'] };
    if (!orderID) return jsonResponse({ success: false, error: 'Missing orderID' }, 400, corsHeaders);
    const plan = (planId && PLANS[planId]) ? PLANS[planId] : null;
    if (!plan) return jsonResponse({ success: false, error: 'Invalid plan' }, 400, corsHeaders);

    await ensurePaymentsTable(env);

    const existing = await env.DB.prepare(`SELECT order_id, user_id, status, premium_until FROM Payments WHERE order_id = ?`).bind(orderID).first<any>();
    if (existing && existing.user_id && existing.user_id !== sessionData.id) {
      return jsonResponse({ success: false, error: 'Order belongs to another user' }, 409, corsHeaders);
    }
    if (existing?.status === 'COMPLETED' && existing?.premium_until) {
      return jsonResponse({ success: true, premium_until: existing.premium_until }, 200, corsHeaders);
    }

    const accessToken = await getPayPalAccessToken(env);

    const now = Date.now();
    let completedData: any | null = null;

    const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const captureData = await captureRes.json().catch(() => null) as any;
    if (captureRes.ok && captureData?.status === 'COMPLETED') {
      completedData = captureData;
    } else {
      const orderRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const orderData = await orderRes.json().catch(() => null) as any;
      if (orderRes.ok && orderData?.status === 'COMPLETED') {
        completedData = orderData;
      } else {
        return jsonResponse({ success: false, error: 'Payment not completed' }, 400, corsHeaders);
      }
    }

    const paid = extractCompletedAmount(completedData);
    const paidCents = paid?.value ? valueToCents(paid.value) : null;
    if (!paid || paid.currency !== plan.currency || paidCents !== plan.amountCents) {
      return jsonResponse({ success: false, error: 'Payment amount mismatch' }, 400, corsHeaders);
    }

    const currentPremium = sessionData.premium_until || 0;
    const addMs = plan.days * 24 * 60 * 60 * 1000;
    const premiumUntil = (currentPremium > now ? currentPremium : now) + addMs;

    await env.DB.prepare(`UPDATE Users SET premium_until = ? WHERE id = ?`).bind(premiumUntil, sessionData.id).run();

    await env.DB.prepare(`
      INSERT INTO Payments (order_id, user_id, plan_id, amount_cents, currency, status, created_at, captured_at, premium_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        user_id = excluded.user_id,
        plan_id = excluded.plan_id,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = excluded.status,
        captured_at = excluded.captured_at,
        premium_until = excluded.premium_until
    `).bind(orderID, sessionData.id, plan.id, plan.amountCents, plan.currency, 'COMPLETED', now, now, premiumUntil).run();

    return jsonResponse({ success: true, premium_until: premiumUntil }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ success: false, error: e?.message || 'Server error' }, 500, corsHeaders);
  }
}
