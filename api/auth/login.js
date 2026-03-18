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
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

    const users = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
    if (!users.length) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

    const user = users[0];
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const token = createToken(user.id, user.email);
    return res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name || '' } });
  } catch(err) {
    console.error('login error:', err);
    return res.status(500).json({ error: err.message });
  }
};
