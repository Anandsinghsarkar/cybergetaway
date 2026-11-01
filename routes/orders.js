const express = require('express');
const router = express.Router();
const db = require('../database');

// Create order
router.post('/create', (req, res) => {
  const { orderId, amount, customer } = req.body;
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'orderId and amount required' });
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO orders (order_id, customer, amount) VALUES (?, ?, ?)'
    );
    stmt.run(orderId, customer || 'Guest', amount);
    res.json({ success: true, orderId, amount, status: 'PENDING' });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Order ID already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get all orders
router.get('/', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(orders);
});

// Get single order
router.get('/:orderId', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// Stats
router.get('/stats/summary', (req, res) => {
  const totalPaid = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 'PAID'"
  ).get();
  const countPaid = db.prepare(
    "SELECT COUNT(*) as count FROM orders WHERE status = 'PAID'"
  ).get();
  const countPending = db.prepare(
    "SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'"
  ).get();

  res.json({
    totalReceived: totalPaid.total,
    paidOrders: countPaid.count,
    pendingOrders: countPending.count
  });
});

module.exports = router;