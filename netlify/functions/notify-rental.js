// ============================================================
//  Netlify Function: notify-rental.js
//  Location: netlify/functions/notify-rental.js
//
//  Sends rental status emails (quoted / confirmed / denied) to
//  the requester using Resend.
//
//  Environment variables needed in Netlify dashboard:
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

  const { to, name, space, eventDate, status, quotedRate } = data;

  if (!to || !name || !space || !status) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.FROM_EMAIL || 'Messiah UMC <onboarding@resend.dev>';

  const formattedDate = eventDate
    ? new Date(eventDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  let subject, bodyHtml;

  if (status === 'quoted') {
    subject = `Your Messiah UMC Rental Quote — ${space}`;
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Thank you for your interest in renting the <strong>${space}</strong> at Messiah United Methodist Church for your event on <strong>${formattedDate}</strong>.</p>
      <p>Based on our conversation, the quoted rate for your event is:</p>
      <p style="font-size:1.4rem; font-weight:bold; color:#8B0000;">$${Number(quotedRate).toLocaleString()}</p>
      <p>If this works for you, please contact our office to confirm your reservation and arrange payment.</p>
      <p>Questions? Call the church office at (610) 828-0118.</p>
      <p>Blessings,<br>Messiah United Methodist Church</p>
    `;
  } else if (status === 'confirmed') {
    subject = `Your Messiah UMC Rental is Confirmed! — ${space}`;
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Great news! Your rental request for the <strong>${space}</strong> on <strong>${formattedDate}</strong> has been <strong>confirmed</strong>.</p>
      ${quotedRate ? `<p>Confirmed rate: <strong>$${Number(quotedRate).toLocaleString()}</strong></p>` : ''}
      <p>We look forward to hosting your event. If you have any questions or need to make changes, please call the church office at (610) 828-0118.</p>
      <p>Blessings,<br>Messiah United Methodist Church</p>
    `;
  } else if (status === 'denied') {
    subject = `Update on Your Messiah UMC Rental Request — ${space}`;
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Thank you for your interest in renting the <strong>${space}</strong> at Messiah United Methodist Church for <strong>${formattedDate}</strong>.</p>
      <p>Unfortunately, we're unable to accommodate this request at this time. We'd be happy to discuss alternative dates or spaces — please call the church office at (610) 828-0118.</p>
      <p>Blessings,<br>Messiah United Methodist Church</p>
    `;
  } else {
    return { statusCode: 400, body: 'Unknown status type' };
  }

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
