// get-sms-contacts.js
// Returns all SMS contacts for the Hank's admin panel

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { password } = JSON.parse(event.body);

    if (password !== ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_contacts?order=created_at.desc&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const contacts = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts })
    };

  } catch (err) {
    console.error('get-sms-contacts error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
