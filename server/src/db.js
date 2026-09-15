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

// Receipts — the core transaction record every report page (Dashboard, DailySummary, Monthly/
// AnnualReport, TaxReport, ProductReport) reads from — used to live only in each browser's own
// localStorage. A sale rung up on one device needs to show up in every other device's "today's
// receipts" and totals immediately, not stay invisible until someone happens to look at that
// one browser. `no` (the receipt number, e.g. "RC123456789") is the real primary key here, same
// as it already was as the object key in the old client-side `receipts` map — no separate id.
db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    no TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    cust TEXT NOT NULL DEFAULT '',
    cust_id TEXT,
    issued_by TEXT NOT NULL DEFAULT '',
    init TEXT NOT NULL DEFAULT '',
    bg TEXT NOT NULL DEFAULT '',
    fg TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ok',
    weight TEXT NOT NULL DEFAULT '0.00 กก.',
    deduction_weight REAL NOT NULL DEFAULT 0,
    deduction_label TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    total TEXT NOT NULL DEFAULT '฿0.00',
    deduction_usage TEXT NOT NULL DEFAULT '[]',
    voided_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Deliveries (outbound shipments to buyers, with the stock they carry out) used to live only
// in each browser's own localStorage. `no` (the delivery number, e.g. "DO123456789") is the
// real primary key here, same as it already was as the object key in the old client-side
// `deliveries` map — no separate id.
db.exec(`
  CREATE TABLE IF NOT EXISTS deliveries (
    no TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    buyer_name TEXT NOT NULL DEFAULT '',
    buyer_address TEXT NOT NULL DEFAULT '',
    buyer_contact TEXT NOT NULL DEFAULT '',
    vehicle TEXT NOT NULL DEFAULT '',
    driver TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    total_weight REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Staff roster + weekly attendance/pay state used to live only in each browser's own
// localStorage. Note: per-keystroke fields (advance, other amount/reason, and attendance
// clicks) are deliberately NOT written to the server as they happen — the frontend keeps
// those as a local draft and only calls PUT /api/staff/:id once, when the user explicitly
// clicks "บันทึกร่าง"/"จ่ายเงิน", matching how every other edit form in this app already
// works (Customers/Products/Users), instead of firing a network request per keystroke.
db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    init TEXT NOT NULL DEFAULT '',
    bg TEXT NOT NULL DEFAULT '',
    fg TEXT NOT NULL DEFAULT '',
    base REAL NOT NULL DEFAULT 0,
    days REAL NOT NULL DEFAULT 0,
    max_days INTEGER NOT NULL DEFAULT 6,
    attendance TEXT NOT NULL DEFAULT '["off","off","off","off","off","off"]',
    advance REAL NOT NULL DEFAULT 0,
    other_amount REAL NOT NULL DEFAULT 0,
    other_reason_id TEXT NOT NULL DEFAULT '',
    other_custom_reason TEXT NOT NULL DEFAULT '',
    paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Every finalized weekly payment, appended once per POST /api/staff/:id/pay — `no` (the
// payment voucher number, e.g. "PV123456789") is the real primary key, same convention as
// receipts/deliveries.
db.exec(`
  CREATE TABLE IF NOT EXISTS pay_history (
    no TEXT PRIMARY KEY,
    time TEXT NOT NULL DEFAULT '',
    paid_at TEXT NOT NULL DEFAULT '',
    week_key TEXT NOT NULL DEFAULT '',
    week_label TEXT NOT NULL DEFAULT '',
    staff_id TEXT NOT NULL DEFAULT '',
    staff_name TEXT NOT NULL DEFAULT '',
    staff_role TEXT NOT NULL DEFAULT '',
    days REAL NOT NULL DEFAULT 0,
    max_days INTEGER NOT NULL DEFAULT 6,
    attendance TEXT NOT NULL DEFAULT '[]',
    base REAL NOT NULL DEFAULT 0,
    advance REAL NOT NULL DEFAULT 0,
    other_amount REAL NOT NULL DEFAULT 0,
    other_label TEXT NOT NULL DEFAULT '',
    net REAL NOT NULL DEFAULT 0,
    pay_method TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Deduction reasons (น้ำหนักเปียก, สิ่งปนเปื้อน, ฯลฯ) used to live only in each browser's own
// localStorage — the usage counters (uses/total) specifically need to be the same number
// everywhere, since a reason applied to a purchase on any device should count toward the same
// running total every other device sees.
db.exec(`
  CREATE TABLE IF NOT EXISTS deduction_reasons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    desc TEXT NOT NULL DEFAULT '',
    bg TEXT NOT NULL DEFAULT 'var(--green-100)',
    fg TEXT NOT NULL DEFAULT 'var(--green-700)',
    type TEXT NOT NULL DEFAULT 'fixed',
    value TEXT NOT NULL DEFAULT '0',
    uses INTEGER NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Categories used to live only in each browser's own localStorage. `sort_order` backs the
// page's manual "เรียงลำดับ" (sort by name asc/desc) action — explicit, not derived from
// creation time, since the user can re-sort the list at will and that choice needs to persist
// and be the same on every device, not just insertion order.
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_key TEXT NOT NULL DEFAULT 'other',
    color TEXT NOT NULL DEFAULT 'slate',
    desc TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
