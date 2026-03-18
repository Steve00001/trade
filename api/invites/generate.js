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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié.' });

    // Create invites table if needed
    await sql`
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        name TEXT NOT NULL,
        used_by TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP DEFAULT NULL
      )
    `;

    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nom requis.' });

    // Generate unique 8-char code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();

    await sql`
      INSERT INTO invites (code, created_by, name)
      VALUES (${code}, ${userId}, ${name})
    `;

    return res.status(200).json({ code, name });

  } catch(err) {
    console.error('generate invite error:', err);
    return res.status(500).json({ error: err.message });
  }
};
