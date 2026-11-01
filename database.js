const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'payments.db'));

// Table create
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    customer TEXT,
    amount REAL NOT NULL,
    upi_ref TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME
  )
`);

module.exports = db;