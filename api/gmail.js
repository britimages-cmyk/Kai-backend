module.exports = async function handler(req, res) {
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
