# Registers a third Scheduled Task that runs watchdog.ps1 as soon as Windows starts, closing
# the same kind of recovery gap install-watchdog-wake-task.ps1 closes for sleep/resume, but for
# a full power-off and power-on cycle instead.
#
# Investigating a "backend was down" report traced back to
# `The process Explorer.EXE has initiated the power off of computer ... on behalf of user
# ...\PC-111 ... Shut-down Type: power off` in the System event log — a person shut the machine
# down through the normal Start menu, then powered it back on hours later. Because this
# machine's Fast Startup is on, that shutdown actually hibernates the kernel session, so the
# subsequent power-on shows up as `Kernel-Boot` "boot type: resume from hibernate" events rather
# than a `Kernel-Power` Event ID 107 "resumed from sleep" — the event
# install-watchdog-wake-task.ps1 listens for. That task correctly did not fire (this genuinely
# wasn't the sleep/resume case it covers); only the every-5-minutes interval task caught it. This
# task covers the power-off/power-on case the same way the other one covers sleep/resume, so
# either kind of restart gets an immediate check instead of waiting on the interval tick.
#
# Same LogonType Interactive limitation as this project's other Scheduled Tasks: this only fires
# once the target user has actually logged back in after the restart, not the instant hardware
# power comes on.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchdogScript = Join-Path $scriptDir 'watchdog.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdogScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERDOMAIN\$env:USERNAME
$settings = New-ScheduledTaskSettingsSet -Hidden

Register-ScheduledTask -TaskName 'ScrapShop Backend Watchdog - On Startup' -Action $action -Trigger $trigger `
  -Settings $settings `
  -Description 'Runs the backend health check as soon as this user logs back in after a restart or power-on, instead of waiting for the next 5-minute interval check' -Force

Write-Host 'Registered. Verify with:'
Write-Host '  Get-ScheduledTask -TaskName "ScrapShop Backend Watchdog - On Startup"'
Write-Host 'Test it immediately with:'
Write-Host '  Start-ScheduledTask -TaskName "ScrapShop Backend Watchdog - On Startup"'
Write-Host 'Recovery attempts (if any) are logged to server/watchdog.log'
