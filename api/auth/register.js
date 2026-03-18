const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'trading-journal-secret-2024';

function hashPassword(pwd) {
  return crypto.createHmac('sha256', JWT_SECRET).update(pwd).digest('hex');
}
function createToken(userId, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, email, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, start_capital FLOAT DEFAULT 0, assets JSONB DEFAULT '[]')`;

    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length > 0) return res.status(400).json({ error: 'Cet email est déjà utilisé.' });

    const userId = crypto.randomUUID();
    await sql`INSERT INTO users (id, email, password_hash, name) VALUES (${userId}, ${email.toLowerCase()}, ${hashPassword(password)}, ${name || ''})`;
    await sql`INSERT INTO settings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;

    const token = createToken(userId, email);
    return res.status(200).json({ token, user: { id: userId, email, name: name || '' } });
  } catch(err) {
    console.error('register error:', err);
    return res.status(500).json({ error: err.message });
  }
};
