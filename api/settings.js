const { sql, initDB, getUserId, cors } = require('../_utils');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await initDB();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié.' });

    await sql`INSERT INTO settings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM settings WHERE user_id=${userId}`;
      return res.status(200).json(rows[0] || {});
    }

    if (req.method === 'POST') {
      const { start_capital, assets } = req.body || {};
      await sql`
        UPDATE settings SET
          start_capital = COALESCE(${start_capital !== undefined ? start_capital : null}, start_capital),
          assets = COALESCE(${assets ? JSON.stringify(assets) : null}::jsonb, assets)
        WHERE user_id=${userId}
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
