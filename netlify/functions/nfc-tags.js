const crypto = require('crypto');

const SUPABASE_URL = 'https://qxlssbpjspkhgtcixqgx.supabase.co';

// ------------------------------------------------------------
// Validate Messiah Admin session cookie
// ------------------------------------------------------------
function isValidSession(event) {
  const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;

  if (!sessionSecret) {
    return false;
  }

  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';

  const match = cookieHeader.match(
    /(?:^|;\s*)messiah_admin_session=([^;]+)/
  );

  if (!match) {
    return false;
  }

  const token = match[1];
  const parts = token.split('.');

  if (parts.length !== 2) {
    return false;
  }

  const [timestamp, suppliedSignature] = parts;

  const createdAt = Number(timestamp);

  if (!Number.isFinite(createdAt)) {
    return false;
  }

  // Session expires after 8 hours
  const eightHours = 8 * 60 * 60 * 1000;

  if (Date.now() - createdAt > eightHours) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', sessionSecret)
    .update(timestamp)
    .digest('hex');

  try {
    const suppliedBuffer = Buffer.from(suppliedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (suppliedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    );

  } catch {
    return false;
  }
}


// ------------------------------------------------------------
// Netlify Function
// ------------------------------------------------------------
exports.handler = async function(event) {

  // Require a valid admin login
  if (!isValidSession(event)) {
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        message: 'Unauthorized'
      })
    };
  }

  // For now, this first version only reads tags
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        message: 'Method not allowed'
      })
    };
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    console.error('SUPABASE_SECRET_KEY is missing.');

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        message: 'Server configuration error'
      })
    };
  }

  try {

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/nfc_tags?select=*&order=tag_code.asc`,
      {
        headers: {
          'apikey': secretKey
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        'Supabase NFC tag error:',
        response.status,
        errorText
      );

      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          message: 'Unable to load NFC tags'
        })
      };
    }

    const tags = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        tags
      })
    };

  } catch (error) {

    console.error('NFC tags function error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        message: 'Unable to load NFC tags'
      })
    };
  }
};
