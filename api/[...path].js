const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id BIGINT,
      user_id TEXT NOT NULL,
      date TEXT,
      asset TEXT,
      market TEXT,
      direction TEXT,
      entry FLOAT,
      exit_price FLOAT,
      size FLOAT,
      lots FLOAT,
      spread FLOAT,
      pnl FLOAT,
      sl FLOAT,
      tp FLOAT,
      rr FLOAT,
      result TEXT,
      emotions JSONB DEFAULT '[]',
      notes TEXT DEFAULT '',
      bilan TEXT DEFAULT '',
      errors TEXT DEFAULT '',
      lesson TEXT DEFAULT '',
      screenshot TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      start_capital FLOAT DEFAULT 0,
      assets JSONB DEFAULT '[]'
    )
  `;
}

function getUserId(req) {
  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return 'anonymous';
    const token = auth.split(' ')[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub || 'anonymous';
  } catch(e) {
    return 'anonymous';
  }
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await initDB();

    const userId = getUserId(req);
    const path = req.url.replace(/^\/api/, '').split('?')[0];
    const method = req.method;
    const body = req.body || {};

    // Ensure settings row exists
    await sql`
      INSERT INTO settings (user_id) VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `;

    // ===== TRADES =====
    if (path === '/trades' && method === 'GET') {
      const trades = await sql`
        SELECT * FROM trades WHERE user_id = ${userId} ORDER BY date DESC
      `;
      const mapped = trades.map(t => ({ ...t, exit: t.exit_price }));
      return res.status(200).json(mapped);
    }

    if (path === '/trades' && method === 'POST') {
      const t = body;
      await sql`
        INSERT INTO trades (
          id, user_id, date, asset, market, direction,
          entry, exit_price, size, lots, spread, pnl,
          sl, tp, rr, result, emotions, notes, bilan,
          errors, lesson, screenshot
        ) VALUES (
          ${t.id}, ${userId}, ${t.date}, ${t.asset}, ${t.market}, ${t.direction},
          ${t.entry||0}, ${t.exit||0}, ${t.size||0},
          ${t.lots||null}, ${t.spread||0}, ${t.pnl||0},
          ${t.sl||0}, ${t.tp||0}, ${t.rr||null}, ${t.result},
          ${JSON.stringify(t.emotions||[])},
          ${t.notes||''}, ${t.bilan||''},
          ${t.errors||''}, ${t.lesson||''},
          ${t.screenshot||''}
        )
        ON CONFLICT (id, user_id) DO UPDATE SET
          date=EXCLUDED.date, asset=EXCLUDED.asset, market=EXCLUDED.market,
          direction=EXCLUDED.direction, entry=EXCLUDED.entry,
          exit_price=EXCLUDED.exit_price, size=EXCLUDED.size,
          lots=EXCLUDED.lots, spread=EXCLUDED.spread, pnl=EXCLUDED.pnl,
          sl=EXCLUDED.sl, tp=EXCLUDED.tp, rr=EXCLUDED.rr,
          result=EXCLUDED.result, emotions=EXCLUDED.emotions,
          notes=EXCLUDED.notes, bilan=EXCLUDED.bilan,
          errors=EXCLUDED.errors, lesson=EXCLUDED.lesson,
          screenshot=EXCLUDED.screenshot
      `;
      return res.status(200).json({ ok: true });
    }

    if (path.startsWith('/trades/') && method === 'DELETE') {
      const id = path.split('/')[2];
      await sql`DELETE FROM trades WHERE id=${id} AND user_id=${userId}`;
      return res.status(200).json({ ok: true });
    }

    // ===== SETTINGS =====
    if (path === '/settings' && method === 'GET') {
      const rows = await sql`SELECT * FROM settings WHERE user_id=${userId}`;
      return res.status(200).json(rows[0] || {});
    }

    if (path === '/settings' && method === 'POST') {
      const { start_capital, assets } = body;
      await sql`
        UPDATE settings SET
          start_capital = COALESCE(${start_capital !== undefined ? start_capital : null}, start_capital),
          assets = COALESCE(${assets ? JSON.stringify(assets) : null}::jsonb, assets)
        WHERE user_id=${userId}
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: 'Route not found' });

  } catch(err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
