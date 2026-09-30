// get-sms-contacts.js
// Returns all SMS contacts from Supabase, or updates a single contact's status.
// Called by the admin panel only — protected by ADMIN_SECRET / client-side PASS.
//
// POST body options:
//   { password, action: 'list' }                          → returns all contacts
//   { password, action: 'update', phone, status }         → updates status for one contact
//   { password }                                          → same as action: 'list'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  try {
    const { password, action, phone, status } = JSON.parse(event.body || '{}');

    // Verify admin password
    if (ADMIN_SECRET && password !== ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    };

    // ── UPDATE a single contact's status ──────────────────────────
    if (action === 'update') {
      if (!phone || !['active', 'opted_out'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing phone or status' }) };
      }

      const patch = { status };
      if (status === 'opted_out') patch.opted_out_at = new Date().toISOString();
      if (status === 'active')    patch.opted_out_at = null;

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/sms_contacts?phone=eq.${encodeURIComponent(phone)}`,
        { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify(patch) }
      );
      const result = await res.json();
      if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: 'Update failed' }) };
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, contact: result[0] }) };
    }

    // ── LIST all contacts (default) ───────────────────────────────
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_contacts?select=*&order=opted_in_at.desc`,
      { method: 'GET', headers }
    );
    const contacts = await res.json();
    if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: 'Fetch failed' }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts })
    };

  } catch (err) {
    console.error('get-sms-contacts error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
