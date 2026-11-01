const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const router = express.Router();
router.post('/sms', (req, res) => {
  const secret = String(req.headers['x-webhook-secret'] || '');
  const expected = String(process.env.WEBHOOK_SECRET || '');
  const a = Buffer.from(secret), b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({ error: 'Unauthorized webhook' });
  const message = String(req.body?.message || '');
  if (!message || message.length > 4000) return res.status(400).json({ error: 'Valid SMS message required' });
  // SMS text is untrusted. It can create a review candidate, never confirm payment.
  const amountMatch = message.match(/(?:Rs\.?|INR|₹)\s*(\d+(?:\.\d{1,2})?)/i);
  const refMatch = message.match(/(?:UPI\s*(?:Ref|Reference)?|Ref)\s*[:#-]?\s*(\d{9,12})/i);
  if (!amountMatch || !refMatch) return res.json({ received: true, parsed: false, verified: false });
  const amount = Number(amountMatch[1]);
  const ref = refMatch[1];
  const duplicate = db.prepare('SELECT order_id FROM orders WHERE upi_ref=?').get(ref);
  if (duplicate) return res.json({ received: true, duplicate: true, verified: false });
  const candidates = db.prepare("SELECT order_id FROM orders WHERE status='PENDING' AND amount=? ORDER BY id ASC").all(amount);
  if (candidates.length !== 1) return res.json({ received: true, matched: false, reviewRequired: candidates.length > 1 });
  db.prepare("UPDATE orders SET status='UNVERIFIED', upi_ref=?, notes=? WHERE order_id=?").run(ref, 'SMS match requires manual bank/app verification', candidates[0].order_id);
  res.json({ received: true, matched: true, verified: false, reviewRequired: true, orderId: candidates[0].order_id });
});
module.exports = router;
