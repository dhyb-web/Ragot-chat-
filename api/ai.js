// Adaptateur Vercel : réutilise la fonction Netlify telle quelle (netlify/functions/ai.js)
const h = require('../netlify/functions/ai.js').handler;
module.exports = async (req, res) => {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const r = await h({ httpMethod: req.method, body });
  res.status(r.statusCode);
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.send(r.body || '');
};
