# Registers the daily database backup (backup-db.js) as a Windows Scheduled Task, running
# under the current user at 03:00 every day. Run this once per machine, from an ordinary
# PowerShell prompt — no Administrator rights needed for a task scoped to the current user.
#
# Limitation: LogonType Interactive means this only fires if the current user is logged in at
# 03:00. A task that runs even when logged out needs "S4U" logon with a stored password, or
# Administrator rights to register a SYSTEM task — neither available from here. If the shop's
# machine is routinely shut down or logged out overnight, pick a run time during business hours
# instead (edit -At below), or ask whoever has admin access to register it as a SYSTEM task.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$wrapperScript = Join-Path $scriptDir 'backup-and-push.ps1'

# backup-and-push.ps1 runs backup-db.js itself (as a child process, cwd set there) and then
# pushes the snapshot to BACKUP_DIR's git remote, so the task calls the wrapper instead of node
# directly.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapperScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$settings = New-ScheduledTaskSettingsSet -Hidden

Register-ScheduledTask -TaskName 'ScrapShop DB Backup' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Daily backup of the ScrapShop SQLite database, pushed to a private GitHub repo (server/scripts/backup-and-push.ps1)' -Force

Write-Host 'Registered. Verify with:'
Write-Host '  Get-ScheduledTask -TaskName "ScrapShop DB Backup"'
Write-Host 'Test it immediately with:'
Write-Host '  Start-ScheduledTask -TaskName "ScrapShop DB Backup"'
