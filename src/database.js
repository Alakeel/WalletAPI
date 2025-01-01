const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../wallet.db'));

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      idempotency_key TEXT UNIQUE,
      type TEXT,
      amount DECIMAL(10,2),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
  });
}

module.exports = { db, initDatabase };