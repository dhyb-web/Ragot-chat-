// Ragot AI : la clé Gemini reste ici, côté serveur (variable GEMINI_API_KEY sur Netlify).
// Les membres du Cercle (code valide) obtiennent des réponses enrichies par la bibliothèque.
const core = require('../lib/core');
const out = (c, o) => ({ statusCode: c, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });

const handler = async (ev) => {
  if (ev.httpMethod !== 'POST') return out(405, { error: 'POST uniquement' });
  const key = (process.env.GEMINI_API_KEY || '').trim();   // enlève espaces et retours à la ligne collés par erreur
  if (!key) return out(500, { error: 'Ragot AI n’est pas encore configuré.' });
  let b;
  try { b = JSON.parse(ev.body || '{}'); } catch (e) { return out(400, { error: 'Requête invalide' }); }
  const h = b.h;
  if (!Array.isArray(h) || !h.length) return out(400, { error: 'Message vide' });
  const contents = h.slice(-20).map(m => ({ role: m.r === 'm' ? 'model' : 'user', parts: [{ text: String(m.t || '').slice(0, 4000) }] }));

  let sys = 'Tu es Ragot AI, l’assistant de la messagerie RAGOT. Réponds en français, en tutoyant la personne, de façon claire, brève et amicale. Mets le code entre ``` ```. ' +
    'Sois honnête : si tu ne sais pas ou si tu n’es pas sûr, dis-le. Donne des informations vérifiables, sans théories du complot ni « secrets cachés ».';
  const tier = b.vip ? core.tierOf(b.vip.uid, b.vip.code) : 0;
  if (tier) {
    sys += '\n\nBase de connaissances du Cercle : utilise-la en priorité quand elle répond à la question, sinon réponds avec tes connaissances générales.\n' +
      core.library.filter(x => x.t <= tier).map(x => '## ' + x.title + '\n' + x.body).join('\n\n');
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents })
    });
    const raw = await r.text();
    let j;
    try { j = JSON.parse(raw); } catch (e) { return out(502, { error: 'Réponse inattendue de l’IA (code ' + r.status + ').' }); }
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    const t = parts ? parts.map(p => p.text || '').join('') : '';
    if (!t) return out(502, { error: (j.error && j.error.message) || 'Pas de réponse de l’IA.' });
    return out(200, { t });
  } catch (e) {
    console.error('gemini:', e && e.name, e && e.code);   // le message d'erreur complet n'est jamais renvoyé : il pourrait contenir la clé
    return out(502, { error: 'Ragot AI est indisponible (' + ((e && e.name) || 'erreur') + ').' });
  }
};


// --- Adaptateur Vercel ---
module.exports = async (req, res) => {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const r = await handler({ httpMethod: req.method, body });
  res.status(r.statusCode);
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.send(r.body || '');
};
