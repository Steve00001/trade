const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'trading-journal-secret-2024';

function verifyToken(token) {
  try {
    const [header, payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
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

    await sql`CREATE TABLE IF NOT EXISTS trades (id BIGINT, user_id TEXT NOT NULL, date TEXT, asset TEXT, market TEXT, direction TEXT, entry FLOAT, exit_price FLOAT, size FLOAT, lots FLOAT, spread FLOAT, pnl FLOAT, sl FLOAT, tp FLOAT, rr FLOAT, result TEXT, emotions JSONB DEFAULT '[]', notes TEXT DEFAULT '', bilan TEXT DEFAULT '', errors TEXT DEFAULT '', lesson TEXT DEFAULT '', screenshot TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (id, user_id))`;

    if (req.method === 'GET') {
      const trades = await sql`SELECT * FROM trades WHERE user_id=${userId} ORDER BY date DESC`;
      return res.status(200).json(trades.map(t => ({ ...t, exit: t.exit_price })));
    }
    if (req.method === 'POST') {
      const t = req.body || {};
      await sql`INSERT INTO trades (id, user_id, date, asset, market, direction, entry, exit_price, size, lots, spread, pnl, sl, tp, rr, result, emotions, notes, bilan, errors, lesson, screenshot) VALUES (${t.id}, ${userId}, ${t.date}, ${t.asset}, ${t.market}, ${t.direction}, ${t.entry||0}, ${t.exit||0}, ${t.size||0}, ${t.lots||null}, ${t.spread||0}, ${t.pnl||0}, ${t.sl||0}, ${t.tp||0}, ${t.rr||null}, ${t.result}, ${JSON.stringify(t.emotions||[])}, ${t.notes||''}, ${t.bilan||''}, ${t.errors||''}, ${t.lesson||''}, ${t.screenshot||''}) ON CONFLICT (id, user_id) DO UPDATE SET date=EXCLUDED.date, asset=EXCLUDED.asset, market=EXCLUDED.market, direction=EXCLUDED.direction, entry=EXCLUDED.entry, exit_price=EXCLUDED.exit_price, size=EXCLUDED.size, lots=EXCLUDED.lots, spread=EXCLUDED.spread, pnl=EXCLUDED.pnl, sl=EXCLUDED.sl, tp=EXCLUDED.tp, rr=EXCLUDED.rr, result=EXCLUDED.result, emotions=EXCLUDED.emotions, notes=EXCLUDED.notes, bilan=EXCLUDED.bilan, errors=EXCLUDED.errors, lesson=EXCLUDED.lesson, screenshot=EXCLUDED.screenshot`;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch(err) {
    console.error('trades error:', err);
    return res.status(500).json({ error: err.message });
  }
};
