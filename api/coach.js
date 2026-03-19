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

function callGemini(contents, systemPrompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('Pas de reponse de Gemini'));
          resolve(text);
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
    if (!userId) return res.status(401).json({ error: 'Non authentifie.' });

    const { message, history, stats, trades } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message requis.' });

    const systemPrompt = `Tu es un coach de trading professionnel et bienveillant integre dans le journal de trading personnel de l'utilisateur. Tu as acces a ses vraies donnees de trading.

DONNEES DE L'UTILISATEUR :
- Win Rate : ${stats?.wr || 0}%
- PnL Total : ${stats?.totalPnl || 0}$
- Nombre de trades : ${stats?.tradeCount || 0}
- RR Realise Moyen : ${stats?.avgRR || 'Non disponible'}
- Emotion dominante : ${stats?.topEmotion || 'Non renseignee'}
- Capital actuel : ${stats?.capital || 0}$
- Marches : ${stats?.markets || 'Non renseignes'}

DERNIERS TRADES :
${trades ? trades.slice(0, 10).map(t =>
  `- ${t.date} | ${t.asset} | ${t.direction} | PnL: ${t.pnl}$ | ${t.result} | Emotions: ${(t.emotions||[]).join(', ')||'aucune'}`
).join('\n') : 'Aucun trade'}

REGLES :
- Reponds toujours en francais
- Sois direct, honnete et bienveillant
- Base tes conseils sur les VRAIES donnees ci-dessus
- Si l'utilisateur mentionne un trade sans SL, rappelle fermement l'importance du SL
- Maximum 3-4 paragraphes par reponse
- Tu t'appelles "Coach" dans tes reponses`;

    // Convert history to Gemini format
    const contents = [
      ...(history || []).map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const response = await callGemini(contents, systemPrompt);
    return res.status(200).json({ response });

  } catch(err) {
    console.error('coach error:', err);
    return res.status(500).json({ error: err.message });
  }
};
