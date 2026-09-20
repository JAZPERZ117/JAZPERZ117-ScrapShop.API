# Wraps backup-db.js with a git commit+push into BACKUP_DIR, so a snapshot actually leaves
# this machine instead of sitting in a folder on the same disk as shop.db itself. BACKUP_DIR
# (server/.env) must point at a git working copy of a PRIVATE repo — this app stores real
# customer PII (ID card numbers/photos), so pushing these snapshots anywhere public would leak
# that data to the internet. See D:\ScrapShop-DB-Backups\README.md for the repo this is meant
# to point at, and never repoint BACKUP_DIR at this app's own repo (public) or a public remote.
#
# Registered as the "ScrapShop DB Backup" Scheduled Task's action (see
# install-backup-task.ps1) in place of calling backup-db.js directly.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Split-Path -Parent $scriptDir
$backupScript = Join-Path $scriptDir 'backup-db.js'

# Read BACKUP_DIR out of server/.env the same way backup-db.js's dotenv load would, since this
# script runs as a separate process and needs the path before it can cd into it.
$envFile = Join-Path $serverDir '.env'
$backupDir = $null
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*BACKUP_DIR\s*=\s*(.+?)\s*$') { $backupDir = $matches[1] }
  }
}
if (-not $backupDir) {
  Write-Host 'BACKUP_DIR is not set in server/.env - backup-db.js will fall back to server/backups (same disk, not pushed anywhere). Set BACKUP_DIR to push snapshots off this machine.'
}

Push-Location $serverDir
try {
  & node $backupScript
} finally {
  Pop-Location
}

if (-not $backupDir -or -not (Test-Path $backupDir)) {
  exit 0
}

$isGitRepo = Test-Path (Join-Path $backupDir '.git')
if (-not $isGitRepo) {
  Write-Host "BACKUP_DIR ($backupDir) is not a git repo - skipping push. Run 'git init' and add a private remote there if you want backups pushed off this machine."
  exit 0
}

Push-Location $backupDir
try {
  git add -A
  # Nothing to commit is a normal, silent no-op (e.g. backup-db.js pruned an old file and wrote
  # a byte-identical new one, or this ran twice in the same day) - not an error.
  $status = git status --porcelain
  if ($status) {
    git commit -q -m "Backup $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git push -q origin main
    Write-Host 'Pushed backup snapshot to private GitHub repo.'
  } else {
    Write-Host 'No changes to push (backup identical to last snapshot, or none created).'
  }
} finally {
  Pop-Location
}
