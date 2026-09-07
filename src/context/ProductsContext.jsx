import { createContext, useContext, useMemo } from 'react';
import { usePersistentState } from '../lib/persist.js';
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

export const INITIAL_PRODUCTS_RAW = {
  iron: { name: 'เหล็ก', cat: 'โลหะ', iconKey: 'magnet', bg: 'var(--amber-bg)', fg: 'var(--amber)', price: 17.0, change: '+2.4%', dir: 'up', stock: '3,210 กก.', stockPct: 78, active: true, spark: [16.2, 16.5, 16.4, 16.8, 16.5, 16.6, 17.0], hist: [{ d: '15 พ.ค. 2567', v: '฿17.00' }, { d: '14 พ.ค. 2567', v: '฿16.60' }, { d: '13 พ.ค. 2567', v: '฿16.50' }, { d: '12 พ.ค. 2567', v: '฿16.80' }] },
  copper: { name: 'ทองแดง', cat: 'โลหะ', iconKey: 'circle', bg: 'var(--rose-bg)', fg: 'var(--rose)', price: 218.0, change: '+4.1%', dir: 'up', stock: '86 กก.', stockPct: 32, active: true, spark: [198, 202, 205, 209, 212, 209, 218], hist: [{ d: '15 พ.ค. 2567', v: '฿218.00' }, { d: '14 พ.ค. 2567', v: '฿209.40' }, { d: '13 พ.ค. 2567', v: '฿212.00' }, { d: '12 พ.ค. 2567', v: '฿205.00' }] },
  cardboard: { name: 'กระดาษลัง', cat: 'กระดาษ', iconKey: 'cardboard', bg: 'var(--blue-bg)', fg: 'var(--blue)', price: 10.0, change: '0.0%', dir: 'flat', stock: '1,840 กก.', stockPct: 64, active: true, spark: [10, 10, 10, 9.8, 10, 10, 10], hist: [{ d: '15 พ.ค. 2567', v: '฿10.00' }, { d: '14 พ.ค. 2567', v: '฿10.00' }, { d: '13 พ.ค. 2567', v: '฿10.00' }, { d: '12 พ.ค. 2567', v: '฿9.80' }] },
  plastic: { name: 'ขวดพลาสติก', cat: 'พลาสติก', iconKey: 'bottle', bg: 'var(--plum-bg)', fg: 'var(--plum)', price: 12.4, change: '−1.6%', dir: 'down', stock: '920 กก.', stockPct: 45, active: true, spark: [13.1, 13.0, 12.8, 12.9, 12.6, 12.6, 12.4], hist: [{ d: '15 พ.ค. 2567', v: '฿12.40' }, { d: '14 พ.ค. 2567', v: '฿12.60' }, { d: '13 พ.ค. 2567', v: '฿12.60' }, { d: '12 พ.ค. 2567', v: '฿12.90' }] },
  aluminum: { name: 'อลูมิเนียม', cat: 'โลหะ', iconKey: 'circle', bg: 'var(--green-100)', fg: 'var(--green-700)', price: 48.0, change: '+1.1%', dir: 'up', stock: '412 กก.', stockPct: 55, active: true, spark: [45, 46, 46.5, 47, 46.8, 47.5, 48], hist: [{ d: '15 พ.ค. 2567', v: '฿48.00' }, { d: '14 พ.ค. 2567', v: '฿47.50' }, { d: '13 พ.ค. 2567', v: '฿46.80' }, { d: '12 พ.ค. 2567', v: '฿47.00' }] },
  stainless: { name: 'สแตนเลส', cat: 'โลหะ', iconKey: 'device', bg: 'var(--teal-bg, #E4F6F4)', fg: 'var(--teal, #0E8E82)', price: 22.5, change: '0.0%', dir: 'flat', stock: '140 กก.', stockPct: 18, active: false, spark: [22.5, 22.5, 22.5, 22.5, 22.5, 22.5, 22.5], hist: [{ d: '15 พ.ค. 2567', v: '฿22.50' }, { d: '14 พ.ค. 2567', v: '฿22.50' }, { d: '13 พ.ค. 2567', v: '฿22.50' }, { d: '12 พ.ค. 2567', v: '฿22.50' }] },
};

export const INITIAL_ORDER = ['iron', 'copper', 'cardboard', 'plastic', 'aluminum', 'stainless'];

export const BLANK_PRODUCT_RAW = { name: '', cat: 'อื่นๆ', iconKey: 'box', bg: 'var(--bg)', fg: 'var(--ink-500)', price: 0, change: '0.0%', dir: 'flat', stock: '0 กก.', stockPct: 0, active: true, spark: [0, 0, 0, 0, 0, 0, 0], hist: [] };

const ProductsContext = createContext(null);

function todayThaiShort() {
  return new Date().toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}
function money(n) {
  return '฿' + (n || 0).toFixed(2);
}
function formatChangePct(pct) {
  if (pct > 0) return `+${pct.toFixed(1)}%`;
  if (pct < 0) return `−${Math.abs(pct).toFixed(1)}%`;
  return '0.0%';
}

export function ProductsProvider({ children }) {
  const [productsRaw, setProductsRaw] = usePersistentState('scrapshop_products', INITIAL_PRODUCTS_RAW);
  const [order, setOrder] = usePersistentState('scrapshop_products_order', INITIAL_ORDER);

  const products = useMemo(() => {
    const out = {};
    for (const id in productsRaw) {
      const p = productsRaw[id];
      out[id] = { ...p, Icon: ICON_MAP[p.iconKey] || IconBox };
    }
    return out;
  }, [productsRaw]);

  // Records a real price change as it happens — rather than leaving the seeded 7-day
  // history/sparkline/% change frozen forever, this pushes a genuine dated entry (or
  // updates today's if already edited once today) so the trend reflects real edits.
  function updatePrice(id, newPrice) {
    setProductsRaw((prev) => {
      const p = prev[id];
      if (!p || !(newPrice > 0) || newPrice === p.price) return prev;
      const pct = p.price > 0 ? ((newPrice - p.price) / p.price) * 100 : 0;
      const dir = newPrice > p.price ? 'up' : newPrice < p.price ? 'down' : 'flat';
      const today = todayThaiShort();
      const prevHist = p.hist || [];
      const hist = prevHist[0]?.d === today ? [{ d: today, v: money(newPrice) }, ...prevHist.slice(1)] : [{ d: today, v: money(newPrice) }, ...prevHist].slice(0, 7);
      const prevSpark = p.spark && p.spark.length ? p.spark : [newPrice, newPrice, newPrice, newPrice, newPrice, newPrice, newPrice];
      const spark = [...prevSpark.slice(1), newPrice];
      return { ...prev, [id]: { ...p, price: newPrice, change: formatChangePct(pct), dir, hist, spark } };
    });
  }

  // Buying scrap material adds to the shop's on-hand stock of it — called once per real
  // purchase row (see ScrapPurchase.jsx) matched by product name, so "สต็อกคงเหลือ" tracks
  // actual purchases instead of staying frozen at whatever the seed data said. A row typed
  // into a blank "รายการใหม่" slot with a name that doesn't match any cataloged product is
  // still a real purchase, so instead of silently dropping the stock update it genuinely
  // creates the product (priced at what was actually paid on this row) the same way adding
  // a product from the Products page would.
  function addStock(productName, weightKg, unitPrice) {
    if (!weightKg || weightKg <= 0) return;
    const name = (productName || '').trim();
    if (!name) return;
    // The new id/price must be computed OUTSIDE the updater, not inside it — React 18
    // StrictMode deliberately invokes state updaters twice in development to catch exactly
    // this kind of impurity. Date.now()/Math.random() called inside the updater produced a
    // different id on each of the two invocations, so the id actually saved into `products`
    // and the id pushed to `order` ended up mismatched, leaving the new product permanently
    // invisible (present in state, but never in the `order` list every UI iterates over).
    const newId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const price = unitPrice || 0;
    let created = false;
    setProductsRaw((prev) => {
      const id = Object.keys(prev).find((pid) => prev[pid].name === name);
      if (id) {
        const p = prev[id];
        const currentStock = parseFloat(String(p.stock).replace(/[^\d.]/g, '')) || 0;
        const newStock = currentStock + weightKg;
        return { ...prev, [id]: { ...p, stock: `${newStock.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.` } };
      }
      created = true;
      return {
        ...prev,
        [newId]: {
          name,
          cat: 'อื่นๆ',
          iconKey: 'box',
          bg: 'var(--bg)',
          fg: 'var(--ink-500)',
          price,
          change: '0.0%',
          dir: 'flat',
          stock: `${weightKg.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`,
          stockPct: 0,
          active: true,
          spark: [price, price, price, price, price, price, price],
          hist: [],
        },
      };
    });
    if (created) setOrder((prevOrder) => [newId, ...prevOrder]);
  }

  // Shipping accumulated stock out to a buyer (see DeliveriesContext.jsx) removes it from
  // on-hand stock, mirroring addStock on the way in — operates by id since the delivery
  // form picks a real product directly, unlike ScrapPurchase's free-text row names.
  function removeStock(id, weightKg) {
    if (!weightKg || weightKg <= 0) return;
    setProductsRaw((prev) => {
      const p = prev[id];
      if (!p) return prev;
      const currentStock = parseFloat(String(p.stock).replace(/[^\d.]/g, '')) || 0;
      const newStock = Math.max(currentStock - weightKg, 0);
      return { ...prev, [id]: { ...p, stock: `${newStock.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.` } };
    });
  }

  // Voiding a receipt (see Receipts.jsx) needs to give back the stock its purchase added,
  // but receipts only ever recorded item names — not ids — matching how addStock above looks
  // products up, so this mirrors that name-based lookup instead of removeStock's id-based one.
  function removeStockByName(productName, weightKg) {
    if (!weightKg || weightKg <= 0) return;
    const name = (productName || '').trim();
    if (!name) return;
    setProductsRaw((prev) => {
      const id = Object.keys(prev).find((pid) => prev[pid].name === name);
      if (!id) return prev;
      const p = prev[id];
      const currentStock = parseFloat(String(p.stock).replace(/[^\d.]/g, '')) || 0;
      const newStock = Math.max(currentStock - weightKg, 0);
      return { ...prev, [id]: { ...p, stock: `${newStock.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.` } };
    });
  }

  return (
    <ProductsContext.Provider value={{ products, setProducts: setProductsRaw, order, setOrder, updatePrice, addStock, removeStock, removeStockByName }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within a ProductsProvider');
  return ctx;
}
