import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

describe('CustomersContext purchase/reversal round trip', () => {
  it('reversePurchase undoes exactly what recordPurchase applied', () => {
    const { result } = renderHook(() => useCustomers(), { wrapper: CustomersProvider });
    let id;
    act(() => {
      id = result.current.addCustomer({ name: 'คุณทดสอบ', phone: '000-000-0000' }).id;
    });
    const before = result.current.customers[id];
    const beforeWeight = parseWeightKg(before.weight);
    const beforeTotal = parseMoney(before.total);
    const beforeVisits = parseVisits(before.visits);

    act(() =>
      result.current.recordPurchase(id, { weightKg: 12.5, amount: 890, receiptNo: 'RC-TEST-001', timeStr: '10:00 น.' })
    );
    const afterPurchase = result.current.customers[id];
    expect(parseWeightKg(afterPurchase.weight)).toBeCloseTo(beforeWeight + 12.5, 2);
    expect(parseMoney(afterPurchase.total)).toBeCloseTo(beforeTotal + 890, 2);
    expect(parseVisits(afterPurchase.visits)).toBe(beforeVisits + 1);
    expect(afterPurchase.hist.some((h) => h.no === 'RC-TEST-001')).toBe(true);

    act(() => result.current.reversePurchase(id, { weightKg: 12.5, amount: 890, receiptNo: 'RC-TEST-001' }));
    const afterReversal = result.current.customers[id];
    expect(parseWeightKg(afterReversal.weight)).toBeCloseTo(beforeWeight, 2);
    expect(parseMoney(afterReversal.total)).toBeCloseTo(beforeTotal, 2);
    expect(parseVisits(afterReversal.visits)).toBe(beforeVisits);
    // The voided receipt's history entry must be gone too, not just the totals reset —
    // otherwise the customer's recent-purchase list would still show a cancelled sale.
    expect(afterReversal.hist.some((h) => h.no === 'RC-TEST-001')).toBe(false);
  });

  it('reversePurchase never drives weight/total/visits negative', () => {
    const { result } = renderHook(() => useCustomers(), { wrapper: CustomersProvider });
    let id;
    act(() => {
      id = result.current.addCustomer({ name: 'คุณทดสอบ', phone: '000-000-0000' }).id;
    });

    act(() => result.current.reversePurchase(id, { weightKg: 999999, amount: 999999, receiptNo: 'RC-NONE' }));
    const c = result.current.customers[id];
    expect(parseWeightKg(c.weight)).toBeGreaterThanOrEqual(0);
    expect(parseMoney(c.total)).toBeGreaterThanOrEqual(0);
    expect(parseVisits(c.visits)).toBeGreaterThanOrEqual(0);
  });

  it('recordPurchase/reversePurchase on an unknown customer id is a no-op, not a crash', () => {
    const { result } = renderHook(() => useCustomers(), { wrapper: CustomersProvider });

    expect(() =>
      act(() => result.current.recordPurchase('does-not-exist', { weightKg: 1, amount: 1, receiptNo: 'x', timeStr: 'x' }))
    ).not.toThrow();
    expect(() =>
      act(() => result.current.reversePurchase('does-not-exist', { weightKg: 1, amount: 1, receiptNo: 'x' }))
    ).not.toThrow();
  });
});
