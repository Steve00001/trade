const { sql, initDB, getUserId, cors } = require('../../_utils');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await initDB();
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié.' });

    if (req.method === 'DELETE') {
      const id = req.query.id;
      await sql`DELETE FROM trades WHERE id=${id} AND user_id=${userId}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
