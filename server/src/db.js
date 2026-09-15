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

// Customer records — including ID card numbers and photos — used to live only in each
// browser's own localStorage, unencrypted and readable by anyone with DevTools access to that
// browser profile, with no login required at all. Moved into the real, requireAuth-gated
// database for the same reason PIN accounts were: it's the only way this data is centrally
// backed up, synced across every device in the shop, and actually behind a login check.
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    init TEXT NOT NULL DEFAULT '',
    bg TEXT NOT NULL DEFAULT 'var(--green-100)',
    fg TEXT NOT NULL DEFAULT 'var(--green-700)',
    id_number TEXT NOT NULL DEFAULT '',
    id_expiry TEXT NOT NULL DEFAULT '',
    id_photo TEXT NOT NULL DEFAULT '',
    addr TEXT NOT NULL DEFAULT 'ยังไม่ได้บันทึกที่อยู่',
    tag TEXT NOT NULL DEFAULT 'general',
    weight TEXT NOT NULL DEFAULT '0.00 กก.',
    total TEXT NOT NULL DEFAULT '฿0.00',
    visits TEXT NOT NULL DEFAULT '0 ครั้ง',
    since TEXT NOT NULL DEFAULT '',
    last_visit TEXT NOT NULL DEFAULT 'ยังไม่เคยซื้อขาย',
    hist TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Products (the scrap-material catalog, prices, and on-hand stock) used to live only in each
// browser's own localStorage — the same "each device has its own copy" problem customers had,
// except worse here since stock levels genuinely need to be the same number everywhere: a
// device that ships out stock via a delivery, or buys more via a purchase, must update the one
// real number every other device reads, not a private copy that immediately goes stale.
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cat TEXT NOT NULL DEFAULT 'อื่นๆ',
    icon_key TEXT NOT NULL DEFAULT 'box',
    bg TEXT NOT NULL DEFAULT 'var(--bg)',
    fg TEXT NOT NULL DEFAULT 'var(--ink-500)',
    price REAL NOT NULL DEFAULT 0,
    change TEXT NOT NULL DEFAULT '0.0%',
    dir TEXT NOT NULL DEFAULT 'flat',
    stock TEXT NOT NULL DEFAULT '0.00 กก.',
    stock_pct REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    spark TEXT NOT NULL DEFAULT '[]',
    hist TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
