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

// Both endpoints below accept a password guess, so both need a brute-force limiter —
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
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
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
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(newHash, username);

  res.json({ ok: true });
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
