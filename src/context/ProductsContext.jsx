import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';
import { IconMagnet, IconCircle, IconCardboard, IconBottle, IconDevice, IconBox } from '../icons.jsx';

// Icon components can't survive JSON persistence, so raw data stores an iconKey
// and the provider re-attaches the real component on every read (same pattern as DeductionsContext).
const ICON_MAP = {
  magnet: IconMagnet,
  circle: IconCircle,
  cardboard: IconCardboard,
  bottle: IconBottle,
  device: IconDevice,
  box: IconBox,
};

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [productsRaw, setProductsRaw] = useState({});
  const [order, setOrder] = useState([]);

  // Products — prices and, critically, on-hand stock — used to live only in this browser's own
  // localStorage: a delivery shipping stock out on one device and a purchase adding stock on
  // another would each keep their own private copy, immediately going stale relative to the
  // other. Now fetched from the real database behind requireAuth, same as customers/users.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/products', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const p of data.products) {
        map[p.id] = p;
        ord.push(p.id);
      }
      setProductsRaw(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePolling(refresh, 5000);

  const products = useMemo(() => {
    const out = {};
    for (const id in productsRaw) {
      const p = productsRaw[id];
      out[id] = { ...p, Icon: ICON_MAP[p.iconKey] || IconBox };
    }
    return out;
  }, [productsRaw]);

  async function createProduct({ name, cat, price }) {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, cat, price }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'เพิ่มรายการสินค้าไม่สำเร็จ');
    setProductsRaw((prev) => ({ ...prev, [data.product.id]: data.product }));
    setOrder((prev) => [data.product.id, ...prev]);
    return data.product;
  }

  // General patch — active toggle, category reassignment, or a direct stock edit. Price isn't
  // included here; it goes through updatePrice below so the history/sparkline stay consistent.
  async function updateProduct(id, patch) {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกข้อมูลสินค้าไม่สำเร็จ');
    setProductsRaw((prev) => ({ ...prev, [id]: data.product }));
    return data.product;
  }

  async function deleteProduct(id) {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบรายการสินค้าไม่สำเร็จ');
    }
    setProductsRaw((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  // Records a real price change as it happens — the server computes the updated 7-day
  // history/sparkline/% change so the trend reflects real edits from every device consistently.
  async function updatePrice(id, newPrice) {
    if (!(newPrice > 0)) return;
    const res = await fetch(`/api/products/${id}/price`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ price: newPrice }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setProductsRaw((prev) => ({ ...prev, [id]: data.product }));
  }

  // Buying scrap material adds to the shop's on-hand stock of it — called once per real
  // purchase row (see ScrapPurchase.jsx), matched by product name. A row typed into a blank
  // "รายการใหม่" slot with a name that doesn't match any cataloged product is still a real
  // purchase — the server creates it (priced at what was actually paid) rather than silently
  // dropping the stock update.
  async function addStock(productName, weightKg, unitPrice) {
    if (!weightKg || weightKg <= 0) return true;
    const name = (productName || '').trim();
    if (!name) return false;
    const res = await fetch('/api/products/add-stock', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, weightKg, unitPrice }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setProductsRaw((prev) => ({ ...prev, [data.product.id]: data.product }));
    setOrder((prev) => (prev.includes(data.product.id) ? prev : [data.product.id, ...prev]));
    return true;
  }

  // Shipping accumulated stock out to a buyer (see Deliveries.jsx) removes it from on-hand
  // stock, by id — the delivery form picks a real product directly, unlike ScrapPurchase's
  // free-text row names.
  async function removeStock(id, weightKg) {
    if (!weightKg || weightKg <= 0) return;
    const res = await fetch(`/api/products/${id}/remove-stock`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ weightKg }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setProductsRaw((prev) => ({ ...prev, [id]: data.product }));
  }

  // Restoring stock to a delivery's original product on delete/edit (see Deliveries.jsx), by
  // id — unlike addStock's name-based fallback, this never fabricates a placeholder product if
  // the id no longer exists. Returns whether the restore actually happened, so the caller can
  // warn the user instead of silently losing or misattributing the stock.
  async function addStockById(id, weightKg) {
    if (!weightKg || weightKg <= 0) return true;
    if (!id) return false;
    const res = await fetch(`/api/products/${id}/add-stock`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ weightKg }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setProductsRaw((prev) => ({ ...prev, [id]: data.product }));
    return true;
  }

  // Voiding or editing a receipt (see Receipts.jsx) needs to give back the stock its purchase
  // added, but receipts only ever recorded item names — not ids — matching how addStock above
  // looks products up, so this mirrors that name-based lookup instead of removeStock's id-based one.
  async function removeStockByName(productName, weightKg) {
    if (!weightKg || weightKg <= 0) return true;
    const name = (productName || '').trim();
    if (!name) return false;
    const res = await fetch('/api/products/remove-stock-by-name', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, weightKg }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.product) setProductsRaw((prev) => ({ ...prev, [data.product.id]: data.product }));
    return true;
  }

  // Renaming/deleting a category (see Categories.jsx) cascades onto every product referencing
  // it by name — done atomically server-side, then this just re-syncs the local copy rather
  // than trying to guess which individual rows changed.
  async function reassignCategory(fromCat, toCat) {
    const res = await fetch('/api/products/reassign-category', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ fromCat, toCat }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.movedCount) await refresh();
    return data.movedCount || 0;
  }

  return (
    <ProductsContext.Provider
      value={{
        products,
        order,
        createProduct,
        updateProduct,
        deleteProduct,
        updatePrice,
        addStock,
        addStockById,
        removeStock,
        removeStockByName,
        reassignCategory,
        refresh,
      }}
    >
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within a ProductsProvider');
  return ctx;
}
