const { sql, initDB, createToken, hashPassword, cors } = require('./_utils');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await initDB();
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
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
