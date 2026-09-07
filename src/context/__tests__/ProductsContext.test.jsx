import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductsProvider, useProducts } from '../ProductsContext.jsx';

function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}

describe('ProductsContext stock tracking', () => {
  it('addStock followed by removeStockByName for the same weight returns stock to its original value', () => {
    const { result } = renderHook(() => useProducts(), { wrapper: ProductsProvider });
    const before = parseStockKg(result.current.products.iron.stock);

    act(() => result.current.addStock('เหล็ก', 10, 17));
    expect(parseStockKg(result.current.products.iron.stock)).toBeCloseTo(before + 10, 2);

    act(() => result.current.removeStockByName('เหล็ก', 10));
    expect(parseStockKg(result.current.products.iron.stock)).toBeCloseTo(before, 2);
  });

  it('removeStockByName never drives stock below zero', () => {
    const { result } = renderHook(() => useProducts(), { wrapper: ProductsProvider });
    const before = parseStockKg(result.current.products.iron.stock);

    act(() => result.current.removeStockByName('เหล็ก', before + 1000));
    expect(parseStockKg(result.current.products.iron.stock)).toBe(0);
  });

  // Regression test for the exact bug this codebase hit: addStock used to compute a
  // Date.now()/Math.random() id INSIDE the setState updater. React 18 StrictMode
  // double-invokes updaters in dev, so the two invocations produced different ids —
  // the id saved into `products` and the id pushed into `order` went out of sync, and
  // the new product became permanently invisible (in state, but never in `order`).
  it('creating a brand-new product under StrictMode keeps the same id in both products and order', () => {
    const { result } = renderHook(() => useProducts(), {
      wrapper: ({ children }) => (
        <React.StrictMode>
          <ProductsProvider>{children}</ProductsProvider>
        </React.StrictMode>
      ),
    });

    act(() => result.current.addStock('สินค้าทดสอบใหม่', 5, 20));

    const newId = result.current.order.find((id) => result.current.products[id]?.name === 'สินค้าทดสอบใหม่');
    expect(newId).toBeTruthy();
    expect(result.current.products[newId]).toBeTruthy();
    expect(result.current.order.filter((id) => id === newId)).toHaveLength(1);
  });
});
