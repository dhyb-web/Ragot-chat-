// Cercle secret : codes personnels signés, vérifiés côté serveur.
// Variables Netlify : VAULT_SECRET (longue chaîne au hasard) et OWNER_PASSWORD (ton mot de passe de maître).
const core = require('../lib/core');
const out = (s, o) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });

const handler = async (ev) => {
  if (ev.httpMethod !== 'POST') return out(405, { error: 'POST uniquement' });
  const PW = process.env.OWNER_PASSWORD;
  if (!process.env.VAULT_SECRET || !PW) return out(500, { error: 'La zone secrète n’est pas encore configurée.' });
  let b;
  try { b = JSON.parse(ev.body || '{}'); } catch (e) { return out(400, { error: 'Requête invalide' }); }

  if (b.a === 'auth') return out(200, { ok: core.eq(b.pw || '', PW) });

  if (b.a === 'code') {                 // réservé au maître : code lié à UNE personne
    if (!core.eq(b.pw || '', PW)) return out(403, { error: 'Refusé' });
    if (!b.uid) return out(400, { error: 'Personne manquante' });
    return out(200, { code: core.code(String(b.uid), b.tier === 2 ? 2 : 1) });
  }

  if (b.a === 'open') {                 // la personne tape son code
    const t = core.tierOf(b.uid, b.code);
    if (!t) return out(403, { error: 'Code incorrect.' });
    return out(200, { ok: true, room: core.room(), tier: t });
  }

  if (b.a === 'lib') {                  // bibliothèque : les fiches Premium restent verrouillées au niveau Cercle
    const t = core.tierOf(b.uid, b.code);
    if (!t) return out(403, { error: 'Accès refusé.' });
    return out(200, { tier: t, items: core.library.map(x => x.t <= t
      ? { id: x.id, cat: x.cat, title: x.title, body: x.body }
      : { id: x.id, cat: x.cat, title: x.title, lock: true }) });
  }
  const day = Math.floor(Date.now() / 864e5);
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(le|la|les|l|un|une|des|du|de|d|ton|mon|son|ta|ma|sa|c|est)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (b.a === 'daily' || b.a === 'riddle') {
    if (!core.tierOf(b.uid, b.code)) return out(403, { error: 'Accès refusé.' });
    const R = core.daily.riddles[day % core.daily.riddles.length];
    if (b.a === 'daily') return out(200, { fact: core.daily.facts[day % core.daily.facts.length], q: R.q });
    const ok = !!norm(b.ans) && R.a.some(x => norm(x) === norm(b.ans));
    return out(200, { ok, answer: (ok || b.giveup) ? R.d : undefined });
  }
  return out(400, { error: 'Action inconnue' });
};


// --- Adaptateur Vercel ---
module.exports = async (req, res) => {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const r = await handler({ httpMethod: req.method, body });
  res.status(r.statusCode);
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.send(r.body || '');
};
