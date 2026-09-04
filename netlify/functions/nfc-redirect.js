const SUPABASE_URL = 'https://qxlssbpjspkhgtcixqgx.supabase.co';

function text(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body
  };
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store'
    },
    body: ''
  };
}

async function sb(path, options = {}) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is missing.');

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      ...(options.headers || {})
    }
  });
}

function getTagCode(event) {
  const fromQuery = event.queryStringParameters?.tag;
  if (fromQuery) return String(fromQuery).trim().toUpperCase();

  // Also supports a future direct path such as /tap/MUMC-001 if passed through.
  const path = String(event.path || '');
  const match = path.match(/\/tap\/(MUMC-\d{3,})\/?$/i);
  return match ? match[1].toUpperCase() : '';
}

function validDestination(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return text(405, 'Method not allowed.');
  }

  const tagCode = getTagCode(event);
  if (!/^MUMC-\d{3,}$/.test(tagCode)) {
    return text(400, 'Invalid tap tag.');
  }

  try {
    const tagsRes = await sb(
      `nfc_tags?select=id,tag_code,destination_url,status&tag_code=eq.${encodeURIComponent(tagCode)}&limit=1`
    );

    if (!tagsRes.ok) {
      console.error('NFC lookup failed:', tagsRes.status, await tagsRes.text());
      return text(500, 'Unable to process this tap right now.');
    }

    const rows = await tagsRes.json();
    const tag = rows[0];

    if (!tag) {
      return text(404, 'Tap tag not found.');
    }

    if (tag.status !== 'active') {
      return text(410, 'This tap tag is currently inactive.');
    }

    if (!validDestination(tag.destination_url)) {
      console.error('Invalid NFC destination for', tagCode);
      return text(500, 'This tap tag is not configured correctly.');
    }

    // Log the tap. A logging failure should not stop a visitor from reaching the destination.
    try {
      const tapRes = await sb('nfc_taps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          tag_id: tag.id,
          user_agent: event.headers['user-agent'] || event.headers['User-Agent'] || null,
          referrer: event.headers.referer || event.headers.referrer || null
        })
      });

      if (!tapRes.ok) {
        console.error('NFC tap log failed:', tapRes.status, await tapRes.text());
      }
    } catch (logError) {
      console.error('NFC tap logging error:', logError);
    }

    return redirect(tag.destination_url);
  } catch (error) {
    console.error('NFC redirect function error:', error);
    return text(500, 'Unable to process this tap right now.');
  }
};
