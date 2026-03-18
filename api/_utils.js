const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const sql = neon(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);
const JWT_SECRET = process.env.JWT_SECRET || 'trading-journal-secret-2024';

async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id BIGINT, user_id TEXT NOT NULL,
      date TEXT, asset TEXT, market TEXT, direction TEXT,
      entry FLOAT, exit_price FLOAT, size FLOAT, lots FLOAT,
      spread FLOAT, pnl FLOAT, sl FLOAT, tp FLOAT, rr FLOAT,
      result TEXT, emotions JSONB DEFAULT '[]',
      notes TEXT DEFAULT '', bilan TEXT DEFAULT '',
      errors TEXT DEFAULT '', lesson TEXT DEFAULT '',
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

function createToken(userId, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, email, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}

function verifyToken(token) {
  try {
    const [header, payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch(e) { return null; }
}

function hashPassword(pwd) {
  return crypto.createHmac('sha256', JWT_SECRET).update(pwd).digest('hex');
}

function getUserId(req) {
  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return null;
    const payload = verifyToken(auth.split(' ')[1]);
    return payload ? payload.sub : null;
  } catch(e) { return null; }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { sql, initDB, createToken, hashPassword, getUserId, cors };
