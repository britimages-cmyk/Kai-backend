// api/gmail.js — fetches Gmail messages for Kai Spotlight
// Accepts access_token, returns parsed email summaries

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const access_token = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;
  if (!access_token) return res.status(401).json({ error: 'No access token' });

  const maxResults = parseInt(req.query.maxResults || '20');
  const query = req.query.q || 'in:inbox is:unread';

  try {
    // Fetch message list
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const listData = await listRes.json();
    if (listData.error) throw new Error(listData.error.message);

    const messages = listData.messages || [];

    // Fetch details for each message in parallel (up to 10)
    const details = await Promise.all(
      messages.slice(0, 10).map(msg =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        ).then(r => r.json())
      )
    );

    const emails = details
      .filter(d => !d.error)
      .map(d => {
        const headers = d.payload?.headers || [];
        const get = name => headers.find(h => h.name === name)?.value || '';
        const from = get('From');
        const subject = get('Subject') || '(no subject)';
        const date = get('Date');
        const snippet = d.snippet || '';

        // Parse sender name/email
        const senderMatch = from.match(/^(.+?)\s*<(.+?)>/) || [null, from, from];
        const senderName  = senderMatch[1]?.trim().replace(/"/g,'') || from;
        const senderEmail = senderMatch[2]?.trim() || from;

        // Basic urgency scoring
        const urgentKeywords = /urgent|asap|important|action required|immediate|deadline|invoice|payment|contract/i;
        const dot = urgentKeywords.test(subject) || urgentKeywords.test(snippet) ? 'urgent' : 'info';

        return {
          id:      d.id,
          threadId: d.threadId,
          from:    senderName,
          email:   senderEmail,
          subject,
          snippet: snippet.slice(0, 120),
          date,
          dot,
          unread:  d.labelIds?.includes('UNREAD') || false,
          labels:  d.labelIds || [],
        };
      });

    res.json({ emails, total: listData.resultSizeEstimate || emails.length });

  } catch (err) {
    console.error('Gmail fetch error:', err);
    res.status(500).json({ error: err.message });
  }
}
