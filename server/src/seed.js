const bcrypt = require('bcryptjs');
const db = require('./db');

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'shop1234';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(DEFAULT_USERNAME);

if (existing) {
  console.log(`ผู้ใช้งาน "${DEFAULT_USERNAME}" มีอยู่แล้ว ไม่ต้อง seed ซ้ำ`);
} else {
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(DEFAULT_USERNAME, passwordHash, 'เจ้าของร้าน', 'owner');
  console.log('สร้างผู้ใช้งานเริ่มต้นสำเร็จ:');
  console.log(`  username: ${DEFAULT_USERNAME}`);
  console.log(`  password: ${DEFAULT_PASSWORD}`);
}

// Demo PIN-login staff (see src/context/UsersContext.jsx INITIAL_USERS on the frontend, which
// this mirrors) — these have no password, only a PIN, so a blank password_hash is correct: it
// can never match a bcrypt compare, meaning these accounts genuinely cannot log in with a
// password, only via POST /api/pin-login.
const DEMO_STAFF = [
  { username: 'kanjana_pos', displayName: 'น.ส.กาญจนา ศรีสุข', role: 'แคชเชียร์', pin: '1234', active: 1 },
  { username: 'wittaya_scale', displayName: 'นายวิทยา ทองสุข', role: 'พนักงานชั่งของ', pin: '5678', active: 1 },
  { username: 'prasert_sort', displayName: 'นายประเสริฐ แสงทอง', role: 'พนักงานชั่งของ', pin: '9012', active: 1 },
];
for (const staff of DEMO_STAFF) {
  const already = db.prepare('SELECT id FROM users WHERE username = ?').get(staff.username);
  if (already) continue;
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, pin, active) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(staff.username, '', staff.displayName, staff.role, staff.pin, staff.active);
  console.log(`สร้างผู้ใช้งานตัวอย่างสำเร็จ: ${staff.displayName} (PIN ${staff.pin})`);
}

// Starting price catalog (see src/context/ProductsContext.jsx's old INITIAL_PRODUCTS_RAW) —
// a real shop needs these to already exist with zero stock, not an empty product list, since
// unlike customers there's no "add the first one" flow for the base scrap-material types.
const INITIAL_PRODUCTS = [
  { id: 'iron', name: 'เหล็ก', cat: 'โลหะ', iconKey: 'magnet', bg: 'var(--amber-bg)', fg: 'var(--amber)', price: 17.0, active: 1 },
  { id: 'copper', name: 'ทองแดง', cat: 'โลหะ', iconKey: 'circle', bg: 'var(--rose-bg)', fg: 'var(--rose)', price: 218.0, active: 1 },
  { id: 'cardboard', name: 'กระดาษลัง', cat: 'กระดาษ', iconKey: 'cardboard', bg: 'var(--blue-bg)', fg: 'var(--blue)', price: 10.0, active: 1 },
  { id: 'plastic', name: 'ขวดพลาสติก', cat: 'พลาสติก', iconKey: 'bottle', bg: 'var(--plum-bg)', fg: 'var(--plum)', price: 12.4, active: 1 },
  { id: 'aluminum', name: 'อลูมิเนียม', cat: 'โลหะ', iconKey: 'circle', bg: 'var(--green-100)', fg: 'var(--green-700)', price: 48.0, active: 1 },
  { id: 'stainless', name: 'สแตนเลส', cat: 'โลหะ', iconKey: 'device', bg: 'var(--teal-bg, #E4F6F4)', fg: 'var(--teal, #0E8E82)', price: 22.5, active: 0 },
];
for (const p of INITIAL_PRODUCTS) {
  const already = db.prepare('SELECT id FROM products WHERE id = ?').get(p.id);
  if (already) continue;
  const spark = JSON.stringify([p.price, p.price, p.price, p.price, p.price, p.price, p.price]);
  db.prepare(
    'INSERT INTO products (id, name, cat, icon_key, bg, fg, price, active, spark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(p.id, p.name, p.cat, p.iconKey, p.bg, p.fg, p.price, p.active, spark);
  console.log(`สร้างสินค้าตั้งต้นสำเร็จ: ${p.name}`);
}

// Starting staff roster (see src/context/PayrollContext.jsx's old INITIAL_STAFF) — a real
// shop needs these to already exist, not an empty roster, since there's no "hire the first
// employee" onboarding flow distinct from the normal add-staff form.
const INITIAL_STAFF = [
  { id: 'wittaya', name: 'นายวิทยา ทองสุข', role: 'พนักงานชั่งของ', init: 'วิ', bg: 'var(--blue-bg)', fg: 'var(--blue)', base: 12000 },
  { id: 'somsak', name: 'นายสมศักดิ์ แก้วมณี', role: 'คนขับรถรับซื้อ', init: 'สม', bg: 'var(--rose-bg)', fg: 'var(--rose)', base: 13500 },
  { id: 'kanjana', name: 'น.ส.กาญจนา ศรีสุข', role: 'แคชเชียร์', init: 'กา', bg: 'var(--plum-bg)', fg: 'var(--plum)', base: 10500 },
  { id: 'prasert', name: 'นายประเสริฐ แสงทอง', role: 'พนักงานคัดแยก', init: 'ปร', bg: 'var(--amber-bg)', fg: 'var(--amber)', base: 9800 },
  { id: 'malee', name: 'นางมาลี วงศ์ไทย', role: 'พนักงานชั่งของ', init: 'มา', bg: 'var(--green-100)', fg: 'var(--green-700)', base: 12000 },
];
for (const s of INITIAL_STAFF) {
  const already = db.prepare('SELECT id FROM staff WHERE id = ?').get(s.id);
  if (already) continue;
  db.prepare(
    'INSERT INTO staff (id, name, role, init, bg, fg, base) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(s.id, s.name, s.role, s.init, s.bg, s.fg, s.base);
  console.log(`สร้างพนักงานตั้งต้นสำเร็จ: ${s.name}`);
}
