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
  // Deliberately seeded inactive — a worked demo example of a disabled account in the Users page.
  { username: 'prasert_sort', displayName: 'นายประเสริฐ แสงทอง', role: 'พนักงานชั่งของ', pin: '9012', active: 0 },
];
for (const staff of DEMO_STAFF) {
  const already = db.prepare('SELECT id FROM users WHERE username = ?').get(staff.username);
  if (already) continue;
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, pin, active) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(staff.username, '', staff.displayName, staff.role, staff.pin, staff.active);
  console.log(`สร้างผู้ใช้งานตัวอย่างสำเร็จ: ${staff.displayName} (PIN ${staff.pin})`);
}
