const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NETLIFY_DATABASE_URL);

// ===== INIT DB — crée les tables si elles n'existent pas =====
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id BIGINT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
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
      emotions JSONB,
      notes TEXT,
      bilan TEXT,
      errors TEXT,
      lesson TEXT,
      screenshot TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY DEFAULT 'default',
      start_capital FLOAT DEFAULT 0,
      pwd_hash TEXT DEFAULT '',
      assets JSONB DEFAULT '[]'
    )
  `;

  await sql`
    INSERT INTO settings (user_id) VALUES ('default')
    ON CONFLICT (user_id) DO NOTHING
  `;
}

// ===== ROUTER =====
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    await initDB();

    const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '');
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    // ===== TRADES =====
    if (path === '/trades' && method === 'GET') {
      const trades = await sql`
        SELECT * FROM trades WHERE user_id = 'default' ORDER BY date DESC
      `;
      // Rename exit_price back to exit for frontend compatibility
      const mapped = trades.map(t => ({ ...t, exit: t.exit_price }));
      return { statusCode: 200, headers, body: JSON.stringify(mapped) };
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
          ${t.id}, 'default', ${t.date}, ${t.asset}, ${t.market}, ${t.direction},
          ${t.entry || 0}, ${t.exit || 0}, ${t.size || 0}, ${t.lots || null}, ${t.spread || 0}, ${t.pnl || 0},
          ${t.sl || 0}, ${t.tp || 0}, ${t.rr || null}, ${t.result},
          ${JSON.stringify(t.emotions || [])}, ${t.notes || ''},
          ${t.bilan || ''}, ${t.errors || ''}, ${t.lesson || ''},
          ${t.screenshot || ''}
        )
        ON CONFLICT (id) DO UPDATE SET
          date = EXCLUDED.date, asset = EXCLUDED.asset, market = EXCLUDED.market,
          direction = EXCLUDED.direction, entry = EXCLUDED.entry,
          exit_price = EXCLUDED.exit_price, size = EXCLUDED.size,
          lots = EXCLUDED.lots, spread = EXCLUDED.spread, pnl = EXCLUDED.pnl,
          sl = EXCLUDED.sl, tp = EXCLUDED.tp, rr = EXCLUDED.rr,
          result = EXCLUDED.result, emotions = EXCLUDED.emotions,
          notes = EXCLUDED.notes, bilan = EXCLUDED.bilan,
          errors = EXCLUDED.errors, lesson = EXCLUDED.lesson,
          screenshot = EXCLUDED.screenshot
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (path.startsWith('/trades/') && method === 'DELETE') {
      const id = path.split('/')[2];
      await sql`DELETE FROM trades WHERE id = ${id} AND user_id = 'default'`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ===== SETTINGS =====
    if (path === '/settings' && method === 'GET') {
      const rows = await sql`SELECT * FROM settings WHERE user_id = 'default'`;
      return { statusCode: 200, headers, body: JSON.stringify(rows[0] || {}) };
    }

    if (path === '/settings' && method === 'POST') {
      const { start_capital, pwd_hash, assets } = body;
      await sql`
        UPDATE settings SET
          start_capital = COALESCE(${start_capital}, start_capital),
          pwd_hash = COALESCE(${pwd_hash}, pwd_hash),
          assets = COALESCE(${assets ? JSON.stringify(assets) : null}::jsonb, assets)
        WHERE user_id = 'default'
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Route not found' }) };

  } catch (err) {
    console.error('API Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
