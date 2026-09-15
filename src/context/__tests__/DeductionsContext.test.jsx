import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeductionsProvider, useDeductions } from '../DeductionsContext.jsx';

function jsonResponse(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

// Deduction reasons (and their usage counters) now live server-side (server/src/index.js's
// /api/deduction-reasons routes), not in this context's own state — this is a small in-memory
// stand-in for that server, close enough to its real increment/decrement-usage math to still
// exercise the round-trip invariants below through the context's real fetch calls.
function installFakeReasonsApi() {
  const store = {
    wet: { id: 'wet', name: 'น้ำหนักเปียก', desc: '', bg: '', fg: '', type: 'percent', value: '5', uses: 0, total: 0, active: true },
  };

  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};

    if (url === '/api/deduction-reasons' && method === 'GET') {
      return jsonResponse({ reasons: Object.values(store) });
    }
    const incMatch = url.match(/^\/api\/deduction-reasons\/([^/]+)\/increment-usage$/);
    if (incMatch && method === 'POST') {
      const r = store[incMatch[1]];
      if (!r) return jsonResponse({ ok: true });
      r.uses += 1;
      r.total += body.amount || 0;
      return jsonResponse({ reason: r });
    }
    const decMatch = url.match(/^\/api\/deduction-reasons\/([^/]+)\/decrement-usage$/);
    if (decMatch && method === 'POST') {
      const r = store[decMatch[1]];
      if (!r) return jsonResponse({ ok: true });
      r.uses = Math.max(r.uses - 1, 0);
      r.total = Math.max(r.total - (body.amount || 0), 0);
      return jsonResponse({ reason: r });
    }
    return jsonResponse({ error: `unhandled ${method} ${url}` }, 500);
  });
}

// This pairing (incrementUsage/decrementUsage) is exactly the shape of bug this app kept
// producing: an action with a side effect elsewhere that had no inverse, so voiding a
// receipt left "ใช้แล้ว N ครั้ง" permanently inflated. These tests guard the round trip.
describe('DeductionsContext usage tracking', () => {
  beforeEach(() => {
    installFakeReasonsApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('incrementUsage raises uses/total, decrementUsage brings them back to the original values', async () => {
    const { result } = renderHook(() => useDeductions(), { wrapper: DeductionsProvider });
    await act(async () => {});

    expect(result.current.reasons.wet.uses).toBe(0);
    expect(result.current.reasons.wet.total).toBe(0);

    await act(async () => result.current.incrementUsage('wet', 50));
    expect(result.current.reasons.wet.uses).toBe(1);
    expect(result.current.reasons.wet.total).toBe(50);

    await act(async () => result.current.decrementUsage('wet', 50));
    expect(result.current.reasons.wet.uses).toBe(0);
    expect(result.current.reasons.wet.total).toBe(0);
  });

  it('decrementUsage never drives uses/total negative if called without a matching increment', async () => {
    const { result } = renderHook(() => useDeductions(), { wrapper: DeductionsProvider });
    await act(async () => {});

    await act(async () => result.current.decrementUsage('wet', 50));
    expect(result.current.reasons.wet.uses).toBe(0);
    expect(result.current.reasons.wet.total).toBe(0);
  });

  it('incrementUsage/decrementUsage on an unknown reason id is a no-op, not a crash', async () => {
    const { result } = renderHook(() => useDeductions(), { wrapper: DeductionsProvider });
    await act(async () => {});

    await expect(act(async () => result.current.incrementUsage('does-not-exist', 50))).resolves.not.toThrow();
    await expect(act(async () => result.current.decrementUsage('does-not-exist', 50))).resolves.not.toThrow();
  });
});
