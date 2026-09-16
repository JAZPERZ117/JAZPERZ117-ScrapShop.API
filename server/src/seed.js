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

// Starting deduction reasons (see src/context/DeductionsContext.jsx's old INITIAL_REASONS).
const INITIAL_REASONS = [
  { id: 'wet', name: 'น้ำหนักเปียก', desc: 'สินค้าเปียกน้ำหรือมีความชื้นสูงกว่าปกติ', bg: 'var(--blue-bg)', fg: 'var(--blue)', type: 'percent', value: '5', active: 1 },
  { id: 'dirty', name: 'มีสิ่งปนเปื้อน', desc: 'มีดิน ทราย หรือสิ่งแปลกปลอมปนเปื้อน', bg: 'var(--amber-bg)', fg: 'var(--amber)', type: 'percent', value: '8', active: 1 },
  { id: 'package', name: 'หักน้ำหนักบรรจุภัณฑ์', desc: 'หักน้ำหนักถุง กล่อง หรือภาชนะที่ปนมา', bg: 'var(--plum-bg)', fg: 'var(--plum)', type: 'fixed', value: '1.5', active: 1 },
  { id: 'rusty', name: 'เหล็กเป็นสนิมมาก', desc: 'คุณภาพต่ำกว่ามาตรฐานรับซื้อปกติ', bg: 'var(--rose-bg)', fg: 'var(--rose)', type: 'percent', value: '10', active: 1 },
  { id: 'scale', name: 'ปรับตามเครื่องชั่ง', desc: 'ส่วนต่างจากการสอบเทียบเครื่องชั่ง', bg: 'var(--teal-bg, #E4F6F4)', fg: 'var(--teal, #0E8E82)', type: 'fixed', value: '20', active: 1 },
  { id: 'broken', name: 'แก้วแตกร้าว', desc: 'ขวดแก้วแตกหรือชำรุดเกินมาตรฐาน', bg: 'var(--bg)', fg: 'var(--ink-500)', type: 'percent', value: '15', active: 0 },
  { id: 'other', name: 'อื่นๆ (ระบุเอง)', desc: 'พิมพ์เหตุผลเพิ่มเติมได้เองในหน้ารับซื้อของ', bg: 'var(--green-100)', fg: 'var(--green-700)', type: 'fixed', value: '0', active: 1 },
];
for (const r of INITIAL_REASONS) {
  const already = db.prepare('SELECT id FROM deduction_reasons WHERE id = ?').get(r.id);
  if (already) continue;
  db.prepare(
    'INSERT INTO deduction_reasons (id, name, desc, bg, fg, type, value, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(r.id, r.name, r.desc, r.bg, r.fg, r.type, r.value, r.active);
  console.log(`สร้างเหตุผลหักน้ำหนักตั้งต้นสำเร็จ: ${r.name}`);
}

// Starting categories (see src/context/CategoriesContext.jsx's old INITIAL_CATEGORIES_RAW).
// sort_order here is just the seed's natural display order (0..N-1).
const INITIAL_CATEGORIES = [
  { id: 'metal', name: 'โลหะ', iconKey: 'metal', color: 'amber', desc: 'เศษโลหะทุกชนิด เช่น เหล็ก ทองแดง อลูมิเนียม สแตนเลส และทองเหลือง', isActive: 1 },
  { id: 'paper', name: 'กระดาษ', iconKey: 'paper', color: 'blue', desc: 'กระดาษลัง กระดาษหนังสือพิมพ์ กระดาษขาว-ดำ และกระดาษรวม', isActive: 1 },
  { id: 'plastic', name: 'พลาสติก', iconKey: 'plastic', color: 'plum', desc: 'ขวดพลาสติก ถุงพลาสติก และพลาสติกแข็งทุกชนิด', isActive: 1 },
  { id: 'glass', name: 'แก้ว', iconKey: 'glass', color: 'teal', desc: 'ขวดแก้วใส ขวดแก้วสี และเศษแก้วทุกชนิด', isActive: 1 },
  { id: 'electronics', name: 'อิเล็กทรอนิกส์', iconKey: 'electronics', color: 'rose', desc: 'อุปกรณ์อิเล็กทรอนิกส์เก่า แผงวงจร และสายไฟ (ปิดใช้งานชั่วคราว)', isActive: 0 },
  { id: 'other', name: 'อื่นๆ', iconKey: 'other', color: 'slate', desc: 'สินค้าเบ็ดเตล็ดที่ไม่เข้าหมวดหมู่หลัก', isActive: 1 },
];
INITIAL_CATEGORIES.forEach((c, i) => {
  const already = db.prepare('SELECT id FROM categories WHERE id = ?').get(c.id);
  if (already) return;
  db.prepare(
    'INSERT INTO categories (id, name, icon_key, color, desc, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(c.id, c.name, c.iconKey, c.color, c.desc, c.isActive, i);
  console.log(`สร้างหมวดหมู่ตั้งต้นสำเร็จ: ${c.name}`);
});

// Starting scale devices (see src/context/ScalesContext.jsx's old INITIAL_DEVICES). A real
// deployment keeps this device list as a starting point (renamed/edited later by the shop), but
// starts with no calibration history — that hasn't happened yet. "main" ships as the one flagged
// active, matching the old client-side default.
const INITIAL_SCALES = [
  { id: 'main', name: 'เครื่องชั่งหลัก', model: 'CAS DB-II 300kg', bg: 'var(--blue-bg)', fg: 'var(--blue)', port: 'COM4', conn: 'สาย USB / RS-232', max: '300 กก.', res: '0.01 กก.', status: 'on', active: 1 },
  { id: 'dock', name: 'เครื่องชั่งลานหลังร้าน', model: 'Yamato DP-6900 500kg', bg: 'var(--plum-bg)', fg: 'var(--plum)', port: 'YM-6900-A2', conn: 'Bluetooth', max: '500 กก.', res: '0.1 กก.', status: 'on', active: 0 },
  { id: 'mobile', name: 'เครื่องชั่งเคลื่อนที่', model: 'Tanita KD-200 60kg', bg: 'var(--bg)', fg: 'var(--ink-500)', port: 'COM7', conn: 'สาย USB / RS-232', max: '60 กก.', res: '0.005 กก.', status: 'off', active: 0 },
];
INITIAL_SCALES.forEach((s, i) => {
  const already = db.prepare('SELECT id FROM scales WHERE id = ?').get(s.id);
  if (already) return;
  db.prepare(
    'INSERT INTO scales (id, name, model, bg, fg, port, conn, max, res, status, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(s.id, s.name, s.model, s.bg, s.fg, s.port, s.conn, s.max, s.res, s.status, s.active, i);
  console.log(`สร้างเครื่องชั่งตั้งต้นสำเร็จ: ${s.name}`);
});

// Starting shop settings (see src/context/SettingsContext.jsx's old INITIAL_SETTINGS) — a
// single fixed row, id 'shop', since this app only ever manages one shop's settings.
const alreadySettings = db.prepare("SELECT id FROM settings WHERE id = 'shop'").get();
if (!alreadySettings) {
  db.prepare(
    `INSERT INTO settings (id, shop_name, tax_id, address, phone, hours, receipt_footer, remember30, pin_login)
     VALUES ('shop', ?, ?, ?, ?, ?, ?, 1, 1)`
  ).run(
    'ร้าน อ.อนงค์ค้าของเก่า',
    '3-1009-XXXXX-XX-X',
    '99/4 หมู่ 3 ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี',
    '077-456-789',
    '08:00 – 17:30 น.',
    'ขอบคุณที่ใช้บริการ · โปรดเก็บใบเสร็จไว้เป็นหลักฐาน'
  );
  console.log('สร้างค่าตั้งต้นของร้านสำเร็จ');
}
