const express = require('express');
const router = express.Router();
const db = require('../database');

// SMS Forwarder app yahan POST karega
router.post('/sms', (req, res) => {
  const { message } = req.body;
  console.log('[WEBHOOK] SMS received:', message);

  if (!message) return res.status(400).json({ error: 'No message' });

  // Parse amount: "Rs.500" or "INR 500"
  const amountMatch = message.match(/(?:Rs\.?|INR)\s?(\d+(?:\.\d+)?)/i);
  // Parse UPI ref: "UPI:123456789012" or "Ref 123456789012"
  const refMatch = message.match(/(?:UPI[:\s]*|Ref[:\s]*)(\d{9,12})/i);

  if (!amountMatch) {
    console.log('[WEBHOOK] Could not parse amount');
    return res.json({ received: true, parsed: false });
  }

  const amount = parseFloat(amountMatch[1]);
  const upiRef = refMatch ? refMatch[1] : null;

  console.log(`[WEBHOOK] Parsed — Amount: ₹${amount}, UPI Ref: ${upiRef}`);

  // Match pending order by amount (latest pending first)
  const order = db.prepare(
    "SELECT * FROM orders WHERE status = 'PENDING' AND amount = ? ORDER BY created_at ASC LIMIT 1"
  ).get(amount);

  if (order) {
    db.prepare(
      "UPDATE orders SET status = 'PAID', upi_ref = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(upiRef, order.id);
    console.log(`[WEBHOOK] Order ${order.order_id} marked as PAID`);
    return res.json({ received: true, matched: true, orderId: order.order_id });
  }

  console.log('[WEBHOOK] No matching pending order found');
  res.json({ received: true, matched: false });
});

module.exports = router;