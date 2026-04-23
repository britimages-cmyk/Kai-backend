// api/drive.js — Google Drive folder scanner for Kai meeting notes
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const access_token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.access_token;
  if (!access_token) return res.status(401).json({ error: 'No access token' });

  const { action, folderId, fileId } = req.query;

  try {
    // ── LIST ROOT KAI FOLDER ──
    if (action === 'find_root') {
      // Find "Kai Meeting Notes" folder in root Drive
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='~Kai Meeting Notes' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
        { headers: { Authorization: 'Bearer ' + access_token } }
      );
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      return res.json({ folders: data.files || [] });
    }

    // ── LIST SUBFOLDERS (board folders) ──
    if (action === 'list_folders' && folderId) {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
        { headers: { Authorization: 'Bearer ' + access_token } }
      );
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      return res.json({ folders: data.files || [] });
    }

    // ── LIST FILES IN A FOLDER ──
    if (action === 'list_files' && folderId) {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=20`,
        { headers: { Authorization: 'Bearer ' + access_token } }
      );
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      return res.json({ files: data.files || [] });
    }

    // ── READ FILE CONTENT ──
    if (action === 'read_file' && fileId) {
      // First get file metadata to check mime type
      const metaR = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
        { headers: { Authorization: 'Bearer ' + access_token } }
      );
      const meta = await metaR.json();
      if (meta.error) throw new Error(meta.error.message);

      let content = '';

      if (meta.mimeType === 'application/vnd.google-apps.document') {
        // Export Google Doc as plain text
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
          { headers: { Authorization: 'Bearer ' + access_token } }
        );
        content = await r.text();
      } else if (meta.mimeType === 'text/plain' || meta.mimeType === 'text/markdown') {
        // Download plain text / markdown directly
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: 'Bearer ' + access_token } }
        );
        content = await r.text();
      } else if (meta.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Export Word doc as plain text
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
          { headers: { Authorization: 'Bearer ' + access_token } }
        );
        content = await r.text();
      } else {
        content = `[File type ${meta.mimeType} — text extraction not supported. Please use Google Docs, .txt, or .md files for best results.]`;
      }

      // Truncate to 8000 chars to stay within AI context limits
      if (content.length > 8000) content = content.slice(0, 8000) + '\n\n[... truncated for length]';

      return res.json({ 
        id: fileId, 
        name: meta.name, 
        mimeType: meta.mimeType,
        content 
      });
    }

    res.status(400).json({ error: 'Invalid action' });

  } catch (err) {
    console.error('Drive error:', err);
    res.status(500).json({ error: err.message });
  }
};
