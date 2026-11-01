require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/orders', require('./routes/orders'));
app.use('/api/webhook', require('./routes/webhook'));

// Health check endpoint (self-ping isi ko hit karega)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// 🔥 SELF-PING (KEEP-ALIVE) — Render sleep rokne ke liye
// ============================================
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;

if (SELF_URL) {
  // Har 10 minute mein khud ko ping karo
  cron.schedule('*/10 * * * *', async () => {
    try {
      const res = await axios.get(`${SELF_URL}/health`, { timeout: 10000 });
      console.log(`[KEEP-ALIVE] Ping success at ${new Date().toISOString()} - Status: ${res.status}`);
    } catch (err) {
      console.error(`[KEEP-ALIVE] Ping failed:`, err.message);
    }
  });
  console.log(`✅ Self-ping scheduled every 10 min for: ${SELF_URL}`);
} else {
  console.log('⚠️  SELF_URL not set — self-ping disabled');
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});