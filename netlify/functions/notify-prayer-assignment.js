// ============================================================
//  Netlify Function: notify-prayer-assignment.js
//  Location: netlify/functions/notify-prayer-assignment.js
//
//  Emails a prayer team member when a request is assigned to
//  them — same Resend service/pattern as notify-rental.js and
//  notify-prayer.js. No new environment variables needed if
//  those are already configured.
// ============================================================
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { to, assigneeName, requestName, contact, details, confidential, submittedAt } = data;

  if (!to || !assigneeName || !requestName || !details) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.FROM_EMAIL || 'Messiah UMC <onboarding@resend.dev>';

  const subject = `Prayer Request Assigned to You — ${requestName}`;
  const bodyHtml = `
    <p>Hi ${assigneeName},</p>
    <p>A prayer request has been assigned to you:</p>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Name:</td><td style="padding:4px 0;">${requestName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Contact:</td><td style="padding:4px 0;">${contact || ''}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold; vertical-align:top;">Request:</td><td style="padding:4px 0;">${details}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Confidential:</td><td style="padding:4px 0;">${confidential ? 'Yes — handle discreetly' : 'No'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Submitted:</td><td style="padding:4px 0;">${submittedAt || ''}</td></tr>
    </table>
    <p>Log in to the prayer dashboard to view, mark complete, or reassign this request.</p>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [to],
        subject: subject,
        html: bodyHtml
      })
    });

    const result = await res.json();
    console.log('Resend response:', JSON.stringify(result));

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: result }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, id: result.id }) };

  } catch (err) {
    console.error('Email send error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
