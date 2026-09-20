require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Refuse to start on a guessable secret instead of silently signing tokens anyone
  // who has read the source (this file) could forge — set JWT_SECRET in server/.env.
  console.error('JWT_SECRET is not set (see server/.env). Refusing to start with an insecure default.');
  process.exit(1);
}

const app = express();
// Standard hardening headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS,
// etc.) at essentially no cost. contentSecurityPolicy is left off deliberately — the app relies
// heavily on React's `style={{...}}` prop across every page, and helmet's default CSP would need
// real page-by-page testing to get right without silently breaking the UI; tightening that is a
// separate, deliberate piece of work, not something to guess at here.
app.use(helmet({ contentSecurityPolicy: false }));
// Same-machine origins, plus browsers loading the frontend from this machine's LAN IP (so a
// second till/tablet in the shop can use it too) — any port, so Vite picking a different port
// than 5173 still works. Deliberately scoped to loopback and the private address ranges
// (RFC 1918) rather than any origin, so even if this server were ever reachable from the wider
// internet (e.g. a misconfigured router), a page loaded from outside the shop's own network
// still couldn't call this API.
const LAN_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(:\d+)?$/;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || LAN_ORIGIN_RE.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());

// Serves the built frontend (npm run build) from the same origin/port as the API — this is
// what lets a real LAN deployment run a single HTTPS server instead of a separate dev-only
// Vite server. In local development dist/ doesn't exist yet, so this is silently a no-op and
// npm run dev's own Vite server (with its /api proxy) keeps working exactly as before.
const distPath = path.join(__dirname, '../../dist');
const hasBuiltFrontend = fs.existsSync(distPath);
if (hasBuiltFrontend) {
  app.use(express.static(distPath));
}

// Every endpoint below that accepts a password or PIN guess needs this brute-force limiter —
// generous enough for a real typo, tight enough to make guessing impractical.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ลองเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // PIN-only staff (see seed.js / POST /api/users) have an empty password_hash — they have no
  // password to check at all, so skip straight to the same rejection rather than handing an
  // empty hash to bcrypt.
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    },
  });
});

app.post('/api/change-password', authLimiter, (req, res) => {
  const { username, currentPassword, newPassword } = req.body || {};

  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !user.password_hash || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(newHash, username);

  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'ไม่ได้เข้าสู่ระบบ' });
  try {
    req.authUser = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

// Only the real admin login (POST /api/login) issues a JWT signed with role "owner" — PIN
// sessions get their own token below, so this can't be forged by a PIN-login session.
function requireOwner(req, res, next) {
  if (req.authUser?.role !== 'owner') {
    return res.status(403).json({ error: 'ต้องเป็นเจ้าของร้านเท่านั้นจึงจะจัดการผู้ใช้งานได้' });
  }
  next();
}

function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: !!row.active,
    hasPin: !!row.pin,
  };
}

// Staff directory, backed by the same `users` table as the admin login — this is what makes a
// PIN set up on one device actually usable from any other device on the shop's LAN, instead of
// being stuck in that one browser's localStorage (see src/context/UsersContext.jsx on the
// frontend for the previous, device-local-only version of this).
app.get('/api/users', requireAuth, requireOwner, (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json({ users: rows.map(toPublicUser) });
});

app.post('/api/users', requireAuth, requireOwner, (req, res) => {
  const { username, displayName, role, pin } = req.body || {};
  if (!username?.trim() || !displayName?.trim() || !role) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (pin && !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' });
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())) {
    return res.status(409).json({ error: `ชื่อผู้ใช้งาน "${username.trim()}" มีอยู่แล้ว กรุณาใช้ชื่ออื่น` });
  }
  if (pin && db.prepare('SELECT id FROM users WHERE pin = ?').get(pin)) {
    return res.status(409).json({ error: 'PIN นี้ถูกใช้โดยผู้ใช้งานคนอื่นแล้ว กรุณาตั้งรหัสอื่น' });
  }
  const info = db
    .prepare('INSERT INTO users (username, password_hash, display_name, role, pin) VALUES (?, ?, ?, ?, ?)')
    .run(username.trim(), '', displayName.trim(), role, pin || null);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: toPublicUser(row) });
});

app.put('/api/users/:id', requireAuth, requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const body = req.body || {};
  // Distinguish "pin not sent" (leave alone) from "pin explicitly sent as empty" (clear it) —
  // the frontend never echoes an existing PIN back for editing (see GET's hasPin, not the
  // digits, below), so a present-but-blank field always means "clear", never "unchanged".
  const pinProvided = Object.prototype.hasOwnProperty.call(body, 'pin');
  if (pinProvided && body.pin && !/^\d{4}$/.test(body.pin)) {
    return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' });
  }
  if (pinProvided && body.pin) {
    const taken = db.prepare('SELECT id FROM users WHERE pin = ? AND id != ?').get(body.pin, row.id);
    if (taken) return res.status(409).json({ error: 'PIN นี้ถูกใช้โดยผู้ใช้งานคนอื่นแล้ว กรุณาตั้งรหัสอื่น' });
  }

  db.prepare('UPDATE users SET display_name = ?, role = ?, pin = ?, active = ? WHERE id = ?').run(
    body.displayName?.trim() || row.display_name,
    body.role || row.role,
    pinProvided ? body.pin || null : row.pin,
    body.active === undefined ? row.active : body.active ? 1 : 0,
    row.id
  );
  res.json({ user: toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id)) });
});

app.delete('/api/users/:id', requireAuth, requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
  if (row.username === 'admin') return res.status(400).json({ error: 'ลบบัญชี admin ไม่ได้' });
  db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

app.post('/api/pin-login', authLimiter, (req, res) => {
  const { pin } = req.body || {};
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'กรุณากรอก PIN 4 หลัก' });
  }
  const row = db.prepare('SELECT * FROM users WHERE pin = ?').get(pin);
  if (!row || !row.active) {
    return res.status(401).json({ error: 'PIN ไม่ถูกต้อง หรือบัญชีนี้ถูกปิดใช้งาน' });
  }
  const token = jwt.sign({ sub: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({
    token,
    user: { id: row.id, username: row.username, displayName: row.display_name, role: row.role },
  });
});

function toApiCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    init: row.init,
    bg: row.bg,
    fg: row.fg,
    idNumber: row.id_number,
    idExpiry: row.id_expiry,
    idPhoto: row.id_photo,
    addr: row.addr,
    tag: row.tag,
    weight: row.weight,
    total: row.total,
    visits: row.visits,
    since: row.since,
    lastVisit: row.last_visit,
    hist: JSON.parse(row.hist || '[]'),
    createdAt: row.created_at,
  };
}

function moneyFmt(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMoneyStr(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}
function parseWeightStr(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}
function parseCountStr(s) {
  return parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
}

// Every route below requires a valid session (requireAuth, not requireOwner) — any logged-in
// staff member needs to look up or add a customer mid-sale (see ScrapPurchase.jsx), not just the
// owner. This is what actually gates ID card numbers/photos behind a login, which nothing did
// before: the whole point of moving customers off browser localStorage and into this database.
app.get('/api/customers', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY created_at DESC, rowid DESC').all();
  res.json({ customers: rows.map(toApiCustomer) });
});

app.post('/api/customers', requireAuth, (req, res) => {
  const { name, phone, idNumber, idExpiry, idPhoto } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อลูกค้า' });
  }
  const id = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const init = name.trim().replace('คุณ', '').trim().slice(0, 2) || '?';
  const since = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'short', year: 'numeric' }).format(new Date());
  db.prepare(
    `INSERT INTO customers (id, name, phone, init, id_number, id_expiry, id_photo, since)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), (phone || '').trim(), init, (idNumber || '').trim(), idExpiry || '', idPhoto || '', since);
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.status(201).json({ customer: toApiCustomer(row) });
});

app.put('/api/customers/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
  const body = req.body || {};
  const nextName = body.name?.trim() || row.name;
  db.prepare(
    `UPDATE customers SET name = ?, init = ?, phone = ?, id_number = ?, id_expiry = ?, id_photo = ?, tag = ? WHERE id = ?`
  ).run(
    nextName,
    body.name?.trim() ? nextName.replace('คุณ', '').trim().slice(0, 2) || row.init : row.init,
    body.phone !== undefined ? (body.phone?.trim() ?? null) : row.phone,
    body.idNumber !== undefined ? (body.idNumber?.trim() ?? null) : row.id_number,
    body.idExpiry !== undefined ? body.idExpiry : row.id_expiry,
    body.idPhoto !== undefined ? body.idPhoto : row.id_photo,
    body.tag !== undefined ? body.tag : row.tag,
    row.id
  );
  res.json({ customer: toApiCustomer(db.prepare('SELECT * FROM customers WHERE id = ?').get(row.id)) });
});

app.delete('/api/customers/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Called once per completed purchase (ScrapPurchase.jsx) so a customer's cumulative
// weight/spend/visit count and recent history reflect real transactions. Computed server-side
// (read-modify-write against the row that's already the source of truth) rather than the client
// sending a precomputed next value, so two devices completing a sale for the same customer at
// nearly the same moment can't race and silently drop one update.
app.post('/api/customers/:id/record-purchase', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
  const { weightKg, amount, receiptNo, timeStr } = req.body || {};
  const hist = [{ no: receiptNo, dt: `วันนี้ · ${timeStr}`, amt: moneyFmt(amount) }, ...JSON.parse(row.hist || '[]')].slice(0, 5);
  const nextWeight = `${(parseWeightStr(row.weight) + (weightKg || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
  const nextTotal = moneyFmt(parseMoneyStr(row.total) + (amount || 0));
  const nextVisits = `${parseCountStr(row.visits) + 1} ครั้ง`;
  db.prepare('UPDATE customers SET weight = ?, total = ?, visits = ?, last_visit = ?, hist = ? WHERE id = ?').run(
    nextWeight,
    nextTotal,
    nextVisits,
    `วันนี้ ${timeStr}`,
    JSON.stringify(hist),
    row.id
  );
  res.json({ customer: toApiCustomer(db.prepare('SELECT * FROM customers WHERE id = ?').get(row.id)) });
});

// Inverse of record-purchase — called when a receipt is voided (Receipts.jsx) so a cancelled
// purchase doesn't permanently overstate the customer's lifetime weight/spend/visit count.
app.post('/api/customers/:id/reverse-purchase', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
  const { weightKg, amount, receiptNo } = req.body || {};
  const hist = JSON.parse(row.hist || '[]').filter((h) => h.no !== receiptNo);
  const nextWeight = `${Math.max(parseWeightStr(row.weight) - (weightKg || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
  const nextTotal = moneyFmt(Math.max(parseMoneyStr(row.total) - (amount || 0), 0));
  const nextVisits = `${Math.max(parseCountStr(row.visits) - 1, 0)} ครั้ง`;
  db.prepare('UPDATE customers SET weight = ?, total = ?, visits = ?, last_visit = ?, hist = ? WHERE id = ?').run(
    nextWeight,
    nextTotal,
    nextVisits,
    hist[0] ? hist[0].dt : 'ยังไม่เคยซื้อขาย',
    JSON.stringify(hist),
    row.id
  );
  res.json({ customer: toApiCustomer(db.prepare('SELECT * FROM customers WHERE id = ?').get(row.id)) });
});

function toApiProduct(row) {
  return {
    id: row.id,
    name: row.name,
    cat: row.cat,
    iconKey: row.icon_key,
    bg: row.bg,
    fg: row.fg,
    price: row.price,
    change: row.change,
    dir: row.dir,
    stock: row.stock,
    stockPct: row.stock_pct,
    active: !!row.active,
    spark: JSON.parse(row.spark || '[]'),
    hist: JSON.parse(row.hist || '[]'),
    createdAt: row.created_at,
  };
}

function parseStockStr(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}
function formatStock(n) {
  return `${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
}
function todayThaiShort() {
  return new Date().toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatChangePct(pct) {
  if (pct > 0) return `+${pct.toFixed(1)}%`;
  if (pct < 0) return `−${Math.abs(pct).toFixed(1)}%`;
  return '0.0%';
}

// Products — prices and, critically, on-hand stock — used to live only in each browser's own
// localStorage. Stock is the sharpest case of why that's broken: a delivery shipping stock out
// on one device and a purchase adding stock on another must both land on the same real number,
// not each keep their own private copy that immediately goes stale relative to the other.
app.get('/api/products', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC, rowid DESC').all();
  res.json({ products: rows.map(toApiProduct) });
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, cat, price } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อสินค้า' });
  const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const p = price || 0;
  const spark = JSON.stringify([p, p, p, p, p, p, p]);
  db.prepare('INSERT INTO products (id, name, cat, price, spark) VALUES (?, ?, ?, ?, ?)').run(id, name.trim(), cat || 'อื่นๆ', p, spark);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.status(201).json({ product: toApiProduct(row) });
});

// Renaming or deleting a category (see Categories.jsx) cascades onto every product referencing
// it by name — done as one atomic statement server-side instead of the client reading every
// product, checking its cat, and writing each one back individually. Registered before
// PUT /api/products/:id below — Express matches routes in registration order, and :id would
// otherwise greedily match the literal path segment "reassign-category" as an id.
app.put('/api/products/reassign-category', requireAuth, (req, res) => {
  const { fromCat, toCat } = req.body || {};
  if (!fromCat || !toCat) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
  const info = db.prepare('UPDATE products SET cat = ? WHERE cat = ?').run(toCat, fromCat);
  res.json({ movedCount: info.changes });
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบสินค้ารายการนี้' });
  const body = req.body || {};
  db.prepare('UPDATE products SET name = ?, cat = ?, stock = ?, active = ? WHERE id = ?').run(
    body.name !== undefined ? body.name.trim() || row.name : row.name,
    body.cat !== undefined ? body.cat : row.cat,
    body.stock !== undefined ? body.stock : row.stock,
    body.active !== undefined ? (body.active ? 1 : 0) : row.active,
    row.id
  );
  res.json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบสินค้ารายการนี้' });
  db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Records a real price change as it happens, computing the 7-day history/sparkline/% change
// server-side (read-modify-write against the row that's the actual source of truth) instead of
// the client sending a precomputed next value — same reasoning as customers' record-purchase.
app.post('/api/products/:id/price', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบสินค้ารายการนี้' });
  const { price: newPrice } = req.body || {};
  if (!(newPrice > 0)) return res.status(400).json({ error: 'ราคาต้องมากกว่า 0' });
  if (newPrice === row.price) return res.json({ product: toApiProduct(row) });
  const pct = row.price > 0 ? ((newPrice - row.price) / row.price) * 100 : 0;
  const dir = newPrice > row.price ? 'up' : newPrice < row.price ? 'down' : 'flat';
  const today = todayThaiShort();
  const prevHist = JSON.parse(row.hist || '[]');
  const hist =
    prevHist[0]?.d === today
      ? [{ d: today, v: moneyFmt(newPrice) }, ...prevHist.slice(1)]
      : [{ d: today, v: moneyFmt(newPrice) }, ...prevHist].slice(0, 7);
  const prevSpark = JSON.parse(row.spark || '[]');
  const baseSpark = prevSpark.length ? prevSpark : [newPrice, newPrice, newPrice, newPrice, newPrice, newPrice, newPrice];
  const spark = [...baseSpark.slice(1), newPrice];
  db.prepare('UPDATE products SET price = ?, change = ?, dir = ?, hist = ?, spark = ? WHERE id = ?').run(
    newPrice,
    formatChangePct(pct),
    dir,
    JSON.stringify(hist),
    JSON.stringify(spark),
    row.id
  );
  res.json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
});

// Buying scrap material (see ScrapPurchase.jsx) adds to on-hand stock, matched by name since a
// purchase row is free-text, not tied to a real product id. A row typed into a blank slot with
// a name that doesn't match any cataloged product is still a real purchase, so this creates the
// product (priced at what was actually paid) rather than silently dropping the stock update.
app.post('/api/products/add-stock', requireAuth, (req, res) => {
  const { name, weightKg, unitPrice } = req.body || {};
  const trimmed = (name || '').trim();
  if (!trimmed || !(weightKg > 0)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
  const existing = db.prepare('SELECT * FROM products WHERE name = ?').get(trimmed);
  if (existing) {
    const nextStock = formatStock(parseStockStr(existing.stock) + weightKg);
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(nextStock, existing.id);
    return res.json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)) });
  }
  const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const price = unitPrice || 0;
  const spark = JSON.stringify([price, price, price, price, price, price, price]);
  db.prepare('INSERT INTO products (id, name, price, stock, spark) VALUES (?, ?, ?, ?, ?)').run(id, trimmed, price, formatStock(weightKg), spark);
  res.status(201).json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id)) });
});

// Shipping accumulated stock out to a buyer (see Deliveries.jsx) removes it from on-hand
// stock, by id — the delivery form picks a real product directly, unlike ScrapPurchase's
// free-text row names.
app.post('/api/products/:id/remove-stock', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบสินค้ารายการนี้' });
  const { weightKg } = req.body || {};
  if (weightKg > 0) {
    const nextStock = formatStock(Math.max(parseStockStr(row.stock) - weightKg, 0));
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(nextStock, row.id);
  }
  res.json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
});

// Restoring stock to a delivery's original product on delete/edit (see Deliveries.jsx), by id.
// 404s instead of fabricating a placeholder product if it was deleted since the delivery was
// created — the client treats that as "couldn't restore automatically" and warns the user,
// rather than this silently corrupting the catalog with a new placeholder.
app.post('/api/products/:id/add-stock', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบสินค้ารายการนี้' });
  const { weightKg } = req.body || {};
  if (weightKg > 0) {
    const nextStock = formatStock(parseStockStr(row.stock) + weightKg);
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(nextStock, row.id);
  }
  res.json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
});

// Voiding or editing a receipt (see Receipts.jsx) needs to give back stock by name — receipts
// only ever recorded item names, not ids, matching how add-stock above looks products up. A
// no-op (not an error) when nothing matches, same as the old client-side behavior.
app.post('/api/products/remove-stock-by-name', requireAuth, (req, res) => {
  const { name, weightKg } = req.body || {};
  const trimmed = (name || '').trim();
  if (!trimmed || !(weightKg > 0)) return res.json({ ok: true });
  const row = db.prepare('SELECT * FROM products WHERE name = ?').get(trimmed);
  if (!row) return res.json({ ok: true });
  const nextStock = formatStock(Math.max(parseStockStr(row.stock) - weightKg, 0));
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(nextStock, row.id);
  res.json({ product: toApiProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
});

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toApiReceipt(row) {
  return {
    no: row.no,
    date: row.date,
    time: row.time,
    cust: row.cust,
    custId: row.cust_id,
    issuedBy: row.issued_by,
    init: row.init,
    bg: row.bg,
    fg: row.fg,
    status: row.status,
    weight: row.weight,
    deductionWeight: row.deduction_weight,
    deductionLabel: row.deduction_label,
    note: row.note,
    method: row.method,
    items: JSON.parse(row.items || '[]'),
    total: row.total,
    deductionUsage: JSON.parse(row.deduction_usage || '[]'),
    voidedAt: row.voided_at,
    slipPhoto: row.slip_photo || '',
    vatIncluded: !!row.vat_included,
    vatAmount: row.vat_amount || 0,
  };
}

// Receipts — the core transaction record every report page (Dashboard, DailySummary, Monthly/
// AnnualReport, TaxReport, ProductReport) reads from — used to live only in each browser's own
// localStorage. A sale rung up on one device needs to show up in every other device's "today's
// receipts" and totals immediately, not stay invisible until someone happens to look at that
// one browser.
app.get('/api/receipts', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM receipts ORDER BY created_at DESC, rowid DESC').all();
  res.json({ receipts: rows.map(toApiReceipt) });
});

app.post('/api/receipts', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.no) return res.status(400).json({ error: 'ไม่มีเลขที่ใบเสร็จ' });
  if (db.prepare('SELECT no FROM receipts WHERE no = ?').get(b.no)) {
    return res.status(409).json({ error: `เลขที่ใบเสร็จ ${b.no} ถูกใช้แล้ว` });
  }
  db.prepare(
    `INSERT INTO receipts (no, date, time, cust, cust_id, issued_by, init, bg, fg, status, weight, deduction_weight, deduction_label, note, method, items, total, deduction_usage, slip_photo, vat_included, vat_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.no,
    b.date || todayISO(),
    b.time || '',
    b.cust || '',
    b.custId || null,
    b.issuedBy || '',
    b.init || '',
    b.bg || '',
    b.fg || '',
    b.status || 'ok',
    b.weight || '0.00 กก.',
    b.deductionWeight || 0,
    b.deductionLabel || '',
    b.note || '',
    b.method || '',
    JSON.stringify(b.items || []),
    b.total || '฿0.00',
    JSON.stringify(b.deductionUsage || []),
    b.slipPhoto || '',
    b.vatIncluded ? 1 : 0,
    b.vatAmount || 0
  );
  const row = db.prepare('SELECT * FROM receipts WHERE no = ?').get(b.no);
  res.status(201).json({ receipt: toApiReceipt(row) });
});

// Cancelling a purchase — separate from the general edit below since it only ever flips status
// (plus a timestamp for Dashboard.jsx's "most recently voided" ordering); the actual stock and
// customer-total reversal happens via the products/customers endpoints, called independently by
// the client, same as this codebase's existing void flow already did client-side.
app.put('/api/receipts/:no/void', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM receipts WHERE no = ?').get(req.params.no);
  if (!row) return res.status(404).json({ error: 'ไม่พบใบเสร็จนี้' });
  if (row.status !== 'void') {
    db.prepare('UPDATE receipts SET status = ?, voided_at = ? WHERE no = ?').run('void', Date.now(), row.no);
  }
  res.json({ receipt: toApiReceipt(db.prepare('SELECT * FROM receipts WHERE no = ?').get(row.no)) });
});

// Editing a receipt's items/weights (see Receipts.jsx) — refuses once voided for the same
// reason the old client-side check did: a void has already reversed stock/customer totals
// against the pre-edit numbers, so an edit landing afterward would drift them out of sync.
app.put('/api/receipts/:no', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM receipts WHERE no = ?').get(req.params.no);
  if (!row) return res.status(404).json({ error: 'ไม่พบใบเสร็จนี้' });
  if (row.status === 'void') return res.status(409).json({ error: 'ใบเสร็จนี้ถูกยกเลิกไปแล้ว ไม่สามารถแก้ไขได้' });
  const b = req.body || {};
  db.prepare(
    `UPDATE receipts SET cust = ?, init = ?, method = ?, note = ?, items = ?, weight = ?, deduction_weight = ?, deduction_label = ?, total = ? WHERE no = ?`
  ).run(
    b.cust !== undefined ? b.cust : row.cust,
    b.init !== undefined ? b.init : row.init,
    b.method !== undefined ? b.method : row.method,
    b.note !== undefined ? b.note : row.note,
    b.items !== undefined ? JSON.stringify(b.items) : row.items,
    b.weight !== undefined ? b.weight : row.weight,
    b.deductionWeight !== undefined ? b.deductionWeight : row.deduction_weight,
    b.deductionLabel !== undefined ? b.deductionLabel : row.deduction_label,
    b.total !== undefined ? b.total : row.total,
    row.no
  );
  res.json({ receipt: toApiReceipt(db.prepare('SELECT * FROM receipts WHERE no = ?').get(row.no)) });
});

function toApiDelivery(row) {
  return {
    no: row.no,
    date: row.date,
    time: row.time,
    status: row.status,
    buyerName: row.buyer_name,
    buyerAddress: row.buyer_address,
    buyerContact: row.buyer_contact,
    vehicle: row.vehicle,
    driver: row.driver,
    note: row.note,
    items: JSON.parse(row.items || '[]'),
    totalWeight: row.total_weight,
    totalAmount: row.total_amount,
  };
}

// Deliveries (outbound shipments to buyers) used to live only in each browser's own
// localStorage — a delivery dispatched from one device needs to show up (and its stock
// commitment be accounted for) on every other device immediately.
app.get('/api/deliveries', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM deliveries ORDER BY created_at DESC, rowid DESC').all();
  res.json({ deliveries: rows.map(toApiDelivery) });
});

app.post('/api/deliveries', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.no) return res.status(400).json({ error: 'ไม่มีเลขที่ใบส่งของ' });
  if (db.prepare('SELECT no FROM deliveries WHERE no = ?').get(b.no)) {
    return res.status(409).json({ error: `เลขที่ใบส่งของ ${b.no} ถูกใช้แล้ว` });
  }
  db.prepare(
    `INSERT INTO deliveries (no, date, time, status, buyer_name, buyer_address, buyer_contact, vehicle, driver, note, items, total_weight, total_amount)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.no,
    b.date || todayISO(),
    b.time || '',
    b.buyerName || '',
    b.buyerAddress || '',
    b.buyerContact || '',
    b.vehicle || '',
    b.driver || '',
    b.note || '',
    JSON.stringify(b.items || []),
    b.totalWeight || 0,
    b.totalAmount || 0
  );
  const row = db.prepare('SELECT * FROM deliveries WHERE no = ?').get(b.no);
  res.status(201).json({ delivery: toApiDelivery(row) });
});

app.put('/api/deliveries/:no/deliver', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deliveries WHERE no = ?').get(req.params.no);
  if (!row) return res.status(404).json({ error: 'ไม่พบใบส่งของนี้' });
  db.prepare('UPDATE deliveries SET status = ? WHERE no = ?').run('delivered', row.no);
  res.json({ delivery: toApiDelivery(db.prepare('SELECT * FROM deliveries WHERE no = ?').get(row.no)) });
});

app.put('/api/deliveries/:no', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deliveries WHERE no = ?').get(req.params.no);
  if (!row) return res.status(404).json({ error: 'ไม่พบใบส่งของนี้' });
  const b = req.body || {};
  db.prepare(
    `UPDATE deliveries SET buyer_name = ?, buyer_address = ?, buyer_contact = ?, vehicle = ?, driver = ?, note = ?, items = ?, total_weight = ?, total_amount = ? WHERE no = ?`
  ).run(
    b.buyerName !== undefined ? b.buyerName : row.buyer_name,
    b.buyerAddress !== undefined ? b.buyerAddress : row.buyer_address,
    b.buyerContact !== undefined ? b.buyerContact : row.buyer_contact,
    b.vehicle !== undefined ? b.vehicle : row.vehicle,
    b.driver !== undefined ? b.driver : row.driver,
    b.note !== undefined ? b.note : row.note,
    b.items !== undefined ? JSON.stringify(b.items) : row.items,
    b.totalWeight !== undefined ? b.totalWeight : row.total_weight,
    b.totalAmount !== undefined ? b.totalAmount : row.total_amount,
    row.no
  );
  res.json({ delivery: toApiDelivery(db.prepare('SELECT * FROM deliveries WHERE no = ?').get(row.no)) });
});

app.delete('/api/deliveries/:no', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deliveries WHERE no = ?').get(req.params.no);
  if (!row) return res.status(404).json({ error: 'ไม่พบใบส่งของนี้' });
  db.prepare('DELETE FROM deliveries WHERE no = ?').run(row.no);
  res.json({ ok: true });
});

function toApiStaff(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    init: row.init,
    bg: row.bg,
    fg: row.fg,
    base: row.base,
    days: row.days,
    maxDays: row.max_days,
    attendance: JSON.parse(row.attendance || '[]'),
    advance: row.advance,
    otherAmount: row.other_amount,
    otherReasonId: row.other_reason_id,
    otherCustomReason: row.other_custom_reason,
    paid: !!row.paid,
  };
}

function toApiPayRecord(row) {
  return {
    no: row.no,
    time: row.time,
    paidAt: row.paid_at,
    weekKey: row.week_key,
    weekLabel: row.week_label,
    staffId: row.staff_id,
    staffName: row.staff_name,
    staffRole: row.staff_role,
    days: row.days,
    maxDays: row.max_days,
    attendance: JSON.parse(row.attendance || '[]'),
    base: row.base,
    advance: row.advance,
    otherAmount: row.other_amount,
    otherLabel: row.other_label,
    net: row.net,
    payMethod: row.pay_method,
  };
}

// Staff roster + weekly attendance/pay state used to live only in each browser's own
// localStorage. Per-keystroke fields (advance, other amount/reason, attendance) are meant to
// be pushed here only once, when the frontend's local draft is explicitly saved/paid — not on
// every keystroke — see db.js's note on the `staff` table for why.
app.get('/api/staff', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM staff ORDER BY created_at DESC, rowid DESC').all();
  res.json({ staff: rows.map(toApiStaff) });
});

app.post('/api/staff', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อพนักงาน' });
  const id = `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    'INSERT INTO staff (id, name, role, init, bg, fg, base) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, b.name.trim(), b.role || '', b.init || '', b.bg || 'var(--green-100)', b.fg || 'var(--green-700)', b.base || 0);
  const row = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
  res.status(201).json({ staff: toApiStaff(row) });
});

// General patch — covers both the profile edit (name/role/base) and the draft save
// (days/attendance/advance/otherAmount/otherReasonId/otherCustomReason/paid), and the
// one-click "จ่ายแล้ว"/"ค้างจ่าย" badge toggle (paid only). Whichever fields the caller
// sends are the ones that change; everything else on the row is left alone.
app.put('/api/staff/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' });
  const b = req.body || {};
  db.prepare(
    `UPDATE staff SET name = ?, role = ?, base = ?, days = ?, max_days = ?, attendance = ?, advance = ?, other_amount = ?, other_reason_id = ?, other_custom_reason = ?, paid = ? WHERE id = ?`
  ).run(
    b.name !== undefined ? b.name?.trim() || row.name : row.name,
    b.role !== undefined ? b.role : row.role,
    b.base !== undefined ? b.base : row.base,
    b.days !== undefined ? b.days : row.days,
    b.maxDays !== undefined ? b.maxDays : row.max_days,
    b.attendance !== undefined ? JSON.stringify(b.attendance) : row.attendance,
    b.advance !== undefined ? b.advance : row.advance,
    b.otherAmount !== undefined ? b.otherAmount : row.other_amount,
    b.otherReasonId !== undefined ? b.otherReasonId : row.other_reason_id,
    b.otherCustomReason !== undefined ? b.otherCustomReason : row.other_custom_reason,
    b.paid !== undefined ? (b.paid ? 1 : 0) : row.paid,
    row.id
  );
  res.json({ staff: toApiStaff(db.prepare('SELECT * FROM staff WHERE id = ?').get(row.id)) });
});

app.delete('/api/staff/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' });
  db.prepare('DELETE FROM staff WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Finalizes a weekly payment: records the pay_history entry (client computes `net` from the
// same dailyRate formula PayrollReport.jsx also uses, and supplies the voucher number/week
// key/label — these are just labels, not values another device could race on) and resets the
// staff row's week-local fields in one call, so a client can't save the history entry but
// fail to reset the roster row (or vice versa) from a single dropped request.
app.post('/api/staff/:id/pay', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' });
  const b = req.body || {};
  if (!b.no) return res.status(400).json({ error: 'ไม่มีเลขที่ใบสำคัญจ่าย' });
  if (db.prepare('SELECT no FROM pay_history WHERE no = ?').get(b.no)) {
    return res.status(409).json({ error: `เลขที่ใบสำคัญจ่าย ${b.no} ถูกใช้แล้ว` });
  }
  db.prepare(
    `INSERT INTO pay_history (no, time, paid_at, week_key, week_label, staff_id, staff_name, staff_role, days, max_days, attendance, base, advance, other_amount, other_label, net, pay_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.no,
    b.time || '',
    b.paidAt || new Date().toISOString(),
    b.weekKey || '',
    b.weekLabel || '',
    row.id,
    row.name,
    row.role,
    b.days ?? row.days,
    b.maxDays ?? row.max_days,
    JSON.stringify(b.attendance || []),
    b.base ?? row.base,
    b.advance ?? row.advance,
    b.otherAmount ?? row.other_amount,
    b.otherLabel || '',
    b.net || 0,
    b.payMethod || ''
  );
  // Pay period is weekly: the payment's now on record, so reset attendance/advances/other and
  // mark paid so the next week starts fresh.
  db.prepare(
    `UPDATE staff SET days = 0, attendance = '["off","off","off","off","off","off"]', advance = 0, other_amount = 0, other_reason_id = '', other_custom_reason = '', paid = 1 WHERE id = ?`
  ).run(row.id);
  res.status(201).json({
    payRecord: toApiPayRecord(db.prepare('SELECT * FROM pay_history WHERE no = ?').get(b.no)),
    staff: toApiStaff(db.prepare('SELECT * FROM staff WHERE id = ?').get(row.id)),
  });
});

app.get('/api/pay-history', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM pay_history ORDER BY created_at DESC, rowid DESC').all();
  res.json({ payHistory: rows.map(toApiPayRecord) });
});

function toApiReason(row) {
  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    bg: row.bg,
    fg: row.fg,
    type: row.type,
    value: row.value,
    uses: row.uses,
    total: row.total,
    active: !!row.active,
  };
}

// Deduction reasons used to live only in each browser's own localStorage — the usage counters
// (uses/total) specifically need to be the same number everywhere, since a reason applied to a
// purchase on any device should count toward the same running total every other device sees.
app.get('/api/deduction-reasons', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM deduction_reasons ORDER BY created_at DESC, rowid DESC').all();
  res.json({ reasons: rows.map(toApiReason) });
});

app.post('/api/deduction-reasons', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อเหตุผล' });
  const id = `reason_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    'INSERT INTO deduction_reasons (id, name, desc, type, value) VALUES (?, ?, ?, ?, ?)'
  ).run(id, b.name.trim(), b.desc || '', b.type || 'fixed', b.value ?? '0');
  const row = db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(id);
  res.status(201).json({ reason: toApiReason(row) });
});

app.put('/api/deduction-reasons/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบเหตุผลนี้' });
  const b = req.body || {};
  db.prepare(
    `UPDATE deduction_reasons SET name = ?, desc = ?, type = ?, value = ?, active = ? WHERE id = ?`
  ).run(
    b.name !== undefined ? b.name?.trim() || row.name : row.name,
    b.desc !== undefined ? b.desc : row.desc,
    b.type !== undefined ? b.type : row.type,
    b.value !== undefined ? b.value : row.value,
    b.active !== undefined ? (b.active ? 1 : 0) : row.active,
    row.id
  );
  res.json({ reason: toApiReason(db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(row.id)) });
});

app.delete('/api/deduction-reasons/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบเหตุผลนี้' });
  db.prepare('DELETE FROM deduction_reasons WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Called once per reason actually applied on a submitted receipt (see ScrapPurchase.jsx), so
// "ใช้แล้ว N ครั้ง"/"ยอดหักรวม" reflect real usage — read-modify-write against the row that's
// the actual source of truth, same reasoning as customers' record-purchase.
app.post('/api/deduction-reasons/:id/increment-usage', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(req.params.id);
  if (!row) return res.json({ ok: true });
  const { amount } = req.body || {};
  db.prepare('UPDATE deduction_reasons SET uses = uses + 1, total = total + ? WHERE id = ?').run(amount || 0, row.id);
  res.json({ reason: toApiReason(db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(row.id)) });
});

// Inverse of increment-usage — called when a receipt that applied this reason gets voided
// (see Receipts.jsx handleVoid), so the counters don't stay permanently inflated by a purchase
// that was fully reversed everywhere else.
app.post('/api/deduction-reasons/:id/decrement-usage', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(req.params.id);
  if (!row) return res.json({ ok: true });
  const { amount } = req.body || {};
  db.prepare('UPDATE deduction_reasons SET uses = MAX(uses - 1, 0), total = MAX(total - ?, 0) WHERE id = ?').run(amount || 0, row.id);
  res.json({ reason: toApiReason(db.prepare('SELECT * FROM deduction_reasons WHERE id = ?').get(row.id)) });
});

function toApiCategory(row) {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key,
    color: row.color,
    desc: row.desc,
    isActive: !!row.is_active,
  };
}

// Categories used to live only in each browser's own localStorage.
app.get('/api/categories', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, rowid ASC').all();
  res.json({ categories: rows.map(toApiCategory) });
});

app.post('/api/categories', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อหมวดหมู่' });
  const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // New categories go to the front of the list, matching every other resource's
  // "newest first" convention — the lowest sort_order sorts first.
  const min = db.prepare('SELECT MIN(sort_order) AS m FROM categories').get();
  const sortOrder = (min.m ?? 0) - 1;
  db.prepare(
    'INSERT INTO categories (id, name, icon_key, color, desc, is_active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
  ).run(id, b.name.trim(), b.iconKey || 'other', b.color || 'slate', b.desc || '', sortOrder);
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.status(201).json({ category: toApiCategory(row) });
});

// Persists a full manual reorder (see Categories.jsx's "เรียงลำดับ" sort-by-name action) —
// registered before PUT /api/categories/:id below, since Express would otherwise match the
// literal path segment "reorder" as an :id.
app.put('/api/categories/reorder', requireAuth, (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
  const update = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  order.forEach((id, i) => update.run(i, id));
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, rowid ASC').all();
  res.json({ categories: rows.map(toApiCategory) });
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบหมวดหมู่นี้' });
  const b = req.body || {};
  db.prepare(
    `UPDATE categories SET name = ?, color = ?, desc = ?, is_active = ? WHERE id = ?`
  ).run(
    b.name !== undefined ? b.name?.trim() || row.name : row.name,
    b.color !== undefined ? b.color : row.color,
    b.desc !== undefined ? b.desc : row.desc,
    b.isActive !== undefined ? (b.isActive ? 1 : 0) : row.is_active,
    row.id
  );
  res.json({ category: toApiCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(row.id)) });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบหมวดหมู่นี้' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

function toApiScale(row) {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    bg: row.bg,
    fg: row.fg,
    port: row.port,
    conn: row.conn,
    max: row.max,
    res: row.res,
    cal: row.cal,
    due: row.due,
    status: row.status,
    active: !!row.active,
  };
}

// Scale devices used to live only in each browser's own localStorage — ScrapPurchase.jsx reads
// whichever device is flagged `active` as the one to weigh purchases on, so that had to become
// the same device on every till instead of a per-browser guess.
app.get('/api/scales', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM scales ORDER BY sort_order ASC, rowid ASC').all();
  res.json({ scales: rows.map(toApiScale) });
});

// Manually adding a device ("เพิ่มเครื่องชั่ง") puts it first; a network scan finding one
// ("สแกนหาเครื่องใหม่") appends it last — same two-rule ordering Scales.jsx already had, now
// backed by sort_order instead of each browser's own insertion order.
app.post('/api/scales', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อเครื่องชั่ง' });
  const id = `scale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let sortOrder;
  if (b.atEnd) {
    const max = db.prepare('SELECT MAX(sort_order) AS m FROM scales').get();
    sortOrder = (max.m ?? -1) + 1;
  } else {
    const min = db.prepare('SELECT MIN(sort_order) AS m FROM scales').get();
    sortOrder = (min.m ?? 0) - 1;
  }
  db.prepare(
    `INSERT INTO scales (id, name, model, bg, fg, port, conn, max, res, cal, due, status, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    b.name.trim(),
    b.model || 'ไม่ระบุรุ่น',
    b.bg || 'var(--bg)',
    b.fg || 'var(--ink-500)',
    b.port || '—',
    b.conn || 'สาย USB / RS-232',
    b.max || '—',
    b.res || '—',
    b.cal || 'ยังไม่เคยสอบเทียบ',
    b.due || '—',
    b.status || 'off',
    b.active ? 1 : 0,
    sortOrder
  );
  const row = db.prepare('SELECT * FROM scales WHERE id = ?').get(id);
  res.status(201).json({ scale: toApiScale(row) });
});

app.put('/api/scales/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM scales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบเครื่องชั่งนี้' });
  const b = req.body || {};
  db.prepare(
    `UPDATE scales SET name = ?, conn = ?, port = ?, status = ?, cal = ?, due = ? WHERE id = ?`
  ).run(
    b.name !== undefined ? b.name?.trim() || row.name : row.name,
    b.conn !== undefined ? b.conn : row.conn,
    b.port !== undefined ? b.port : row.port,
    b.status !== undefined ? b.status : row.status,
    b.cal !== undefined ? b.cal : row.cal,
    b.due !== undefined ? b.due : row.due,
    row.id
  );
  res.json({ scale: toApiScale(db.prepare('SELECT * FROM scales WHERE id = ?').get(row.id)) });
});

// "ใช้เป็นเครื่องชั่งหลัก" is exclusive — only one device can be the one ScrapPurchase.jsx reads
// from — so this clears every other device's `active` flag in the same statement instead of the
// client computing that exclusivity itself and risking two devices ending up active at once.
app.put('/api/scales/:id/set-active', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM scales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบเครื่องชั่งนี้' });
  const active = !!(req.body || {}).active;
  if (active) db.prepare('UPDATE scales SET active = 0').run();
  db.prepare('UPDATE scales SET active = ? WHERE id = ?').run(active ? 1 : 0, row.id);
  res.json({ scale: toApiScale(db.prepare('SELECT * FROM scales WHERE id = ?').get(row.id)) });
});

app.delete('/api/scales/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM scales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบเครื่องชั่งนี้' });
  // ScrapPurchase.jsx reads the main device unconditionally, so it can never be left with zero.
  const count = db.prepare('SELECT COUNT(*) AS c FROM scales').get().c;
  if (count <= 1) return res.status(400).json({ error: 'ต้องมีเครื่องชั่งอย่างน้อย 1 เครื่อง ไม่สามารถนำเครื่องสุดท้ายออกได้' });
  db.prepare('DELETE FROM scales WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

app.get('/api/scales-activity', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM scale_activity ORDER BY id DESC LIMIT 20').all();
  res.json({ activity: rows.map((r) => ({ icon: r.icon, title: r.title, sub: r.sub, amt: r.amt })) });
});

app.post('/api/scales-activity', requireAuth, (req, res) => {
  const b = req.body || {};
  db.prepare('INSERT INTO scale_activity (icon, title, sub, amt) VALUES (?, ?, ?, ?)').run(
    b.icon || 'ok',
    b.title || '',
    b.sub || '',
    b.amt || ''
  );
  const rows = db.prepare('SELECT * FROM scale_activity ORDER BY id DESC LIMIT 20').all();
  res.status(201).json({ activity: rows.map((r) => ({ icon: r.icon, title: r.title, sub: r.sub, amt: r.amt })) });
});

function toApiSettings(row) {
  return {
    shopName: row.shop_name,
    taxId: row.tax_id,
    address: row.address,
    phone: row.phone,
    hours: row.hours,
    receiptFooter: row.receipt_footer,
    remember30: !!row.remember30,
    pinLogin: !!row.pin_login,
  };
}

// Unlike every other resource, this is deliberately NOT behind requireAuth: Login.jsx reads
// shop hours and whether PIN login is enabled before anyone has signed in, and none of these
// fields are sensitive — they're the same shop name/address/hours already printed on every
// receipt a customer takes home. Writing them still requires being signed in as the owner below.
app.get('/api/settings', (req, res) => {
  const row = db.prepare("SELECT * FROM settings WHERE id = 'shop'").get();
  res.json({ settings: toApiSettings(row) });
});

app.put('/api/settings', requireAuth, requireOwner, (req, res) => {
  const row = db.prepare("SELECT * FROM settings WHERE id = 'shop'").get();
  const b = req.body || {};
  db.prepare(
    `UPDATE settings SET shop_name = ?, tax_id = ?, address = ?, phone = ?, hours = ?, receipt_footer = ?, remember30 = ?, pin_login = ? WHERE id = 'shop'`
  ).run(
    b.shopName !== undefined ? b.shopName : row.shop_name,
    b.taxId !== undefined ? b.taxId : row.tax_id,
    b.address !== undefined ? b.address : row.address,
    b.phone !== undefined ? b.phone : row.phone,
    b.hours !== undefined ? b.hours : row.hours,
    b.receiptFooter !== undefined ? b.receiptFooter : row.receipt_footer,
    b.remember30 !== undefined ? (b.remember30 ? 1 : 0) : row.remember30,
    b.pinLogin !== undefined ? (b.pinLogin ? 1 : 0) : row.pin_login
  );
  res.json({ settings: toApiSettings(db.prepare("SELECT * FROM settings WHERE id = 'shop'").get()) });
});

// React Router handles routing client-side, so a direct link or hard refresh on e.g. /receipts
// has to still get index.html from the server (there's no real /receipts file on disk) and let
// the client-side router take over from there. Registered after every real route above, so it
// only catches what nothing else already matched — a request under /api that reached this point
// is a genuinely unknown endpoint, not a page route, so it correctly falls through as a 404
// instead of being served the frontend's index.html.
if (hasBuiltFrontend) {
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Catches the CORS rejection above (and any other thrown error) so a blocked cross-origin
// request gets a plain 403 instead of Express's default error page, which would otherwise
// leak the server's file paths and stack trace to whoever sent the request.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(403).json({ error: 'Forbidden' });
});

// A cert/key on disk (see README for how to generate one for the shop's LAN) switches this to
// HTTPS automatically; without one it falls back to plain HTTP, which is what local development
// (npm run dev, no cert generated) has always done and keeps doing unchanged.
const CERT_PATH = process.env.HTTPS_CERT || path.join(__dirname, '../certs/cert.pem');
const KEY_PATH = process.env.HTTPS_KEY || path.join(__dirname, '../certs/key.pem');
const hasCert = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);

if (hasCert) {
  https
    .createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, app)
    .listen(PORT, () => {
      console.log(`API+web server listening on https://localhost:${PORT}`);
    });
} else {
  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}
