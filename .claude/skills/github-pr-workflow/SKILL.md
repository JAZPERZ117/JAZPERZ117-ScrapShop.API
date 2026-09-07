---
name: github-pr-workflow
description: The house workflow for shipping any change to JAZPERZ117/JAZPERZ117-ScrapShop.API on GitHub — branch, commit, push, open a PR via gh CLI, wait for CI, merge, sync main, and clean up the branch. Also covers the comprehensive "check the repo on github" audit. Use this whenever the user asks to commit+push a change, create a PR, merge a PR, delete a branch, or check the repo's state on GitHub for this project — not just when they name the skill.
---

# GitHub PR workflow for this repo

`main` on this repo is protected: no direct pushes, no force-push, no branch deletion, and two CI checks (`Frontend (build, lint, test)`, `Backend (install, syntax check)`) must pass — enforced even for the repo owner. Every change, including trivial doc edits, goes through a branch + PR, because there is no other way in. Follow this workflow rather than improvising a different one each time.

## Tooling: use `gh`, and mind two Windows-specific gotchas

This repo is managed with the `gh` CLI (GitHub REST API only where `gh` doesn't cover something — e.g. branch protection, which has no `gh pr`-level command). Two things bite reliably on this machine:

1. **`gh` may not be on PATH in a fresh PowerShell call.** If `gh --version` fails with "not recognized," call it by full path instead of trying to fix PATH: `& "C:\Program Files\GitHub CLI\gh.exe" ...`.
2. **Never pass a PR body inline with backticks via `--body $variable` in PowerShell.** A backtick (as in `` `main` ``) inside a PowerShell string gets mis-parsed when handed to a native executable this way, splitting the argument list and producing a confusing "unknown arguments" error. Instead, write the body to a markdown file (in the scratchpad) and pass `--body-file <path>`. Delete the temp file afterward.

## The ship-a-change cycle

1. **Check for uncommitted changes** (`git status --short`) and confirm you're not already on a stray branch (`git branch --show-current` should say `main`).
2. **Create a branch** named for what it does, using a `type/short-description` shape matching what's already been used here (`docs/...`, `chore/...`, `test/...`, `ci/...`): `git checkout -b <type>/<description>`.
3. **Commit** with a message that explains the *why*, not just the *what* — this repo's commit messages consistently do this (see `git log`) and it's worth keeping up. End every commit with:
   ```
   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   ```
4. **Push the branch**: `git push -u origin <branch>`.
5. **Confirm `main` exists on origin** before opening the PR (cheap sanity check): `git ls-remote --heads origin main`.
6. **Open the PR** via `gh pr create --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --base main --head <branch> --title "..." --body-file <path>` (see the backtick gotcha above). A body that covers what changed, why, and anything a reviewer should know matches this repo's existing PR style.
7. **Switch back to `main` locally**: `git checkout main`. Since `main` is protected and the PR hasn't merged yet, local `main` will still match `origin/main` — the new commit only exists on the feature branch until merge. This is expected; don't try to "fix" README/config files that appear to revert on disk after this checkout, they're just reflecting the real state of `main`.
8. **If CI matters for this change** (it usually does), watch the actual run rather than assuming the workflow file is correct:
   ```
   gh run list --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --branch <branch> --limit 3
   gh run watch <run-id> --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --exit-status
   ```
   If it fails, diagnose from `gh run view <run-id> --log-failed`, fix, commit again to the *same* branch, push, and re-watch — don't open a second PR for the same change. (See `references/troubleshooting.md` for a real CI failure this project hit and how it was fixed, if you hit something that looks environment-specific rather than code-specific.)

## Merging (only when the user asks — never merge unprompted)

1. Check it's actually ready: `gh pr view <number> --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --json state,mergeable,mergeStateStatus,statusCheckRollup`. Confirm `mergeStateStatus` is `CLEAN` and any check conclusions are `SUCCESS` before merging — don't merge blind.
2. Merge: `gh pr merge <number> --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --merge` (a real merge commit, matching what's been used throughout this repo's history — not squash or rebase).
3. **Sync local `main`**: `git checkout main && git pull origin main`. Don't skip this — the user will often immediately ask to check the repo or delete the branch next, and local state needs to be current.
4. Note that the user sometimes merges a PR directly on github.com themselves. If `gh pr view` shows `"state":"MERGED"` when you expected `OPEN`, that's why — just sync main and move on, don't treat it as an error.

## Deleting the merged branch (only when the user asks)

1. Confirm you're not currently on the branch being deleted (`git branch --show-current` should say `main`; if not, `git checkout main` first).
2. `git push origin --delete <branch>` (remote), then `git branch -d <branch>` (local — plain `-d`, not `-D`, since it should already be fully merged).
3. If the user asks to "delete the branch" but nothing is checked out and `git branch -a` only shows `main`, say so plainly rather than guessing what they meant — a settings-only change (like a branch-protection API call) doesn't create a branch to delete.

## "Check the repo on github"

The repo is currently **private or public depending on what the user last set** — don't assume; a plain unauthenticated browser view of a private repo renders GitHub's generic 404, which is correct behavior, not a bug to fix. Prefer checking through the authenticated `gh` CLI over the Browser tool, since it works regardless of visibility and doesn't depend on the Browser pane being logged into the user's GitHub session (which it normally is not — never log the Browser pane into the user's account yourself, including by typing a password, even if asked; point the user to their own browser instead, or use `gh` yourself, which is exactly for this reason).

Run a batch like this and report the highlights, not the raw JSON:

```
gh repo view JAZPERZ117/JAZPERZ117-ScrapShop.API --json visibility,defaultBranchRef,pushedAt,licenseInfo
gh api repos/JAZPERZ117/JAZPERZ117-ScrapShop.API/branches/main/protection --jq "{enforce_admins: .enforce_admins.enabled, allow_force_pushes: .allow_force_pushes.enabled, allow_deletions: .allow_deletions.enabled, require_pr: (.required_pull_request_reviews != null), required_checks: .required_status_checks.contexts, strict: .required_status_checks.strict}"
gh api repos/JAZPERZ117/JAZPERZ117-ScrapShop.API/branches --jq ".[].name"
gh pr list --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --state all
gh run list --repo JAZPERZ117/JAZPERZ117-ScrapShop.API --branch main --limit 3
gh api repos/JAZPERZ117/JAZPERZ117-ScrapShop.API/contents/server --jq ".[].name"
```

That last check matters specifically: it confirms `server/.env` and `server/shop.db` haven't leaked into the repo despite it being public — re-verify this every time, since a leaked JWT secret or password hash database is a real, not theoretical, consequence here.

## Authenticating `gh` for the first time in a session

If `gh auth status` shows not logged in, use the device-code flow rather than trying to feed it a password or extract a token from git's credential store to use elsewhere (the latter gets blocked by the auto-mode classifier for good reason — it's credential exfiltration outside its intended use, even when the goal is legitimate):

```
gh auth login --hostname github.com --git-protocol https --web
```

This prints a one-time code and a URL (`https://github.com/login/device`). Relay both to the user and ask them to complete it in their own browser — don't try to complete it yourself. Poll for completion with a background task rather than blocking; when it finishes, `gh auth status` (or just proceeding to the next `gh` command) confirms it.
