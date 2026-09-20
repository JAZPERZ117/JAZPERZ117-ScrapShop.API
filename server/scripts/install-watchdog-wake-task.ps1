# Registers a second Scheduled Task that runs watchdog.ps1 immediately when Windows resumes
# from sleep, instead of waiting for the next tick of the every-5-minutes task
# (install-watchdog-task.ps1). Investigating watchdog.log showed every recorded recovery lined
# up with a sleep/wake cycle: pm2's daemon talks to its workers over named pipes that don't
# survive a suspend/resume, so the whole daemon (not just the app) is gone the moment the
# machine wakes up, and the interval task simply catches it up to 5 minutes later. This closes
# that gap to seconds. Run once per machine, alongside install-watchdog-task.ps1 — the two tasks
# are independent and both call the same watchdog.ps1, so running either one twice in quick
# succession (e.g. a wake event landing right before a scheduled tick) is harmless: HealthCheck
# short-circuits to a no-op exit when the backend is already fine.
#
# Event ID 107 from Microsoft-Windows-Kernel-Power ("The system has resumed from sleep") fires
# on every resume, including brief modern-standby dips — cheap to react to since a healthy
# HealthCheck exits immediately without touching pm2.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchdogScript = Join-Path $scriptDir 'watchdog.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdogScript`""

# New-ScheduledTaskTrigger has no built-in "on resume" option, so the event trigger is built
# directly from the CIM class Task Scheduler itself uses for "On an event" triggers, subscribed
# to the same System-log query the Task Scheduler GUI would produce for
# Log: System, Source: Kernel-Power, Event ID: 107.
$eventTriggerClass = Get-CimClass -ClassName MSFT_TaskEventTrigger -Namespace Root/Microsoft/Windows/TaskScheduler
$trigger = New-CimInstance -CimClass $eventTriggerClass -ClientOnly
$trigger.Subscription = @'
<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=107)]]</Select></Query></QueryList>
'@
$trigger.Enabled = $true

$settings = New-ScheduledTaskSettingsSet -Hidden

Register-ScheduledTask -TaskName 'ScrapShop Backend Watchdog - On Wake' -Action $action -Trigger $trigger `
  -Settings $settings `
  -Description 'Runs the backend health check immediately when the machine wakes from sleep, instead of waiting for the next 5-minute interval check' -Force

Write-Host 'Registered. Verify with:'
Write-Host '  Get-ScheduledTask -TaskName "ScrapShop Backend Watchdog - On Wake"'
Write-Host 'Test it immediately with:'
Write-Host '  Start-ScheduledTask -TaskName "ScrapShop Backend Watchdog - On Wake"'
Write-Host 'Recovery attempts (if any) are logged to server/watchdog.log'
