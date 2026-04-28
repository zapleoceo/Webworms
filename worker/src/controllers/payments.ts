export async function capturePayPalOrder(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await env.DB.prepare(`SELECT id, premium_until FROM Users WHERE id = ?`).bind(sessionId).first<any>();
    if (!sessionData) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const { orderID } = await request.json() as { orderID: string };
    if (!orderID) return new Response(JSON.stringify({ error: 'Missing orderID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const PAYPAL_CLIENT_ID = env.PAYPAL_CLIENT_ID;
    const PAYPAL_SECRET = env.PAYPAL_SECRET;
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
      return new Response(JSON.stringify({ error: 'PayPal not configured' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
    const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Payment gateway authentication failed' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const tokenData = await tokenRes.json() as any;
    const accessToken = tokenData.access_token;

    const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const captureData = await captureRes.json() as any;
    if (!captureRes.ok || captureData.status !== 'COMPLETED') {
      return new Response(JSON.stringify({ error: 'Payment capture failed' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const currentPremium = sessionData.premium_until || 0;
    const now = Date.now();
    const premiumUntil = (currentPremium > now ? currentPremium : now) + sevenDaysInMs;

    await env.DB.prepare(`UPDATE Users SET premium_until = ? WHERE id = ?`).bind(premiumUntil, sessionData.id).run();

    return new Response(JSON.stringify({ success: true, premium_until: premiumUntil }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}
