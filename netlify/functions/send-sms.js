// send-sms.js
// Sends order-ready notification — ONLY to approved customers
// Called from Hank's admin panel Send Notification button

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { password, to, body, ticket } = JSON.parse(event.body);

    if (password !== ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const cleanPhone = to.replace(/\D/g, '');
    const e164Phone  = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    // CRITICAL: Verify customer is on approved list before sending
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_contacts?phone=eq.${encodeURIComponent(e164Phone)}&status=eq.approved&select=id,customer_name`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const approved = await checkRes.json();

    if (!approved.length) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'not_approved', message: 'This number has not confirmed SMS opt-in. Send an opt-in request first.' })
      };
    }

    // Send the SMS
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: TWILIO_PHONE, To: e164Phone, Body: body }).toString()
      }
    );

    const twilioData = await twilioRes.json();
    if (twilioData.error_code) {
      throw new Error(`Twilio error: ${twilioData.message}`);
    }

    // Log the sent message in database for audit trail
    await fetch(`${SUPABASE_URL}/rest/v1/sms_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        phone:      e164Phone,
        message:    body,
        ticket:     ticket || null,
        twilio_sid: twilioData.sid,
        sent_at:    new Date().toISOString(),
        status:     'sent'
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sid: twilioData.sid })
    };

  } catch (err) {
    console.error('send-sms error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
