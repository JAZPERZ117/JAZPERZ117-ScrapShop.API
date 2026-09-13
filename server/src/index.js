require('dotenv').config();
const express = require('express');
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

// Catches the CORS rejection above (and any other thrown error) so a blocked cross-origin
// request gets a plain 403 instead of Express's default error page, which would otherwise
// leak the server's file paths and stack trace to whoever sent the request.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(403).json({ error: 'Forbidden' });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
