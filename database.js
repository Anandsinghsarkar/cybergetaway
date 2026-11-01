const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'payments.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  customer TEXT,
  amount REAL NOT NULL CHECK(amount > 0),
  upi_ref TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  notes TEXT
);
`);
const columns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
if (!columns.includes('notes')) db.exec('ALTER TABLE orders ADD COLUMN notes TEXT');
module.exports = db;
