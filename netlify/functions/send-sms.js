// send-sms.js
// Sends an SMS via Twilio when the admin hits Send Notification.
// Credentials are read from Netlify Environment Variables — no editing needed.
// Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER
// in Netlify → Project Configuration → Environment Variables.

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID;
  const AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
  const FROM_NUMBER   = process.env.TWILIO_PHONE_NUMBER;
  const ADMIN_SECRET  = process.env.ADMIN_SECRET;

  if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
    console.error('Missing Twilio environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  try {
    const { password, to, body } = JSON.parse(event.body);

    // Verify admin password server-side if ADMIN_SECRET is set
    if (ADMIN_SECRET && password !== ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    if (!to || !body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing to or body' }) };
    }

    // Clean the phone number — strip everything except digits and leading +
    const cleaned = to.replace(/[^\d+]/g, '');
    const toNumber = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;

    // Call Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
    const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: FROM_NUMBER.startsWith('+') ? FROM_NUMBER : `+1${FROM_NUMBER}`,
        To:   toNumber,
        Body: body
      }).toString()
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', result);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: result.message || 'Twilio send failed' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, sid: result.sid })
    };

  } catch (err) {
    console.error('send-sms error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send SMS' }) };
  }
};
