module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, state: accountId, error } = req.query;
  if (error) { return res.status(400).send('OAuth error: ' + error); }

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.REDIRECT_URI;
  const KAI_URL       = process.env.KAI_URL;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }).toString(),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const profile = await profileRes.json();

    const params = new URLSearchParams({
      accountId: accountId || 'work',
      email:         profile.email || '',
      name:          profile.name  || profile.email || '',
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      expires_in:    String(tokens.expires_in || 3600),
    });

    res.redirect(302, KAI_URL + '#gmail_auth=' + encodeURIComponent(params.toString()));

  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Error: ' + err.message);
  }
};
