const crypto = require('crypto');
const { sql, initDB, createToken, hashPassword, cors } = require('./_utils');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await initDB();
    const { email, password, name } = req.body || {};

    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min).' });

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length > 0) return res.status(400).json({ error: 'Cet email est déjà utilisé.' });

    const userId = crypto.randomUUID();
    await sql`INSERT INTO users (id, email, password_hash, name) VALUES (${userId}, ${email.toLowerCase()}, ${hashPassword(password)}, ${name || ''})`;
    await sql`INSERT INTO settings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;

    const token = createToken(userId, email);
    return res.status(200).json({ token, user: { id: userId, email, name: name || '' } });

  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
