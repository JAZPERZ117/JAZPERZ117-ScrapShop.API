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
