// ============================================================
//  Netlify Function: notify-prayer.js
//  Location: netlify/functions/notify-prayer.js
//
//  Sends a new-prayer-request email to Messiah's office using
//  Resend — same service and pattern as notify-rental.js.
//
//  Environment variables needed (same ones notify-rental.js
//  already uses — no new setup required if that's configured):
//    RESEND_API_KEY   → your Resend API key
//    FROM_EMAIL       → e.g. "Messiah UMC <rentals@messiahmethodistchurch.com>"
//                        (must match a verified domain in Resend)
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

  const { to, name, contact, details, confidential, submittedAt } = data;

  if (!to || !name || !details) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.FROM_EMAIL || 'Messiah UMC <onboarding@resend.dev>';

  const subject = confidential
    ? `New CONFIDENTIAL Prayer Request`
    : `New Prayer Request — ${name}`;

  const bodyHtml = `
    <p>A new prayer request just came in through the website:</p>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Name:</td><td style="padding:4px 0;">${name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Contact:</td><td style="padding:4px 0;">${contact || ''}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold; vertical-align:top;">Request:</td><td style="padding:4px 0;">${details}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Confidential:</td><td style="padding:4px 0;">${confidential ? 'Yes — handle discreetly' : 'No'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; font-weight:bold;">Submitted:</td><td style="padding:4px 0;">${submittedAt || ''}</td></tr>
    </table>
    <p>Log in to the prayer dashboard to review, mark complete, or remove this request once it's been prayed over.</p>
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
