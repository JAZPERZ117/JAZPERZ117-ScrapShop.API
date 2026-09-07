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

export const INITIAL_CUSTOMERS = {
  somchai: { name: 'คุณสมชาย ใจดี', init: 'สม', bg: 'var(--amber-bg)', fg: 'var(--amber)', phone: '089-421-7765', idNumber: '3-1099-xxxxx-45-1', idExpiry: '2028-03-01', addr: 'ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี', tag: 'regular', weight: '642.10 กก.', total: '฿18,240.00', visits: '14 ครั้ง', since: 'มี.ค. 2565', lastVisit: 'วันนี้ 10:45 น.',
    hist: [{ no: 'RC670515-012', dt: 'วันนี้ · 10:45 น.', amt: '฿890.00' }, { no: 'RC670502-004', dt: '2 พ.ค. 2567', amt: '฿1,240.00' }, { no: 'RC670418-019', dt: '18 เม.ย. 2567', amt: '฿670.00' }] },
  charoen: { name: 'ร้านเจริญทรัพย์', init: 'รเ', bg: 'var(--blue-bg)', fg: 'var(--blue)', phone: '081-993-2214', idNumber: '3-1099-xxxxx-12-7', idExpiry: '2027-11-01', addr: 'ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี', tag: 'regular', weight: '2,140.60 กก.', total: '฿64,120.00', visits: '31 ครั้ง', since: 'ม.ค. 2564', lastVisit: 'วันนี้ 10:20 น.',
    hist: [{ no: 'RC670515-011', dt: 'วันนี้ · 10:20 น.', amt: '฿2,450.00' }, { no: 'RC670428-007', dt: '28 เม.ย. 2567', amt: '฿3,120.00' }, { no: 'RC670402-015', dt: '2 เม.ย. 2567', amt: '฿1,980.00' }] },
  wilok: { name: 'คุณวิโลกษณ์ มากมี', init: 'วิ', bg: 'var(--plum-bg)', fg: 'var(--plum)', phone: '062-118-4470', idNumber: '3-1099-xxxxx-88-3', idExpiry: '2026-09-20', addr: 'ต.บ้านใต้ อ.เกาะพะงัน จ.สุราษฎร์ธานี', tag: 'general', weight: '96.40 กก.', total: '฿4,890.00', visits: '3 ครั้ง', since: 'ก.พ. 2567', lastVisit: 'วันนี้ 10:05 น.',
    hist: [{ no: 'RC670515-010', dt: 'วันนี้ · 10:05 น.', amt: '฿1,670.00' }, { no: 'RC670310-002', dt: '10 มี.ค. 2567', amt: '฿1,820.00' }, { no: 'RC670220-006', dt: '20 ก.พ. 2567', amt: '฿1,400.00' }] },
  prasert: { name: 'คุณประเสริฐ แสงทอง', init: 'ปร', bg: 'var(--rose-bg)', fg: 'var(--rose)', phone: '095-772-6631', idNumber: '3-1099-xxxxx-21-9', idExpiry: '2027-06-15', addr: 'ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี', tag: 'general', weight: '210.30 กก.', total: '฿5,640.00', visits: '6 ครั้ง', since: 'พ.ย. 2566', lastVisit: 'วันนี้ 09:30 น.',
    hist: [{ no: 'RC670515-009', dt: 'วันนี้ · 09:30 น.', amt: '฿750.00' }, { no: 'RC670419-003', dt: '19 เม.ย. 2567', amt: '฿980.00' }, { no: 'RC670305-011', dt: '5 มี.ค. 2567', amt: '฿1,150.00' }] },
  teera: { name: 'คุณธีระ บุญมา', init: 'ธี', bg: 'var(--amber-bg)', fg: 'var(--amber)', phone: '064-887-5512', idNumber: '3-1099-xxxxx-97-6', idExpiry: '2027-09-01', addr: 'ต.บ้านใต้ อ.เกาะพะงัน จ.สุราษฎร์ธานี', tag: 'general', weight: '312.70 กก.', total: '฿6,980.00', visits: '9 ครั้ง', since: 'ก.ย. 2566', lastVisit: 'เมื่อวาน 15:40 น.',
    hist: [{ no: 'RC670514-007', dt: 'เมื่อวาน · 15:40 น.', amt: '฿540.00' }, { no: 'RC670422-012', dt: '22 เม.ย. 2567', amt: '฿1,100.00' }, { no: 'RC670330-005', dt: '30 มี.ค. 2567', amt: '฿890.00' }] },
};

export const INITIAL_ORDER = ['somchai', 'charoen', 'wilok', 'prasert', 'teera'];

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
