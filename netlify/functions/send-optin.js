// send-optin.js
// Sends a double opt-in confirmation text to a new customer
// Called from Hank's admin panel when staff adds a new number

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ADMIN_SECRET    = process.env.ADMIN_SECRET;
  const TWILIO_SID      = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_PHONE    = process.env.TWILIO_PHONE_NUMBER;
  const SUPABASE_URL    = process.env.SUPABASE_URL;
  const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { password, phone, customerName } = JSON.parse(event.body);

    if (password !== ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    if (!phone) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Phone number required' }) };
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    const e164Phone  = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    // Check if already in database
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_contacts?phone=eq.${encodeURIComponent(e164Phone)}&select=id,status`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const existing = await checkRes.json();

    if (existing.length && existing[0].status === 'approved') {
      return { statusCode: 200, body: JSON.stringify({ success: true, status: 'already_approved', message: 'Customer already approved' }) };
    }

    // Send opt-in text via Twilio
    const msg = `Hi! Hank's Cleaners would like to text you when your order is ready for pickup. Reply YES to confirm. Msg & data rates may apply. Reply STOP to cancel.`;

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: TWILIO_PHONE, To: e164Phone, Body: msg }).toString()
      }
    );

    const twilioData = await twilioRes.json();
    if (twilioData.error_code) {
      throw new Error(`Twilio error: ${twilioData.message}`);
    }

    // Upsert into sms_contacts as pending
    const sbHeaders = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    };

    await fetch(`${SUPABASE_URL}/rest/v1/sms_contacts`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        phone:          e164Phone,
        customer_name:  customerName || null,
        status:         'pending',
        optin_sent_at:  new Date().toISOString(),
        twilio_sid:     twilioData.sid
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, status: 'pending', message: `Opt-in text sent to ${e164Phone}` })
    };

  } catch (err) {
    console.error('send-optin error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
