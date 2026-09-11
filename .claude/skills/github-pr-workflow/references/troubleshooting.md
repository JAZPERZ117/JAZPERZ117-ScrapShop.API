# CI troubleshooting log

## jsdom crashes on the Linux CI runner, passes locally on Windows

**Symptom**: `npm test` (Vitest) failed in GitHub Actions with:

```
Error: [vitest-pool]: Failed to start forks worker for test files ...
Caused by: TypeError: webidl.util.markAsUncloneable is not a function
  at new CacheStorage node_modules/undici/lib/web/cache/cachestorage.js
```

The same `npm ci && npm test`, on the same Node major version, passed cleanly on the Windows machine developing the change — including after `rm -rf node_modules && npm ci` to rule out local state drift. That ruled out the test code itself; the crash happens merely from `jsdom` initializing its window globals (this test suite never touches `fetch`/Cache APIs), and it was platform-specific (Linux runner vs Windows dev machine) rather than Node-version-specific.

**Fix**: switch the Vitest `environment` from `jsdom` to `happy-dom` in `vite.config.js`, and swap the dependency (`npm uninstall jsdom && npm install -D happy-dom`). `happy-dom` doesn't pull in the same `undici`-based Cache API implementation, so it sidesteps the bug entirely. It's also the standard alternative most Vitest setups already reach for.

**Lesson for next time**: if a test failure only reproduces in CI and not locally, don't assume the test code is wrong — reproduce the exact CI command (`npm ci`, not `npm install`) locally first to rule out a lockfile/dependency-resolution difference, and if it still only fails in CI, suspect the DOM/runtime shim (jsdom) before the test logic. Fix forward on the same PR branch and re-watch the run rather than opening a new PR.

## `server/` couldn't `npm install` on a fresh Windows machine — `better-sqlite3` needed a C++ compiler

**Symptom**: `npm install` (and `npm ci`) in `server/` failed with node-gyp errors — first "Could not find any Python installation to use", then after installing Python, "Could not find any Visual Studio installation to use ... You need to install the latest version of Visual Studio including the 'Desktop development with C++' workload." `better-sqlite3` compiles a native module on install, and this machine had neither toolchain present.

**What made it worse**: installing Visual Studio Build Tools via `winget` from an automated (non-interactive) session failed twice with exit code 1602 — the installer's decompression log showed `Error 0x80070642: Failed to start the process` / `User may have declined UAC prompt`. An automated session has no way to click "Yes" on a UAC elevation dialog, so any install step that requires admin elevation cannot be completed this way — it has to be run by the user themselves (an elevated terminal, or the Visual Studio Installer GUI), not attempted repeatedly from automation.

**Real fix (better than fighting the toolchain)**: `better-sqlite3` v13.0.3 ships no prebuilt binaries at all (checked its GitHub release assets — zero), so there was no way to dodge the native compile by picking a different Node version either. Instead, swap the dependency for Node's own built-in `node:sqlite` module (`DatabaseSync`), which has the same synchronous `prepare(sql).get()/.run()`/`.exec()` API `better-sqlite3` used here and needs zero native compilation — stable from Node 22.5+. This is a straight drop-in for `server/src/db.js`; `index.js`/`seed.js` needed no changes since they only ever called methods through the `db` object `db.js` exports. Existing `.db` files created by `better-sqlite3` open fine under `node:sqlite` too — it's still just a standard SQLite file. Once swapped, bump `server/package.json`'s `engines.node` and the CI workflow's backend job to Node 22, and remove any README/prereq notes about Python/C++ build tools — they no longer apply.

**Lesson for next time**: before spending time getting a native-module toolchain (Python, node-gyp, a C++ compiler) working, check whether the dependency actually needs it — for something as commonly-needed as "a SQLite driver," Node's own standard library may already cover it without any of that.
