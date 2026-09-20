// Backs up server/shop.db to BACKUP_DIR/shop-<timestamp>.db, then prunes backups older than
// RETENTION_DAYS. Run manually with `node scripts/backup-db.js`, or scheduled (see
// scripts/install-backup-task.ps1) to run automatically every day.
//
// Uses SQLite's own VACUUM INTO rather than a raw file copy: it takes a consistent snapshot
// through SQLite's normal transaction machinery, so a backup that runs while the live server
// (server/src/index.js, usually under pm2) has the database open mid-write still gets a valid,
// non-corrupt copy — a plain file copy could otherwise catch the file in a torn, partially
// written state.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'shop.db');
// Defaults to a folder next to shop.db, but is meant to be pointed (via server/.env) at a
// synced folder — OneDrive, Google Drive, etc. — or a git working copy that
// backup-and-push.ps1 pushes to a dedicated PRIVATE repo, so a backup actually leaves this
// machine instead of sitting on the same disk as the database it's a backup of. Never this
// app's own repo, and never a public remote of any kind: this app stores real customer PII
// (ID card numbers/photos), and this app's repo is public.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = 30;

if (!fs.existsSync(DB_PATH)) {
  console.log('shop.db does not exist yet — nothing to back up.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `shop-${stamp}.db`);

const db = new DatabaseSync(DB_PATH);
// Retry instead of failing outright if the live server happens to hold a brief write lock at
// the exact moment this runs — a shop's real traffic is low-volume enough that a few seconds
// of retrying is plenty to find a gap.
db.exec('PRAGMA busy_timeout = 5000');
db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
db.close();

console.log(`Backed up shop.db -> ${backupPath}`);

const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
for (const file of fs.readdirSync(BACKUP_DIR)) {
  if (!file.startsWith('shop-') || !file.endsWith('.db')) continue;
  const full = path.join(BACKUP_DIR, file);
  if (fs.statSync(full).mtimeMs < cutoff) {
    fs.unlinkSync(full);
    console.log(`Pruned old backup: ${file}`);
  }
}
