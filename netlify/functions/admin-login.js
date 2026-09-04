const crypto = require('crypto');

exports.handler = async function(event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false })
    };
  }

  try {
    const { password } = JSON.parse(event.body || '{}');

    const correctPassword = process.env.DASHBOARD_ACCESS_CODE;
    const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;

    // Make sure our required Netlify variables exist
    if (!correctPassword || !sessionSecret) {
      console.error('Dashboard environment variables are missing.');

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: 'Server configuration error.'
        })
      };
    }

    // Check the password
    if (password !== correctPassword) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          message: 'Incorrect access code.'
        })
      };
    }

    // Create a signed session token
    const timestamp = Date.now().toString();

    const signature = crypto
      .createHmac('sha256', sessionSecret)
      .update(timestamp)
      .digest('hex');

    const token = `${timestamp}.${signature}`;

    // Store the token in a secure browser cookie
    return {
      statusCode: 200,

      headers: {
        'Set-Cookie':
          `messiah_admin_session=${token}; ` +
          `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`,
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        success: true
      })
    };

  } catch (error) {
    console.error('Admin login error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Unable to process login.'
      })
    };
  }
};
