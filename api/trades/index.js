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
      const trades = await sql`SELECT * FROM trades WHERE user_id = ${userId} ORDER BY date DESC`;
      return res.status(200).json(trades.map(t => ({ ...t, exit: t.exit_price })));
    }

    if (req.method === 'POST') {
      const t = req.body || {};
      await sql`
        INSERT INTO trades (id, user_id, date, asset, market, direction,
          entry, exit_price, size, lots, spread, pnl, sl, tp, rr, result,
          emotions, notes, bilan, errors, lesson, screenshot)
        VALUES (${t.id}, ${userId}, ${t.date}, ${t.asset}, ${t.market}, ${t.direction},
          ${t.entry||0}, ${t.exit||0}, ${t.size||0}, ${t.lots||null}, ${t.spread||0}, ${t.pnl||0},
          ${t.sl||0}, ${t.tp||0}, ${t.rr||null}, ${t.result},
          ${JSON.stringify(t.emotions||[])}, ${t.notes||''}, ${t.bilan||''},
          ${t.errors||''}, ${t.lesson||''}, ${t.screenshot||''})
        ON CONFLICT (id, user_id) DO UPDATE SET
          date=EXCLUDED.date, asset=EXCLUDED.asset, market=EXCLUDED.market,
          direction=EXCLUDED.direction, entry=EXCLUDED.entry, exit_price=EXCLUDED.exit_price,
          size=EXCLUDED.size, lots=EXCLUDED.lots, spread=EXCLUDED.spread, pnl=EXCLUDED.pnl,
          sl=EXCLUDED.sl, tp=EXCLUDED.tp, rr=EXCLUDED.rr, result=EXCLUDED.result,
          emotions=EXCLUDED.emotions, notes=EXCLUDED.notes, bilan=EXCLUDED.bilan,
          errors=EXCLUDED.errors, lesson=EXCLUDED.lesson, screenshot=EXCLUDED.screenshot
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
