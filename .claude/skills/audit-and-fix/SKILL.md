---
name: audit-and-fix
description: Systematic audit-and-fix pass for the D:\Scrap scrap-yard shop app — walks every page/menu looking for known recurring bug classes (crash-on-delete, StrictMode id desync, unreversed void/cancel side effects, inconsistent totals, timezone date-shift, dark-mode invisible inputs, fake settings toggles, misleading UI copy, name-based data references), fixes confirmed issues, and verifies live in the browser. Use this skill whenever the user asks to "test", "audit", "check", "review", or "make sure everything works" in this app, whenever they report something feels broken or fake without pinpointing where, before/after adding a new page or context, or whenever they say a menu/button "should actually do something" — even if they don't name a specific bug.
---

# Audit and fix: D:\Scrap

This app's guiding rule, stated repeatedly by the user, is that **every menu, button, and number must be genuinely functional** — nothing cosmetic, no hardcoded stats standing in for real data, no control that writes to state but is never read anywhere. When asked to audit, review, or "make sure X works," the job is to find violations of that rule and fix them, not just skim the UI for visual polish.

## Why a checklist instead of open-ended poking

This codebase has a small number of architectural patterns (localStorage-backed React Context providers, one per domain: Products, Customers, Deductions, Deliveries, Payroll, Receipts...) and the same handful of bug shapes keep recurring across them because they all follow similar conventions. Rather than re-discovering these from scratch each session, work through the checklist below against every page and every context provider. Not every item applies to every file — use judgment about which patterns are actually present.

## The process

1. **Read before touching.** For each page/context under audit, read the full file (these files run long — don't rely on a partial read). Understand what state it owns, what actions mutate it, and what other contexts it calls into (e.g. `ScrapPurchase.jsx` calls into `ProductsContext.addStock` and `CustomersContext.recordPurchase`).
2. **Check against the bug classes below.** For each one that plausibly applies, trace the actual code path rather than assuming — these bugs are subtle enough that "looks fine" on a skim is not sufficient.
3. **Fix confirmed bugs** in place. Keep fixes minimal and consistent with the surrounding code's style (Thai-language UI strings, `฿`/`กก.` formatting helpers, the existing comment style explaining *why*).
4. **Verify live**, per the browser workflow below — don't report a fix as done from code-reading alone.
5. **Clean up.** Any test records created in localStorage during verification (test customers, test purchases, test receipts) should be deleted before finishing, so they don't pollute the user's real data.
6. **Rebuild and lint** before declaring the pass complete.

## Bug classes to check for

**1. Crash when the last item in a list is deleted.**
Look for `selectedId`/`activeId` state that isn't re-pointed after a delete, and for `useState` initializers that hardcode a literal seed key (e.g. `useState('wet')`, `reasons.wet.type`) instead of deriving from `order[0]`. A page that seeds its selection from a literal id crashes the instant that *specific* seeded item is deleted, even while other items remain — this is easy to miss because deleting any *other* item looks fine. Either guard against deleting the last remaining item, or make the empty-state render path actually handle zero items gracefully, and derive default selections from the live `order` array, not a literal.

**2. React 18 StrictMode purity bugs in state updaters.**
Never call `Date.now()`, `Math.random()`, or `new Date()` *inside* a `setState(prev => ...)` updater body. StrictMode double-invokes updaters in dev, so a non-deterministic value computed inside the updater differs between the two invocations. This is dangerous specifically when two related pieces of state need to agree on the same generated id (e.g. an id written into a `products` map vs. the same id pushed into an `order` array) — a desync makes the new item permanently invisible even though it exists in state. Compute the id/timestamp once, outside and before the `setState` call, then close over that fixed value inside the updater. `ProductsContext.jsx`'s `addStock` already does this correctly — use it as the reference pattern.

**3. Void/cancel/delete actions that don't reverse earlier side effects.**
If creating a record (a purchase, a delivery) pushes updates into other contexts — stock levels, customer lifetime totals — then voiding or cancelling that record must call the inverse operation (see `removeStockByName` / `reversePurchase` in this codebase) rather than just flipping a `status: 'voided'` flag. A flag-only void leaves stock and customer stats permanently overstated.

**4. Inconsistent filtering between sibling totals.**
When a page computes two related totals from the same list (e.g. total weight and total amount, or count and sum), check that both filter out voided/cancelled records identically. A totals bug is often one line: one total's `.filter()` excludes voided rows, the sibling's `.reduce()` doesn't.

**5. Baseline-plus-delta stat fields that drift apart.**
Some "this month" style stats in this app are `hardcoded historical baseline + live delta from new records`. If a page has two such fields side by side (e.g. weight and amount both meant to represent "this month"), check that both actually add their baseline — it's easy for one field's calculation to be copy-pasted and forget the `+ baseline` term, producing a ratio between the two fields that doesn't match reality.

**6. Timezone date-shift from `.toISOString()`.**
Building a `YYYY-MM-DD` date key from a local `Date` via `.toISOString()` converts to UTC first, which can silently shift the date by one day for users west of UTC (including Thailand's UTC+7 for late-night entries, or more commonly for any deployment that isn't UTC-aligned to local midnight). Grep for `.toISOString()` used for date-key purposes and replace with manual `getFullYear()`/`getMonth()`/`getDate()` string-building.

**7. Dark-mode invisible form inputs.**
Any CSS rule for `input`, `select`, or `textarea` (including `:focus` variants) that sets a `background` but never sets an explicit `color` anywhere in that selector's chain falls back to the browser default text color (often black), which disappears against a dark background. Grep the stylesheet(s) for form-element selectors with `background:` and confirm each one also has a `color:` rule.

**8. Fake settings/toggles.**
A checkbox or select in a settings page that writes into persisted state but that no other code ever reads is decorative. Grep for where a setting's state variable is actually consumed; if nothing reads it, either wire it to real behavior or remove it — don't leave the user thinking a control does something it doesn't.

**9. UI copy that contradicts actual behavior.**
Placeholder text or helper copy that promises an outcome ("this will be recorded as...", "leaving this blank will...") should be checked against the actual validation/submit logic. These drift apart when the copy was written before the logic was finalized, or vice versa.

**10. Name-string references instead of stable ids.**
Some cross-context lookups in this app match by display name rather than id (e.g. `ProductsContext.addStock`/`removeStockByName`, matched by `productName`) because the calling form only has a name available. This is a known, accepted pattern here — but when auditing, confirm that renaming the referenced entity (e.g. renaming a product) doesn't silently orphan records that pointed to the old name. If it does and the rename path is real user-facing functionality, it needs a cascade-update; if renaming isn't actually exposed to the user, it's not a live bug.

## Live browser verification

Use the Browser pane tools (`preview_start` with the project's dev-server launch config, then `read_page`, `computer`, `read_console_messages`) to actually exercise each fix — click the flow, don't just re-read the diff.

- **Run interactive browser passes sequentially, never in parallel.** If you dispatch multiple testing agents, only one at a time may drive the Browser pane — all agents and the parent session share the same underlying browser tabs, so two agents clicking around concurrently will each see the other's actions as unexplained interference and produce false bug reports. Parallelize read-only code review across agents freely; serialize anything that touches the live browser.
- **Context files may not hot-reload reliably.** Files under `src/context/` that export both a component and plain helper functions/constants (common in this codebase, e.g. `ProductsContext.jsx` exporting `INITIAL_PRODUCTS_RAW`) defeat Vite Fast Refresh. After editing a context file, restart the dev server (or at minimum hard-reload) rather than trusting HMR, to avoid verifying against stale logic.
- Check `read_console_messages` for errors after every interaction, not just on page load.

## Before declaring the pass done

1. `npm run build` — catches syntax errors HMR would have silently tolerated.
2. `npm run lint` — catches dead code (e.g. a fake toggle you decided to leave but should have flagged, or state now unused after a fix).
3. Live verification per above, with a console-error check.
4. Delete any test data (test customers, test receipts, test products) written to localStorage during verification, so the user's real data isn't polluted by the audit itself.
