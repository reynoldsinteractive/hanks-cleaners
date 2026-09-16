// sms-webhook.js
// Twilio calls this endpoint when a customer replies to a text
// Records YES (approved) or STOP (opted_out) in the database
// Configure in Twilio: Messaging Service → Webhook URL → /.netlify/functions/sms-webhook

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    // Parse Twilio webhook body
    const params = new URLSearchParams(event.body);
    const from   = params.get('From');  // Customer's phone
    const body   = (params.get('Body') || '').trim().toUpperCase();

    if (!from) {
      return { statusCode: 400, body: 'Missing From field' };
    }

    const sbHeaders = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };

    let replyMsg = null;

    if (body === 'YES' || body === 'Y') {
      // Customer opted in
      await fetch(`${SUPABASE_URL}/rest/v1/sms_contacts?phone=eq.${encodeURIComponent(from)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({
          status:      'approved',
          opted_in_at: new Date().toISOString()
        })
      });

      replyMsg = "You're confirmed! Hank's Cleaners will text you when your order is ready. Reply STOP anytime to cancel.";

    } else if (body === 'STOP' || body === 'UNSUBSCRIBE' || body === 'CANCEL' || body === 'END' || body === 'QUIT') {
      // Customer opted out — Twilio handles STOP automatically but we also record it
      await fetch(`${SUPABASE_URL}/rest/v1/sms_contacts?phone=eq.${encodeURIComponent(from)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({
          status:        'opted_out',
          opted_out_at:  new Date().toISOString()
        })
      });
      // No reply needed — Twilio sends its own STOP confirmation

    } else if (body === 'HELP') {
      replyMsg = "Hank's Cleaners: Text notifications for order-ready alerts. Reply STOP to cancel. Questions? Call (847) 688-0036 or visit hankscleanersnc.com";
    }

    // Send reply if needed
    if (replyMsg) {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ From: TWILIO_PHONE, To: from, Body: replyMsg }).toString()
        }
      );
    }

    // Return empty TwiML response to Twilio
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    };

  } catch (err) {
    console.error('sms-webhook error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
