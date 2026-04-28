export async function sendFeedbackEmail(env: any, params: { senderName: string; senderEmail: string; message: string }): Promise<{ ok: true } | { ok: false; provider: string; details: string }> {
  const { senderName, senderEmail, message } = params;

  const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #FF4500;">New WebWorms Feedback</h2>
        <p><strong>From:</strong> ${senderName} (${senderEmail})</p>
        <p><strong>Message:</strong></p>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${message}</div>
      </div>
    `;

  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'WebWorms Feedback <noreply@zapleo.com>',
        to: ['demoniwwwe@gmail.com'],
        subject: `WebWorms Feedback from ${senderName}`,
        html: htmlContent
      })
    });

    if (!res.ok) {
      return { ok: false, provider: 'resend', details: await res.text() };
    }

    return { ok: true };
  }

  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: 'demoniwwwe@gmail.com', name: 'Author' }] }],
      from: { email: 'noreply@webworms.pages.dev', name: 'WebWorms Game' },
      subject: `WebWorms Feedback from ${senderName}`,
      content: [{ type: 'text/html', value: htmlContent }]
    })
  });

  if (!res.ok) {
    return { ok: false, provider: 'mailchannels', details: await res.text() };
  }

  return { ok: true };
}

