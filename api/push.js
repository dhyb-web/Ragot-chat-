// Notifications quand l'app est fermée (FCM). Aucune dépendance.
// Variables Netlify : FIREBASE_SERVICE_ACCOUNT (JSON complet) ou FB_PROJECT_ID + FB_CLIENT_EMAIL + FB_PRIVATE_KEY. Jamais dans le code.
const crypto = require('crypto');
const DB = process.env.FIREBASE_DB_URL || 'https://chat-amis-ec1f0-default-rtdb.firebaseio.com';
const WEBKEY = process.env.FIREBASE_API_KEY || 'AIzaSyC7MMNhjyjQqoP2yEPoaFh6VmL9y8nYL-E'; // clé web publique
const out = (s, o) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) });
const b64 = x => Buffer.from(x).toString('base64url');
let cache = { tok: null, exp: 0 };

// Soit FIREBASE_SERVICE_ACCOUNT (JSON complet), soit trois petites variables : FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY.
function loadSA() {
  try { if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (e) {}
  const e = process.env;
  if (e.FB_PROJECT_ID && e.FB_CLIENT_EMAIL && e.FB_PRIVATE_KEY)
    return { project_id: e.FB_PROJECT_ID, client_email: e.FB_CLIENT_EMAIL, private_key: e.FB_PRIVATE_KEY.replace(/\\n/g, '\n') };
  return null;
}

async function accessToken(sa) {
  if (cache.tok && cache.exp > Date.now() + 60000) return cache.tok;
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('oauth');
  cache = { tok: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
  return cache.tok;
}

exports.handler = async (ev) => {
  if (ev.httpMethod !== 'POST') return out(405);
  const sa = loadSA();
  if (!sa) return out(500, { error: 'Notifications non configurées.' });
  let b;
  try { b = JSON.parse(ev.body || '{}'); } catch (e) { return out(400); }
  const room = String(b.room || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(room) || !b.t) return out(400);
  try {
    // 1. qui envoie ? (vérifié auprès de Firebase Auth)
    const lk = await (await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEBKEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: b.t })
    })).json();
    const uid = lk.users && lk.users[0] && lk.users[0].localId;
    if (!uid) return out(403);
    const at = await accessToken(sa);
    const get = async p => (await (await fetch(DB + '/' + p + '.json?access_token=' + at)).json());

    // 2. qui reçoit ?
    let to = [];
    if (room.startsWith('dm_')) {
      const [, x, y] = room.split('_');
      if (uid !== x && uid !== y) return out(403);
      to = [uid === x ? y : x];
    } else {
      const m = (await get('rooms/' + room + '/members')) || {};
      if (!m[uid]) return out(403);
      to = Object.keys(m).filter(k => k !== uid);
    }
    const toks = [];
    for (const r of to.slice(0, 200)) {
      if (!/^[A-Za-z0-9_-]+$/.test(r)) continue;
      const t = (await get('tokens/' + r)) || {};
      Object.keys(t).forEach(k => toks.push({ r, k, t: t[k] }));
    }

    // 3. envoi
    const title = String(b.title || 'RAGOT').slice(0, 40);
    const body = ((room.startsWith('dm_') ? '' : String(b.name || '') + ' : ') + String(b.text || '')).slice(0, 140);
    await Promise.all(toks.slice(0, 300).map(async x => {
      const r = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
        method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: x.t, data: { title, body, room }, webpush: { headers: { Urgency: 'high', TTL: '86400' } } } })
      });
      if (r.status === 404) fetch(DB + '/tokens/' + x.r + '/' + x.k + '.json?access_token=' + at, { method: 'DELETE' }).catch(() => {});
    }));
    return out(200, { sent: toks.length });
  } catch (e) {
    return out(502, { error: 'Envoi impossible.' });
  }
};
