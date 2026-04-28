import { sendFeedbackEmail } from '../services/mailer';

export async function handleContactEmail(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const { message } = await request.json() as { message: string };
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    let senderEmail = 'anonymous@webworms.com';
    let senderName = 'Anonymous Player';

    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await env.DB.prepare('SELECT username, email FROM Users WHERE id = ?').bind(token).first<any>();
      if (user) {
        senderName = user.username as string;
        senderEmail = user.email as string;
      }
    }

    const sendRes = await sendFeedbackEmail(env, { senderEmail, senderName, message });
    if (!sendRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to send via ${sendRes.provider}`, details: sendRes.details }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

