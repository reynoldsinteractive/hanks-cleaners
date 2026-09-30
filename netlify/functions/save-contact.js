// save-contact.js
// Saves an SMS opt-in submission to Supabase sms_contacts table.
// Called by sms-signup.html on form submit.
//
// Required Netlify env vars:
//   SUPABASE_URL             — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (secret)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase env vars');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  try {
    const { name, phone, sms_consent } = JSON.parse(event.body);

    if (!name || !phone) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name and phone are required' }) };
    }

    // Normalize phone to E.164
    const cleaned = phone.replace(/[^\d+]/g, '');
    const e164 = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;

    const payload = {
      name: name.trim(),
      phone: e164,
      sms_consent: sms_consent === 'yes',
      opted_in_at: new Date().toISOString(),
      status: 'active',       // active | opted_out
      source: 'web-form'
    };

    // Upsert on phone — if they re-submit, update their record
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sms_contacts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Supabase error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save contact' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error('save-contact error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
