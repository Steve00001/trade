const https = require('https');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'trading-journal-secret-2024';

function verifyToken(token) {
  try {
    const [header, payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp && Date.now() > data.exp) return null;
    return data;
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

function callAnthropic(messages, system) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.content[0].text);
        } catch(e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié.' });

    const { message, history, stats, trades } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message requis.' });

    // Build system prompt with user trading data
    const systemPrompt = `Tu es un coach de trading professionnel et bienveillant intégré dans le journal de trading personnel de l'utilisateur. Tu as accès à ses vraies données de trading.

DONNÉES DE L'UTILISATEUR :
- Win Rate : ${stats?.wr || 0}%
- PnL Total : ${stats?.totalPnl || 0}$
- Nombre de trades : ${stats?.tradeCount || 0}
- RR Réalisé Moyen : ${stats?.avgRR || '—'}
- Émotion dominante : ${stats?.topEmotion || 'Non renseignée'}
- Capital actuel : ${stats?.capital || 0}$
- Marchés : ${stats?.markets || 'Non renseignés'}

DERNIERS TRADES :
${trades ? trades.slice(0, 10).map(t => 
  `- ${t.date} | ${t.asset} | ${t.direction} | PnL: ${t.pnl}$ | ${t.result} | Émotions: ${(t.emotions||[]).join(', ')||'—'}`
).join('\n') : 'Aucun trade'}

RÈGLES :
- Réponds toujours en français
- Sois direct, honnête et bienveillant
- Base tes conseils sur les VRAIES données ci-dessus
- Si l'utilisateur mentionne un trade sans SL, rappelle-lui fermement l'importance du SL
- Pose des questions pour mieux comprendre sa stratégie
- Maximum 3-4 paragraphes par réponse
- Tu t'appelles "Coach" dans tes réponses`;

    // Build conversation history
    const messages = [
      ...(history || []),
      { role: 'user', content: message }
    ];

    const response = await callAnthropic(messages, systemPrompt);
    return res.status(200).json({ response });

  } catch(err) {
    console.error('coach error:', err);
    return res.status(500).json({ error: err.message });
  }
};
