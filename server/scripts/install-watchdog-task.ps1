# Registers watchdog.ps1 as a Windows Scheduled Task that runs every 5 minutes, indefinitely,
# under the current user. Run once per machine from an ordinary PowerShell prompt — no
# Administrator rights needed for a task scoped to the current user.
#
# Limitation: same as install-backup-task.ps1 — LogonType Interactive means this only runs
# while the current user is logged in. It closes the gap between "pm2 dies mid-session" and
# "next Windows logon", but doesn't replace a real always-on Windows Service (needs
# Administrator rights this environment doesn't have).

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchdogScript = Join-Path $scriptDir 'watchdog.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`""
# Task Scheduler's XML duration format can't represent [TimeSpan]::MaxValue (it overflows the
# schema's range) — 10 years is effectively "forever" for a task meant to run indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)

Register-ScheduledTask -TaskName 'ScrapShop Backend Watchdog' -Action $action -Trigger $trigger `
  -Description 'Checks every 5 minutes that the ScrapShop backend is responding, and recovers it via pm2 if not' -Force

Write-Host 'Registered. Verify with:'
Write-Host '  Get-ScheduledTask -TaskName "ScrapShop Backend Watchdog"'
Write-Host 'Test it immediately with:'
Write-Host '  Start-ScheduledTask -TaskName "ScrapShop Backend Watchdog"'
Write-Host 'Recovery attempts (if any) are logged to server/watchdog.log'
