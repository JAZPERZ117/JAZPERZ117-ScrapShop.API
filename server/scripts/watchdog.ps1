# Runs every few minutes (see install-watchdog-task.ps1) to catch the backend being down
# between Windows logons — pm2-windows-startup only resurrects pm2 at logon, so if the pm2
# daemon itself dies mid-session (crash, killed, etc.) nothing brings it back until the next
# login without this. Also guards against the specific failure this was written after: a stray
# `node src/index.js` run outside pm2's management grabbing port 4000, which makes pm2's own
# managed instance crash-loop forever (EADDRINUSE) without ever actually serving anything.
$ErrorActionPreference = 'Continue'
$logFile = Join-Path $PSScriptRoot '..\watchdog.log'

function Log($msg) {
  Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
}

function HealthCheck {
  try {
    $code = & curl.exe -sk -o NUL -w '%{http_code}' https://localhost:4000/api/health 2>$null
    return $code -eq '200'
  } catch {
    return $false
  }
}

function Pm2Pids {
  try {
    return (& pm2 jlist 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq 'scrapshop-api' } | ForEach-Object { $_.pid }
  } catch {
    return @()
  }
}

# Checking HTTP 200 alone isn't enough: the exact incident this watchdog exists to prevent was
# an orphan `node src/index.js` (started outside pm2, e.g. by hand during debugging) serving
# requests just fine on port 4000 while pm2's own managed instance crash-looped uselessly
# behind it (EADDRINUSE) — a plain health check would call that "healthy" and never notice pm2
# itself wasn't the one actually running. So also confirm whatever's listening on port 4000 is
# a pid pm2 itself is tracking, not just that something responds.
$listenPid = (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
$managedByPm2 = $listenPid -and ((Pm2Pids) -contains $listenPid)

if ((HealthCheck) -and $managedByPm2) {
  exit 0  # genuinely healthy — pm2 itself is what's actually serving
}

Log 'Health check failed or backend not managed by pm2 - attempting recovery'

# Kill anything holding port 4000 that pm2 doesn't recognize as its own managed process.
$conns = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  $pm2Pids = Pm2Pids
  foreach ($c in $conns) {
    if ($pm2Pids -notcontains $c.OwningProcess) {
      Log "Killing orphaned process $($c.OwningProcess) holding port 4000"
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

Start-Sleep -Seconds 2

# `pm2 resurrect` only (re)launches processes the daemon has no record of at all — a process
# that's merely stopped/errored (still known to a running daemon) needs `pm2 restart` instead,
# or resurrect silently no-ops and leaves it stopped. Try restart first since that's the more
# common case (daemon alive, process crashed); fall back to resurrect for "daemon just started
# fresh and has nothing registered yet", then a direct start as a last resort. pm2's own table
# output goes nowhere useful in a log file (box-drawing characters, ANSI color) — log only
# which step ran and whether it worked, not pm2's raw output.
& pm2 restart scrapshop-api --update-env *> $null
Log 'Ran: pm2 restart scrapshop-api'

if (-not (HealthCheck)) {
  & pm2 resurrect *> $null
  Log 'Ran: pm2 resurrect (restart alone did not bring it back)'
}

if (-not (HealthCheck)) {
  Push-Location (Join-Path $PSScriptRoot '..')
  & pm2 start ecosystem.config.js *> $null
  Pop-Location
  Log 'Ran: pm2 start ecosystem.config.js (resurrect still did not bring it back)'
}

Start-Sleep -Seconds 3
if (HealthCheck) {
  Log 'Recovery successful'
} else {
  Log 'Recovery FAILED - still not responding after all recovery attempts'
}
