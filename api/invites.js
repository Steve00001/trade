const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'trading-journal-secret-2024';

function verifyToken(token) {
  try {
    const [header, payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch(e) { return null; }
}

function getUserId(req) {
  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return null;
    const payload = verifyToken(auth.split(' ')[1]);
    return payload ? payload.sub : null;
  } catch(e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié.' });

    // Only admin can manage invites
    const adminId = process.env.ADMIN_USER_ID;
    if (adminId && userId !== adminId) {
      return res.status(403).json({ error: 'Accès réservé à l'administrateur.' });
    }

    await sql`CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      name TEXT NOT NULL,
      used_by TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      used_at TIMESTAMP DEFAULT NULL
    )`;

    const action = req.query.action;

    // GET /api/invites?action=list
    if (req.method === 'GET' && action === 'list') {
      const invites = await sql`
        SELECT code, name, used_by, created_at, used_at
        FROM invites WHERE created_by = ${userId}
        ORDER BY created_at DESC
      `;
      return res.status(200).json(invites);
    }

    // POST /api/invites?action=generate
    if (req.method === 'POST' && action === 'generate') {
      const { name } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Nom requis.' });
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      await sql`INSERT INTO invites (code, created_by, name) VALUES (${code}, ${userId}, ${name})`;
      return res.status(200).json({ code, name });
    }

    // POST /api/invites?action=revoke
    if (req.method === 'POST' && action === 'revoke') {
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ error: 'Code requis.' });
      await sql`DELETE FROM invites WHERE code = ${code} AND created_by = ${userId} AND used_by IS NULL`;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action invalide.' });

  } catch(err) {
    console.error('invites error:', err);
    return res.status(500).json({ error: err.message });
  }
};
