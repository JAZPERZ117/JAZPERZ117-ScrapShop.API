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
$backupScript = Join-Path $scriptDir 'backup-db.js'
$serverDir = Split-Path -Parent $scriptDir
$nodePath = (Get-Command node).Source

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$backupScript`"" -WorkingDirectory $serverDir
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'

Register-ScheduledTask -TaskName 'ScrapShop DB Backup' -Action $action -Trigger $trigger `
  -Description 'Daily backup of the ScrapShop SQLite database (server/scripts/backup-db.js)' -Force

Write-Host 'Registered. Verify with:'
Write-Host '  Get-ScheduledTask -TaskName "ScrapShop DB Backup"'
Write-Host 'Test it immediately with:'
Write-Host '  Start-ScheduledTask -TaskName "ScrapShop DB Backup"'
