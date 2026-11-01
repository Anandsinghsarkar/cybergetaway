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
for (const [name, type] of [
  ['notes', 'TEXT'],
  ['checkout_token', 'TEXT'],
  ['merchant_vpa', 'TEXT'],
  ['merchant_name', 'TEXT'],
  ['return_url', 'TEXT']
]) {
  if (!columns.includes(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token ON orders(checkout_token) WHERE checkout_token IS NOT NULL');
module.exports = db;
