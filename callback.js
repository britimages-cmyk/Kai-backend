// api/callback.js — handles OAuth callback from Google
// Exchanges auth code for tokens, returns them to Kai

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, state: accountId, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.KAI_URL || 'file://'}?oauth_error=${error}`);
  }

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.REDIRECT_URI || 'https://kai-backend.vercel.app/api/callback';

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Get user email
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    // Return tokens + email to Kai via redirect with hash params
    // (hash params are not sent to server, so tokens stay client-side)
    const params = new URLSearchParams({
      accountId: accountId || 'account1',
      email:         profile.email,
      name:          profile.name || profile.email,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      expires_in:    tokens.expires_in || 3600,
    });

    // Redirect back to Kai with tokens in hash
    const kaiUrl = process.env.KAI_URL || 'http://localhost:3000/kai.html';
    res.redirect(302, `${kaiUrl}#gmail_auth=${encodeURIComponent(params.toString())}`);

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: err.message });
  }
}
