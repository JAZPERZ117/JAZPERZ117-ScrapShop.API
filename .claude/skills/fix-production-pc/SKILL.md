---
name: fix-production-pc
description: Diagnose and directly fix problems with the D:\Scrap production machine — the pm2-managed backend, its watchdog scheduled tasks, Windows power settings, and the SQLite database on this PC. Use whenever the user reports something wrong with production, asks to check whether the server/backend/computer is healthy, mentions the shop system being down or slow, or says something like "ถ้าเกิดอะไรขึ้น ช่วยแก้ไขให้ด้วย" (if something happens, fix it). The user has given standing authorization to investigate and fix production infrastructure issues directly rather than just reporting them back — this machine is an ordinary desktop PC, not a dedicated server, so PC-level causes (sleep, power settings, orphaned processes) are as likely as application bugs.
---

# Fix production PC: D:\Scrap

This machine runs the real production backend for the shop's app — an ordinary Windows desktop PC, not a dedicated always-on server. The user has explicitly asked that production problems be investigated and fixed directly when reported, not just diagnosed and handed back. Treat that as standing authorization to restart the backend, edit scheduled tasks, and adjust power settings on this machine as needed to resolve a reported issue — but still explain what you're about to do before doing it (per the user's standing "explain before acting" preference), and still ask before anything genuinely destructive (wiping the database, force-pushing, discarding real data).

## Architecture, so you know what "healthy" looks like

- **Backend**: `server/src/index.js`, an Express API on port 4000, managed by pm2 under the name `scrapshop-api` (see `server/ecosystem.config.js`, fork mode, one instance). Serves HTTPS if `server/certs/cert.pem`/`key.pem` both exist, otherwise falls back to plain HTTP on the same port — check which before assuming a protocol when curling `/api/health`.
- **Database**: `server/shop.db`, SQLite via Node's built-in `node:sqlite` (not better-sqlite3). Real shop data lives here — receipts, customers, products, staff. Treat it with the same care as any production database.
- **Frontend**: a Vite dev server (`npm run dev`, port 5173) — not a persistent production process; it's started on demand (e.g. via this session's `preview_start`) rather than running continuously under pm2.
- **Watchdog**: two independent Scheduled Tasks, both hidden-window, both just call `server/scripts/watchdog.ps1`:
  - `ScrapShop Backend Watchdog` — runs every 5 minutes (`install-watchdog-task.ps1`).
  - `ScrapShop Backend Watchdog - On Wake` — fires immediately on Windows `Kernel-Power` Event ID 107 ("system resumed from sleep") (`install-watchdog-wake-task.ps1`), added specifically because pm2's daemon does not reliably survive a sleep/wake cycle (its RPC/PUB named pipes break), so the app-level process can vanish entirely the moment the machine wakes — this task closes the gap instead of waiting for the next 5-minute tick.
  - Recovery attempts are logged to `server/watchdog.log` — a healthy check is silent (no line written); only failures/recoveries get logged.
- **DB backup**: `ScrapShop DB Backup` Scheduled Task (`install-backup-task.ps1` / `backup-db.js`) — check this too if disk space or backup freshness is ever in question.
- **Power settings**: sleep/hibernate idle timeouts were deliberately set to 0 (never) on both AC and DC via `powercfg`, since this machine is meant to run the backend continuously. If sleep-correlated failures reappear, check whether these got reset (Windows Update, a Windows reinstall, or someone changing the power plan can silently revert this).

## Diagnostic checklist

Work through these in order — most production issues on this machine show up in the first two or three checks:

1. **`pm2 status`** — is `scrapshop-api` `online`? Check `pid`, `uptime`, and the `↺` restart counter (this only counts crash-triggered auto-restarts, not manual `pm2 restart`/watchdog-driven ones, so a nonzero count here means the app itself is crashing, not just the daemon dying on sleep).
2. **Health check**: `curl -sk https://localhost:4000/api/health` (or `http://` if no certs — see above). Expect `{"ok":true}`.
3. **`tail server/watchdog.log`** — recent recovery attempts and their outcome. If recoveries cluster with no fixed pattern, suspect sleep/wake (see step 5); if they're truly random or frequent, suspect an actual app crash — check step 4.
4. **`~/.pm2/pm2.log`** (`C:\Users\<user>\.pm2\pm2.log`) — look for "New PM2 Daemon started" entries (the whole daemon died, not just the app) vs. "App [scrapshop-api:0] exited with code..." entries (the app itself crashed while the daemon survived — this points to an actual bug, e.g. an unhandled exception in `index.js`, not a sleep/wake issue). Cross-reference timestamps against watchdog.log.
5. **Correlate with sleep/wake** if failures recur without an obvious app-level cause: `Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power','Microsoft-Windows-Power-Troubleshooter'} | Where-Object {$_.Id -in 42,107,1}` — a "returned from a low power state" (Id 1) timestamp landing a few minutes before a watchdog recovery is the signature of the sleep/wake daemon-death issue already fixed once; if power settings got reset, redo the `powercfg` changes above.
6. **Both scheduled tasks' state**: `Get-ScheduledTask -TaskName "ScrapShop Backend Watchdog*" | ForEach-Object { Get-ScheduledTaskInfo -TaskName $_.TaskName }` — confirm `Ready`/enabled, check `LastTaskResult` (0 = success) and `LastRunTime` looks recent/sane.
7. **Orphaned process on port 4000**: `Get-NetTCPConnection -LocalPort 4000 -State Listen` — if the owning pid isn't one pm2 recognizes (`pm2 pid scrapshop-api`), something outside pm2's management (e.g. a manually-run `node src/index.js` during debugging) is squatting on the port and needs killing before pm2 can bind it.
8. **SQL errors**: if a specific feature is failing (not the whole backend), grep the relevant query in `server/src/index.js` and manually count `?` placeholders against the bound parameter list — this exact bug class ("receipt save failing on every purchase") has recurred here before.

## Fixing and shipping the fix

- For a live, low-risk restart (`pm2 restart scrapshop-api --update-env`) needed to pick up a code change or clear a stuck state: just do it and verify with the health check afterward — no need to ask first, this is exactly the kind of production intervention the user asked to have handled directly.
- For code changes: `develop` and `main` are both protected branches requiring a PR (`gh pr create`), with two required status checks ("Frontend (build, lint, test)", "Backend (install, syntax check)"). Follow the same branch-per-fix, open-PR, merge-when-green, then **sync the other branch too** (`main`↔`develop` — this repo keeps both in sync after every merge; see `git log` for the `sync/develop-into-main-N` / `sync/main-into-develop-N` naming convention already in use) workflow used in prior sessions. `gh pr merge` is sometimes blocked by this environment's own auto-mode classifier ("Merge Without Review") even after the user asked for it — if that happens, tell the user plainly and ask them to click merge on GitHub themselves, then retry the CLI merge afterward (it may go through once already merged, or succeed on a later attempt).
- For Scheduled Task / power-setting changes: edit the install script under `server/scripts/`, re-run it to apply on this machine immediately, verify (`Get-ScheduledTaskInfo`, a manual `Start-ScheduledTask` test run), then still commit + PR the script change so the next machine/reinstall picks it up too.

## Testing sleep/wake behavior safely

Never trigger a real sleep (`rundll32.exe powrprof.dll,SetSuspendState 0,1,0` or similar) without first registering a one-time Scheduled Task with `-WakeToRun` a few minutes out as a safety net — the agent session itself runs on this same machine and will stop responding for the entire duration of the sleep, with no way to un-sleep it from the inside. Without a wake timer, the machine could stay asleep indefinitely until someone physically touches it. After testing, delete the temporary safety-net task. Note that even a successful wake-triggered recovery doesn't eliminate downtime — the whole machine is unreachable for the full sleep duration regardless of how fast pm2 recovers afterward, so keeping sleep disabled in the first place is the real fix; the wake trigger is only a safety net for if sleep ever gets re-enabled.

## Verifying a fix

After any fix, confirm via the diagnostic checklist above (pm2 status, health check, relevant scheduled task) rather than assuming the fix worked from code alone. If the issue was frontend-visible, do a light live check with the browser tools (`preview_start` with the `scrap-dev` launch config, log in, check console errors) — but avoid creating test purchases/receipts against the real database unless necessary, and if you do, void/delete the test record afterward (see this project's `audit-and-fix` skill for the established cleanup pattern).
