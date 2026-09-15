import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomersProvider, useCustomers } from '../CustomersContext.jsx';

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}
function parseMoney(m) {
  return parseFloat(String(m).replace(/[^\d.]/g, '')) || 0;
}
function parseVisits(v) {
  return parseInt(String(v).replace(/[^\d]/g, ''), 10) || 0;
}
function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function jsonResponse(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

// Customer records now live server-side (server/src/index.js's /api/customers routes), not in
// this context's own state — this is a small in-memory stand-in for that server, close enough
// to its real record-purchase/reverse-purchase math to still exercise the round-trip invariants
// below through the context's real fetch calls, without needing the actual backend running.
function installFakeCustomersApi() {
  const store = {};
  let nextId = 1;

  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};

    if (url === '/api/customers' && method === 'GET') {
      return jsonResponse({ customers: Object.values(store) });
    }
    if (url === '/api/customers' && method === 'POST') {
      const id = `cust_test_${nextId++}`;
      const customer = {
        id,
        name: body.name,
        phone: body.phone || '',
        init: '',
        bg: '',
        fg: '',
        idNumber: body.idNumber || '',
        idExpiry: body.idExpiry || '',
        idPhoto: body.idPhoto || '',
        addr: '',
        tag: 'general',
        weight: '0.00 กก.',
        total: '฿0.00',
        visits: '0 ครั้ง',
        since: '',
        lastVisit: 'ยังไม่เคยซื้อขาย',
        hist: [],
        createdAt: new Date().toISOString(),
      };
      store[id] = customer;
      return jsonResponse({ customer }, 201);
    }
    const recordMatch = url.match(/^\/api\/customers\/([^/]+)\/record-purchase$/);
    if (recordMatch && method === 'POST') {
      const c = store[recordMatch[1]];
      if (!c) return jsonResponse({ error: 'not found' }, 404);
      const hist = [{ no: body.receiptNo, dt: `วันนี้ · ${body.timeStr}`, amt: money(body.amount) }, ...c.hist].slice(0, 5);
      c.weight = `${(parseWeightKg(c.weight) + body.weightKg).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
      c.total = money(parseMoney(c.total) + body.amount);
      c.visits = `${parseVisits(c.visits) + 1} ครั้ง`;
      c.lastVisit = `วันนี้ ${body.timeStr}`;
      c.hist = hist;
      return jsonResponse({ customer: c });
    }
    const reverseMatch = url.match(/^\/api\/customers\/([^/]+)\/reverse-purchase$/);
    if (reverseMatch && method === 'POST') {
      const c = store[reverseMatch[1]];
      if (!c) return jsonResponse({ error: 'not found' }, 404);
      const hist = c.hist.filter((h) => h.no !== body.receiptNo);
      c.weight = `${Math.max(parseWeightKg(c.weight) - body.weightKg, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
      c.total = money(Math.max(parseMoney(c.total) - body.amount, 0));
      c.visits = `${Math.max(parseVisits(c.visits) - 1, 0)} ครั้ง`;
      c.lastVisit = hist[0] ? hist[0].dt : 'ยังไม่เคยซื้อขาย';
      c.hist = hist;
      return jsonResponse({ customer: c });
    }
    return jsonResponse({ error: `unhandled ${method} ${url}` }, 500);
  });
}

describe('CustomersContext purchase/reversal round trip', () => {
  beforeEach(() => {
    installFakeCustomersApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reversePurchase undoes exactly what recordPurchase applied', async () => {
    const { result } = renderHook(() => useCustomers(), { wrapper: CustomersProvider });
    await act(async () => {});

    let id;
    await act(async () => {
      id = (await result.current.addCustomer({ name: 'คุณทดสอบ', phone: '000-000-0000' })).id;
    });
    const before = result.current.customers[id];
    const beforeWeight = parseWeightKg(before.weight);
    const beforeTotal = parseMoney(before.total);
    const beforeVisits = parseVisits(before.visits);

    await act(async () =>
      result.current.recordPurchase(id, { weightKg: 12.5, amount: 890, receiptNo: 'RC-TEST-001', timeStr: '10:00 น.' })
    );
    const afterPurchase = result.current.customers[id];
    expect(parseWeightKg(afterPurchase.weight)).toBeCloseTo(beforeWeight + 12.5, 2);
    expect(parseMoney(afterPurchase.total)).toBeCloseTo(beforeTotal + 890, 2);
    expect(parseVisits(afterPurchase.visits)).toBe(beforeVisits + 1);
    expect(afterPurchase.hist.some((h) => h.no === 'RC-TEST-001')).toBe(true);

    await act(async () => result.current.reversePurchase(id, { weightKg: 12.5, amount: 890, receiptNo: 'RC-TEST-001' }));
    const afterReversal = result.current.customers[id];
    expect(parseWeightKg(afterReversal.weight)).toBeCloseTo(beforeWeight, 2);
    expect(parseMoney(afterReversal.total)).toBeCloseTo(beforeTotal, 2);
    expect(parseVisits(afterReversal.visits)).toBe(beforeVisits);
    // The voided receipt's history entry must be gone too, not just the totals reset —
    // otherwise the customer's recent-purchase list would still show a cancelled sale.
    expect(afterReversal.hist.some((h) => h.no === 'RC-TEST-001')).toBe(false);
  });

  it('reversePurchase never drives weight/total/visits negative', async () => {
    const { result } = renderHook(() => useCustomers(), { wrapper: CustomersProvider });
    await act(async () => {});

    let id;
    await act(async () => {
      id = (await result.current.addCustomer({ name: 'คุณทดสอบ', phone: '000-000-0000' })).id;
    });

    await act(async () => result.current.reversePurchase(id, { weightKg: 999999, amount: 999999, receiptNo: 'RC-NONE' }));
    const c = result.current.customers[id];
    expect(parseWeightKg(c.weight)).toBeGreaterThanOrEqual(0);
    expect(parseMoney(c.total)).toBeGreaterThanOrEqual(0);
    expect(parseVisits(c.visits)).toBeGreaterThanOrEqual(0);
  });

  it('recordPurchase/reversePurchase on an unknown customer id is a no-op, not a crash', async () => {
    const { result } = renderHook(() => useCustomers(), { wrapper: CustomersProvider });
    await act(async () => {});

    await expect(
      act(async () => result.current.recordPurchase('does-not-exist', { weightKg: 1, amount: 1, receiptNo: 'x', timeStr: 'x' }))
    ).resolves.not.toThrow();
    await expect(
      act(async () => result.current.reversePurchase('does-not-exist', { weightKg: 1, amount: 1, receiptNo: 'x' }))
    ).resolves.not.toThrow();
  });
});
