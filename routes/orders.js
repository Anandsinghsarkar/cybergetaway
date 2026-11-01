const express = require('express');
const crypto = require('crypto');
const db = require('../database');

module.exports = ({ adminAuth }) => {
  const router = express.Router();

  // Admin-created checkout links for collecting a one-off payment.
  router.post('/create', adminAuth, (req, res) => {
    const orderId = String(req.body?.orderId || '').trim();
    const amount = Number(req.body?.amount);
    const customer = String(req.body?.customerName || 'Customer').trim().slice(0, 100) || 'Customer';
    const vpa = String(process.env.VPA || '').trim();
    const merchantName = String(process.env.MERCHANT_NAME || 'Merchant').trim().slice(0, 60);
    if (!/^ORD[A-Z0-9_-]{5,50}$/.test(orderId)) return res.status(400).json({ error: 'Order ID must start with ORD and contain 8–53 valid characters' });
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7)
      return res.status(400).json({ error: 'Amount must be ₹1–₹10,00,000 with up to 2 decimal places' });
    if (!/^[\\w.\\-]{2,256}@[\\w]{2,64}$/.test(vpa)) return res.status(503).json({ error: 'Set a valid VPA in Render Environment first' });
    const token = crypto.randomBytes(32).toString('hex');
    try {
      db.prepare(`INSERT INTO orders (order_id, customer, amount, checkout_token, merchant_vpa, merchant_name)
        VALUES (?, ?, ?, ?, ?, ?)`).run(orderId, customer, amount, token, vpa, merchantName);
      const base = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || (req.protocol + '://' + req.get('host'))).replace(/\\/$/, '');
      res.status(201).json({ success: true, orderId, amount, status: 'PENDING', checkoutUrl: base + '/checkout.html?token=' + token });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Order ID already exists' });
      throw e;
    }
  });

  router.get('/stats/summary', adminAuth, (req, res) => {
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) total, COUNT(*) count FROM orders WHERE status='PAID'").get();
    const pending = db.prepare("SELECT COUNT(*) count FROM orders WHERE status IN ('PENDING','UNVERIFIED')").get();
    const failed = db.prepare("SELECT COUNT(*) count FROM orders WHERE status='FAILED'").get();
    const all = db.prepare('SELECT COUNT(*) count FROM orders').get();
    res.json({ totalReceived: paid.total, paidOrders: paid.count, pendingOrders: pending.count, failedOrders: failed.count, totalOrders: all.count });
  });

  router.get('/', adminAuth, (req, res) => res.json(db.prepare('SELECT order_id,customer,amount,upi_ref,status,created_at,paid_at,notes FROM orders ORDER BY id DESC LIMIT 1000').all()));

  router.get('/:orderId', (req, res) => {
    const order = db.prepare('SELECT order_id,amount,status,created_at,paid_at FROM orders WHERE order_id=?').get(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  router.patch('/:orderId/mark-paid', adminAuth, (req, res) => {
    const ref = String(req.body?.upiRef || '').trim();
    if (ref.length > 80) return res.status(400).json({ error: 'Invalid UPI reference' });
    const order = db.prepare("SELECT * FROM orders WHERE order_id=? AND status IN ('PENDING','UNVERIFIED')").get(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Pending order not found' });
    try {
      db.prepare("UPDATE orders SET status='PAID', upi_ref=?, paid_at=CURRENT_TIMESTAMP WHERE order_id=?").run(ref || null, req.params.orderId);
      res.json({ success: true, status: 'PAID' });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'This UPI reference is already recorded' });
      throw e;
    }
  });

  router.patch('/:orderId/status', adminAuth, (req, res) => {
    const status = String(req.body?.status || '');
    if (!['FAILED','REFUNDED','PENDING'].includes(status)) return res.status(400).json({ error: 'Unsupported status' });
    const result = db.prepare("UPDATE orders SET status=?, notes=? WHERE order_id=? AND status!='PAID'").run(status, String(req.body?.notes || '').slice(0,500), req.params.orderId);
    if (!result.changes) return res.status(404).json({ error: 'Order not found or already paid' });
    res.json({ success: true, status });
  });

  return router;
};
