const path = require('path');
// Node's built-in SQLite instead of better-sqlite3 — same synchronous prepare/get/run API,
// but needs no native module compilation (no Python/C++ toolchain required to `npm install`).
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'shop.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Added after the table above shipped, so existing shop.db files on real installs won't have
// them yet — ALTER TABLE ADD COLUMN (guarded by a PRAGMA check, since SQLite has no
// "ADD COLUMN IF NOT EXISTS") instead of recreating the table. These back the PIN quick-login
// (server/src/index.js POST /api/pin-login) so staff accounts are looked up from this shared
// database instead of each browser's own localStorage — which is what let a PIN set up on one
// device silently fail to work from another.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('pin')) {
  db.exec('ALTER TABLE users ADD COLUMN pin TEXT');
}
if (!userColumns.includes('active')) {
  db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}
// Partial unique index: SQLite treats every NULL as distinct, so this only rejects two
// non-null PINs colliding — any number of accounts with no PIN set is still fine.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pin ON users(pin) WHERE pin IS NOT NULL');

module.exports = db;
