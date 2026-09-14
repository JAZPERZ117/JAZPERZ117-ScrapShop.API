import { createContext, useContext, useMemo } from 'react';
import { usePersistentState } from '../lib/persist.js';

// ID cards are flagged as "near expiry" inside this many days of idExpiry (including
// already-past dates) — renewing a customer's idExpiry date is what clears the warning.
const ID_WARN_WINDOW_DAYS = 30;

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Real deployment: no customers exist yet until the shop actually adds one.
export const INITIAL_CUSTOMERS = {};

export const INITIAL_ORDER = [];

export const BLANK_CUSTOMER = {
  name: '', init: '', bg: 'var(--green-100)', fg: 'var(--green-700)', phone: '', idNumber: '', idExpiry: '', idPhoto: '', addr: 'ยังไม่ได้บันทึกที่อยู่', tag: 'general', weight: '0.00 กก.', total: '฿0.00', visits: '0 ครั้ง', since: 'พ.ค. 2567', lastVisit: 'ยังไม่เคยซื้อขาย', hist: [],
};

const CustomersContext = createContext(null);

export function CustomersProvider({ children }) {
  const [customersRaw, setCustomersRaw] = usePersistentState('scrapshop_customers', INITIAL_CUSTOMERS);
  const [order, setOrder] = usePersistentState('scrapshop_customers_order', INITIAL_ORDER);

  // idWarn/idDaysLeft are derived live from idExpiry vs today, not stored — so renewing
  // a customer's ID (editing idExpiry to a future date) immediately clears the warning
  // instead of leaving a stale flag that nothing can ever turn off.
  const customers = useMemo(() => {
    const out = {};
    for (const id in customersRaw) {
      const c = customersRaw[id];
      const idDaysLeft = daysUntil(c.idExpiry);
      out[id] = { ...c, idDaysLeft, idWarn: idDaysLeft <= ID_WARN_WINDOW_DAYS };
    }
    return out;
  }, [customersRaw]);

  function addCustomer({ name, phone }) {
    const id = `new_${Date.now()}`;
    // Real creation timestamp — lets pages like DailySummary genuinely tell "added today"
    // apart from "added at any point since the shop started using the app".
    const created = { ...BLANK_CUSTOMER, name, phone, init: name.replace('คุณ', '').trim().slice(0, 2) || '?', createdAt: new Date().toISOString() };
    setCustomersRaw((prev) => ({ ...prev, [id]: created }));
    setOrder((prev) => [id, ...prev]);
    return { id, ...created };
  }

  // Called once per completed purchase (see ScrapPurchase.jsx) so a customer's cumulative
  // weight/spend/visit count and recent history reflect real transactions instead of
  // staying frozen at whatever the seed data happened to say.
  function recordPurchase(id, { weightKg, amount, receiptNo, timeStr }) {
    if (!id || !customersRaw[id]) return;
    setCustomersRaw((prev) => {
      const c = prev[id];
      const prevWeight = parseFloat(String(c.weight).replace(/[^\d.]/g, '')) || 0;
      const prevTotal = parseFloat(String(c.total).replace(/[^\d.]/g, '')) || 0;
      const prevVisits = parseInt(String(c.visits).replace(/[^\d]/g, ''), 10) || 0;
      const hist = [{ no: receiptNo, dt: `วันนี้ · ${timeStr}`, amt: money(amount) }, ...(c.hist || [])].slice(0, 5);
      return {
        ...prev,
        [id]: {
          ...c,
          weight: `${(prevWeight + weightKg).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`,
          total: money(prevTotal + amount),
          visits: `${prevVisits + 1} ครั้ง`,
          lastVisit: `วันนี้ ${timeStr}`,
          hist,
        },
      };
    });
  }

  // Inverse of recordPurchase — called when a receipt is voided (see Receipts.jsx) so a
  // cancelled purchase doesn't permanently overstate the customer's lifetime weight/spend/
  // visit count. `lastVisit` can't be reconstructed exactly (the prior value was never kept),
  // so it falls back to whatever history entry is now the most recent, or the "never
  // purchased" default if none remain.
  function reversePurchase(id, { weightKg, amount, receiptNo }) {
    if (!id || !customersRaw[id]) return;
    setCustomersRaw((prev) => {
      const c = prev[id];
      if (!c) return prev;
      const prevWeight = parseFloat(String(c.weight).replace(/[^\d.]/g, '')) || 0;
      const prevTotal = parseFloat(String(c.total).replace(/[^\d.]/g, '')) || 0;
      const prevVisits = parseInt(String(c.visits).replace(/[^\d]/g, ''), 10) || 0;
      const hist = (c.hist || []).filter((h) => h.no !== receiptNo);
      return {
        ...prev,
        [id]: {
          ...c,
          weight: `${Math.max(prevWeight - weightKg, 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`,
          total: money(Math.max(prevTotal - amount, 0)),
          visits: `${Math.max(prevVisits - 1, 0)} ครั้ง`,
          lastVisit: hist[0] ? hist[0].dt : 'ยังไม่เคยซื้อขาย',
          hist,
        },
      };
    });
  }

  return (
    <CustomersContext.Provider value={{ customers, setCustomers: setCustomersRaw, order, setOrder, addCustomer, recordPurchase, reversePurchase }}>
      {children}
    </CustomersContext.Provider>
  );
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error('useCustomers must be used within a CustomersProvider');
  return ctx;
}
