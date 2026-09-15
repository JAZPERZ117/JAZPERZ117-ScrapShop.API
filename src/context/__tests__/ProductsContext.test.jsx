import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsProvider, useProducts } from '../ProductsContext.jsx';

function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}
function formatStock(n) {
  return `${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
}

function jsonResponse(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

// Products (and their stock) now live server-side (server/src/index.js's /api/products
// routes), not in this context's own state — this is a small in-memory stand-in for that
// server, close enough to its real add-stock/remove-stock-by-name math to still exercise the
// invariants below through the context's real fetch calls, without needing the actual backend.
function installFakeProductsApi() {
  const store = {
    iron: {
      id: 'iron',
      name: 'เหล็ก',
      cat: 'โลหะ',
      iconKey: 'magnet',
      bg: '',
      fg: '',
      price: 17,
      change: '0.0%',
      dir: 'flat',
      stock: '0.00 กก.',
      stockPct: 0,
      active: true,
      spark: [17, 17, 17, 17, 17, 17, 17],
      hist: [],
    },
  };
  let nextId = 1;

  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};

    if (url === '/api/products' && method === 'GET') {
      return jsonResponse({ products: Object.values(store) });
    }
    if (url === '/api/products/add-stock' && method === 'POST') {
      const existing = Object.values(store).find((p) => p.name === body.name);
      if (existing) {
        existing.stock = formatStock(parseStockKg(existing.stock) + body.weightKg);
        return jsonResponse({ product: existing });
      }
      const id = `auto_test_${nextId++}`;
      const price = body.unitPrice || 0;
      const created = {
        id,
        name: body.name,
        cat: 'อื่นๆ',
        iconKey: 'box',
        bg: '',
        fg: '',
        price,
        change: '0.0%',
        dir: 'flat',
        stock: formatStock(body.weightKg),
        stockPct: 0,
        active: true,
        spark: [price, price, price, price, price, price, price],
        hist: [],
      };
      store[id] = created;
      return jsonResponse({ product: created }, 201);
    }
    if (url === '/api/products/remove-stock-by-name' && method === 'POST') {
      const existing = Object.values(store).find((p) => p.name === body.name);
      if (!existing) return jsonResponse({ ok: true });
      existing.stock = formatStock(Math.max(parseStockKg(existing.stock) - body.weightKg, 0));
      return jsonResponse({ product: existing });
    }
    return jsonResponse({ error: `unhandled ${method} ${url}` }, 500);
  });
}

describe('ProductsContext stock tracking', () => {
  beforeEach(() => {
    installFakeProductsApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('addStock followed by removeStockByName for the same weight returns stock to its original value', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper: ProductsProvider });
    await act(async () => {});
    const before = parseStockKg(result.current.products.iron.stock);

    await act(async () => result.current.addStock('เหล็ก', 10, 17));
    expect(parseStockKg(result.current.products.iron.stock)).toBeCloseTo(before + 10, 2);

    await act(async () => result.current.removeStockByName('เหล็ก', 10));
    expect(parseStockKg(result.current.products.iron.stock)).toBeCloseTo(before, 2);
  });

  it('removeStockByName never drives stock below zero', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper: ProductsProvider });
    await act(async () => {});
    const before = parseStockKg(result.current.products.iron.stock);

    await act(async () => result.current.removeStockByName('เหล็ก', before + 1000));
    expect(parseStockKg(result.current.products.iron.stock)).toBe(0);
  });

  // The id for a brand-new product is now assigned by the server's response, not generated
  // client-side, so `products` and `order` are set together from that single response — there's
  // no longer a way for the two to go out of sync the way a client-generated id once could
  // under React 18 StrictMode's double-invoked updaters.
  it('creating a brand-new product keeps the same id in both products and order', async () => {
    const { result } = renderHook(() => useProducts(), { wrapper: ProductsProvider });
    await act(async () => {});

    await act(async () => result.current.addStock('สินค้าทดสอบใหม่', 5, 20));

    const newId = result.current.order.find((id) => result.current.products[id]?.name === 'สินค้าทดสอบใหม่');
    expect(newId).toBeTruthy();
    expect(result.current.products[newId]).toBeTruthy();
    expect(result.current.order.filter((id) => id === newId)).toHaveLength(1);
  });
});
