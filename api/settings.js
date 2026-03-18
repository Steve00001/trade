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
    if (data.exp && Date.now() > data.exp) return null; // expired
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

    await sql`CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, start_capital FLOAT DEFAULT 0, assets JSONB DEFAULT '[]')`;
    await sql`INSERT INTO settings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM settings WHERE user_id=${userId}`;
      return res.status(200).json(rows[0] || {});
    }
    if (req.method === 'POST') {
      const { start_capital, assets } = req.body || {};
      await sql`UPDATE settings SET start_capital = COALESCE(${start_capital !== undefined ? start_capital : null}, start_capital), assets = COALESCE(${assets ? JSON.stringify(assets) : null}::jsonb, assets) WHERE user_id=${userId}`;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch(err) {
    console.error('settings error:', err);
    return res.status(500).json({ error: err.message });
  }
};
