const express = require('express');
const crypto = require('crypto');
const db = require('../database');

module.exports = ({ adminAuth }) => {
  const router = express.Router();

  function safeEqualHex(received, expected) {
    if (!/^[a-f0-9]{64}$/i.test(received || '') || !/^[a-f0-9]{64}$/i.test(expected || '')) return false;
    const a = Buffer.from(received, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function verifyDeviceRequest(req) {
    const deviceId = String(req.headers['x-device-id'] || '');
    const timestamp = String(req.headers['x-cyber-timestamp'] || '');
    const signature = String(req.headers['x-cyber-signature'] || '');
    const secret = String(process.env.WEBHOOK_SECRET || '');
    if (!secret || !/^[A-Za-z0-9._-]{4,100}$/.test(deviceId) || !/^\d{13}$/.test(timestamp)) return false;
    const sentAt = Number(timestamp);
    if (!Number.isSafeInteger(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) return false;
    const body = req.body || {};
    if (String(body.deviceId || '') !== deviceId) return false;
    const canonical = deviceId + '|' + String(body.fingerprint || '') + '|' + (Number(body.amount).toFixed(2)) + '|' + timestamp;
    const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    return safeEqualHex(signature, expected);
  }

  // Signed health check: HMAC(secret, deviceId + '|PING|' + timestamp).
  router.post('/ping', (req, res) => {
    const deviceId = String(req.headers['x-device-id'] || '');
    const timestamp = String(req.headers['x-cyber-timestamp'] || '');
    const signature = String(req.headers['x-cyber-signature'] || '');
    const secret = String(process.env.WEBHOOK_SECRET || '');
    const sentAt = Number(timestamp);
    if (!secret || !/^[A-Za-z0-9._-]{4,100}$/.test(deviceId) || !/^\d{13}$/.test(timestamp) ||
        !Number.isSafeInteger(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) {
      return res.status(401).json({ success: false, message: 'Invalid or expired device request' });
    }
    const expected = crypto.createHmac('sha256', secret).update(deviceId + '|PING|' + timestamp).digest('hex');
    if (!safeEqualHex(signature, expected)) return res.status(401).json({ success: false, message: 'Invalid device signature' });
    res.json({ success: true, status: 'ONLINE', message: 'CyberGetaway alert endpoint is online', serverTimestamp: Date.now() });
  });

  // Store only minimum parsed metadata. Raw SMS, sender, VPA and snippets are never stored.
  router.post('/payment-alerts', (req, res) => {
    if (!verifyDeviceRequest(req)) return res.status(401).json({ success: false, status: 'REJECTED', message: 'Invalid device signature' });
    const body = req.body || {};
    const amount = Number(body.amount);
    const txType = String(body.transactionType || '').toUpperCase();
    const currency = String(body.currency || 'INR').toUpperCase();
    const ref = String(body.referenceNumber || '').trim();
    const fingerprint = String(body.fingerprint || '').trim();
    const txAt = Number(body.timestamp);
    if (txType !== 'RECEIVED') return res.status(400).json({ success: false, status: 'REJECTED', message: 'Only incoming payment alerts are accepted' });
    if (currency !== 'INR' || !Number.isFinite(amount) || amount < 1 || amount > 1000000 ||
        Math.round(amount * 100) !== amount * 100 || !/^[A-Za-z0-9_-]{6,40}$/.test(ref) ||
        !/^[a-f0-9]{64}$/i.test(fingerprint) || !Number.isSafeInteger(txAt) ||
        Math.abs(Date.now() - txAt) > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ success: false, status: 'REJECTED', message: 'Invalid transaction metadata' });
    }
    const duplicate = db.prepare('SELECT id FROM payment_alerts WHERE fingerprint=? OR reference_number=?').get(fingerprint, ref);
    if (duplicate) return res.json({ success: true, status: 'DUPLICATE', matchedOrderId: null, message: 'This transaction alert was already received' });
    const candidates = db.prepare("SELECT order_id FROM orders WHERE status='PENDING' AND amount=? ORDER BY id ASC").all(amount);
    const matchedOrderId = candidates.length === 1 ? candidates[0].order_id : null;
    try {
      db.prepare("INSERT INTO payment_alerts (fingerprint, device_id, amount, currency, transaction_type, reference_number, transaction_at, matched_order_id) VALUES (?, ?, ?, ?, 'RECEIVED', ?, ?, ?)")
        .run(fingerprint, String(body.deviceId), amount, currency, ref, txAt, matchedOrderId);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.json({ success: true, status: 'DUPLICATE', matchedOrderId: null, message: 'This transaction alert was already received' });
      throw error;
    }
    res.status(202).json({ success: true, status: 'ACCEPTED', matchedOrderId,
      message: matchedOrderId ? 'Possible order match found. Verify in your bank/UPI app before marking paid.' : 'Alert saved for manual review. No unique order match was found.',
      serverTimestamp: Date.now() });
  });

  // Admin-only monitor. No raw SMS data is collected or returned.
  router.get('/payment-alerts', adminAuth, (req, res) => {
    const alerts = db.prepare('SELECT id, device_id, amount, currency, transaction_type, reference_number, transaction_at, matched_order_id, review_status, received_at FROM payment_alerts ORDER BY id DESC LIMIT 500').all();
    res.json(alerts);
  });

  // Legacy raw-SMS endpoint disabled to avoid uploading complete message contents.
  router.post('/sms', (_req, res) => res.status(410).json({
    error: 'Raw SMS uploads are disabled. Configure the app to send filtered transaction metadata to /api/webhook/payment-alerts.'
  }));

  return router;
};
