const c = require('crypto');
const K = () => process.env.VAULT_SECRET;
const sign = (m, n) => c.createHmac('sha256', K()).update(m).digest('hex').toUpperCase().slice(0, n);
const eq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && c.timingSafeEqual(a, b); };
const code = (uid, tier) => { const s = sign('code:' + tier + ':' + uid, 10); return s.slice(0, 5) + '-' + s.slice(5); };
// 0 = refusé, 1 = Cercle, 2 = Premium
const tierOf = (uid, given) => {
  if (!uid || !K()) return 0;
  given = String(given || '').toUpperCase().replace(/[^A-F0-9]/g, '');
  for (const t of [2, 1]) if (eq(given, code(String(uid), t).replace('-', ''))) return t;
  return 0;
};
const room = () => 's' + sign('room', 16).toLowerCase();
module.exports = { eq, code, tierOf, room, library: require('./library'), daily: require('./daily') };
