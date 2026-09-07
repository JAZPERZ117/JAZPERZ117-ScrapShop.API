import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeductionsProvider, useDeductions } from '../DeductionsContext.jsx';

// This pairing (incrementUsage/decrementUsage) is exactly the shape of bug this app kept
// producing: an action with a side effect elsewhere that had no inverse, so voiding a
// receipt left "ใช้แล้ว N ครั้ง" permanently inflated. These tests guard the round trip.
describe('DeductionsContext usage tracking', () => {
  it('incrementUsage raises uses/total, decrementUsage brings them back to the original values', () => {
    const { result } = renderHook(() => useDeductions(), { wrapper: DeductionsProvider });

    expect(result.current.reasons.wet.uses).toBe(0);
    expect(result.current.reasons.wet.total).toBe(0);

    act(() => result.current.incrementUsage('wet', 50));
    expect(result.current.reasons.wet.uses).toBe(1);
    expect(result.current.reasons.wet.total).toBe(50);

    act(() => result.current.decrementUsage('wet', 50));
    expect(result.current.reasons.wet.uses).toBe(0);
    expect(result.current.reasons.wet.total).toBe(0);
  });

  it('decrementUsage never drives uses/total negative if called without a matching increment', () => {
    const { result } = renderHook(() => useDeductions(), { wrapper: DeductionsProvider });

    act(() => result.current.decrementUsage('wet', 50));
    expect(result.current.reasons.wet.uses).toBe(0);
    expect(result.current.reasons.wet.total).toBe(0);
  });

  it('incrementUsage/decrementUsage on an unknown reason id is a no-op, not a crash', () => {
    const { result } = renderHook(() => useDeductions(), { wrapper: DeductionsProvider });

    expect(() => act(() => result.current.incrementUsage('does-not-exist', 50))).not.toThrow();
    expect(() => act(() => result.current.decrementUsage('does-not-exist', 50))).not.toThrow();
  });
});
