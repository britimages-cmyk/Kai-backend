module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const REDIRECT_URI = process.env.REDIRECT_URI;
  const accountId = req.query.accountId || 'work';

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ');

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: accountId,
  }).toString();

  res.redirect(302, authUrl);
};module.exports = async function handler(req, res) {
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
};module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type:    'refresh_token',
      }).toString(),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    res.json({ access_token: tokens.access_token, expires_in: tokens.expires_in || 3600 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const access_token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.access_token;
  if (!access_token) return res.status(401).json({ error: 'No access token' });

  const maxResults = parseInt(req.query.maxResults || '10');
  const query = req.query.q || 'in:inbox is:unread';

  try {
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + maxResults + '&q=' + encodeURIComponent(query),
      { headers: { Authorization: 'Bearer ' + access_token } }
    );
    const listData = await listRes.json();
    if (listData.error) throw new Error(listData.error.message);

    const messages = listData.messages || [];

    const details = await Promise.all(
      messages.slice(0, 10).map(msg =>
        fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date',
          { headers: { Authorization: 'Bearer ' + access_token } }
        ).then(r => r.json())
      )
    );

    const emails = details.filter(d => !d.error).map(d => {
      const headers  = d.payload?.headers || [];
      const get      = name => (headers.find(h => h.name === name) || {}).value || '';
      const from     = get('From');
      const subject  = get('Subject') || '(no subject)';
      const snippet  = (d.snippet || '').slice(0, 120);
      const match    = from.match(/^(.+?)\s*<(.+?)>/) || [null, from, from];
      const senderName = (match[1] || from).trim().replace(/"/g, '');
      const urgent   = /urgent|asap|important|action required|deadline|invoice|payment|contract/i;
      return {
        id:      d.id,
        from:    senderName,
        subject, snippet,
        dot:     urgent.test(subject) || urgent.test(snippet) ? 'urgent' : 'info',
        unread:  (d.labelIds || []).includes('UNREAD'),
      };
    });

    res.json({ emails });
  } catch (err) {
    console.error('Gmail error:', err);
    res.status(500).json({ error: err.message });
  }
};
