const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const router = express.Router();

function apiAuth(req, res, next) {
  const expected = String(process.env.MERCHANT_API_KEY || '');
  const supplied = String(req.headers['x-api-key'] || '');
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Server-to-server endpoint. Never put MERCHANT_API_KEY in browser JavaScript.
router.post('/payment-intents', apiAuth, (req, res) => {
  const orderId = String(req.body?.orderId || '').trim();
  const amount = Number(req.body?.amount);
  const customerName = String(req.body?.customerName || 'Customer').trim().slice(0, 100);
  const returnUrl = String(req.body?.returnUrl || '').trim();
  const vpa = String(process.env.VPA || '').trim();
  const merchantName = String(process.env.MERCHANT_NAME || 'Merchant').trim().slice(0, 60);
  if (!/^ORD[A-Z0-9_-]{5,50}$/.test(orderId)) return res.status(400).json({ error: 'Invalid orderId' });
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    return res.status(400).json({ error: 'Amount must be between ₹1 and ₹10,00,000 with at most 2 decimals' });
  }
  if (!/^[\w.\-]{2,256}@[\w]{2,64}$/.test(vpa)) return res.status(503).json({ error: 'Merchant VPA is not configured' });
  if (returnUrl && (!returnUrl.startsWith('https://') || returnUrl.length > 500)) {
    return res.status(400).json({ error: 'returnUrl must be an HTTPS URL' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  try {
    db.prepare(`INSERT INTO orders (order_id, customer, amount, checkout_token, merchant_vpa, merchant_name, return_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(orderId, customerName || 'Customer', amount, token, vpa, merchantName, returnUrl || null);
    const base = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    res.status(201).json({ success: true, orderId, amount, status: 'PENDING', checkoutUrl: base + '/checkout.html?token=' + token });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'orderId already exists' });
    throw e;
  }
});

// Public checkout data is protected by a random, unguessable token.
router.get('/checkout/:token', (req, res) => {
  const order = db.prepare('SELECT order_id, customer, amount, status, merchant_vpa, merchant_name, return_url FROM orders WHERE checkout_token=?').get(req.params.token);
  if (!order) return res.status(404).json({ error: 'Checkout not found' });
  res.json(order);
});

// Merchant server polls this endpoint; browser redirects are not proof of payment.
router.get('/payment-intents/:orderId', apiAuth, (req, res) => {
  const order = db.prepare('SELECT order_id, amount, status, upi_ref, created_at, paid_at FROM orders WHERE order_id=?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});
module.exports = router;
