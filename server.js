require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const app = express();

if (!process.env.ADMIN_PASSWORD || !process.env.WEBHOOK_SECRET || !process.env.SESSION_SECRET) {
  console.error('ADMIN_PASSWORD, WEBHOOK_SECRET and SESSION_SECRET must be set.');
  process.exit(1);
}
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use((req, res, next) => {
  const allowed = (process.env.CORS_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && (allowed.includes(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin)))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret, x-api-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
}
function adminAuth(req, res, next) {
  const token = req.cookies?.admin_session || '';
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return res.status(401).json({ error: 'Admin login required' });
  const expected = sign(expires);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Admin login required' });
  next();
}
// Small cookie parser without an extra dependency.
app.use((req, res, next) => {
  req.cookies = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  next();
});
app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }), (req, res) => {
  const supplied = String(req.body?.password || '');
  const expected = String(process.env.ADMIN_PASSWORD);
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Incorrect password' });
  const expires = String(Date.now() + 12 * 60 * 60 * 1000);
  res.setHeader('Set-Cookie', 'admin_session=' + expires + '.' + sign(expires) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
  res.json({ success: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
  res.json({ success: true });
});
app.get('/api/admin/session', adminAuth, (req, res) => res.json({ authenticated: true }));
app.use('/api/orders', require('./routes/orders')({ adminAuth }));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/gateway', require('./routes/gateway'));

app.get('/api/config', (req, res) => res.json({ vpa: process.env.VPA || 'yourbusiness@bank', merchantName: process.env.MERCHANT_NAME || 'MyShop', defaultAmount: Number(process.env.DEFAULT_AMOUNT || 500) }));
app.get('/health', (req, res) => res.json({ status: 'alive', timestamp: new Date().toISOString(), uptime: process.uptime() }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const selfUrl = process.env.SELF_URL || process.env.RENDER_EXTERNAL_URL;
if (selfUrl) cron.schedule('*/10 * * * *', async () => {
  try { const r = await axios.get(selfUrl.replace(/\/$/, '') + '/health', { timeout: 10000 }); console.log('[KEEP-ALIVE] success', r.status); }
  catch (e) { console.error('[KEEP-ALIVE] failed', e.message); }
});
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log('Payment tracker running on port', port));
