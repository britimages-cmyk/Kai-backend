module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, state: accountId, error } = req.query;
  if (error) { return res.status(400).send('OAuth error: ' + error); }

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.REDIRECT_URI;

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

    const payload = {
      accountId: accountId || 'work',
      email:         profile.email || '',
      name:          profile.name  || profile.email || '',
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      expires_in:    tokens.expires_in || 3600,
    };

    const encoded = encodeURIComponent(new URLSearchParams(payload).toString());

    // Show a success page with a copy button — user pastes into Kai
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Kai — Gmail Connected</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0d0f14; color: #eeeef0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
  .card { background: #13161e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 500px; width: 100%; text-align: center; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #6ee7b7; }
  p { color: #9499aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
  .email { font-size: 16px; font-weight: 500; color: #eeeef0; margin-bottom: 24px; }
  button { width: 100%; padding: 14px; border-radius: 10px; border: none; background: #7b8fff; color: #fff; font-size: 15px; font-weight: 500; cursor: pointer; margin-bottom: 12px; }
  button:hover { background: #a78bfa; }
  .code-box { background: #1a1e28; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; font-size: 11px; color: #5a5f70; word-break: break-all; margin-bottom: 16px; text-align: left; max-height: 80px; overflow: hidden; }
  .steps { text-align: left; background: #1a1e28; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
  .steps p { margin: 0 0 8px; color: #9499aa; font-size: 13px; }
  .steps p:last-child { margin: 0; }
  .copied { background: #4ade80 !important; color: #0d0f14 !important; }
</style>
</head>
<body>
<div class="card">
  <h1>✓ Gmail Connected!</h1>
  <div class="email">${profile.email}</div>
  <div class="steps">
    <p>1. Click the button below to copy your connection code</p>
    <p>2. Switch back to Kai (your kai.html tab)</p>
    <p>3. Kai will automatically detect and save the connection</p>
  </div>
  <div class="code-box" id="codeBox">${encoded}</div>
  <button id="copyBtn" onclick="copyCode()">Copy connection code</button>
  <button onclick="window.close()" style="background:#222736;">Close this window</button>
</div>
<script>
  const code = '${encoded}';
  
  // Try to auto-communicate with Kai if opened in same browser
  try {
    localStorage.setItem('kai_gmail_pending', JSON.stringify({
      accountId: '${payload.accountId}',
      email: '${profile.email}',
      name: '${profile.name || profile.email}',
      access_token: '${tokens.access_token}',
      refresh_token: '${tokens.refresh_token || ''}',
      expires_in: ${tokens.expires_in || 3600},
      expires_at: Date.now() + (${tokens.expires_in || 3600} * 1000),
      connected: true,
      connectedAt: new Date().toISOString(),
      board: '${payload.accountId}',
    }));
    document.querySelector('.steps').innerHTML = '<p style="color:#6ee7b7;font-size:14px;">✓ Connection saved! Switch back to Kai and refresh the page — your Gmail will be connected automatically.</p>';
  } catch(e) {}

  function copyCode(){
    navigator.clipboard.writeText(code).then(()=>{
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
    });
  }
</script>
</body>
</html>`);

  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Error: ' + err.message);
  }
};
