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
