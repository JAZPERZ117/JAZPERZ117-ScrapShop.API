import { createContext, useContext, useEffect } from 'react';
import { usePersistentState } from '../lib/persist.js';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const INITIAL_RECEIPTS = {
  '012': {
    no: 'RC670515-012',
    time: '10:45 น.',
    cust: 'คุณสมชาย ใจดี',
    init: 'สม',
    bg: 'var(--amber-bg)',
    fg: 'var(--amber)',
    status: 'ok',
    weight: '87.80 กก.',
    method: 'เงินสด',
    items: [
      { n: 'เหล็ก', w: '65.20 กก. × ฿17.00', t: '฿1,108.40' },
      { n: 'ทองแดง', w: '4.60 กก. × ฿218.00', t: '฿1,002.80' },
      { n: 'ขวดพลาสติก', w: '18.00 กก. × ฿12.40', t: '฿223.20' },
    ],
    total: '฿890.00',
  },
  '011': {
    no: 'RC670515-011',
    time: '10:20 น.',
    cust: 'ร้านเจริญทรัพย์',
    init: 'รเ',
    bg: 'var(--blue-bg)',
    fg: 'var(--blue)',
    status: 'ok',
    weight: '210.00 กก.',
    method: 'โอนเงิน',
    items: [
      { n: 'เหล็ก', w: '150.00 กก. × ฿17.00', t: '฿2,550.00' },
      { n: 'อลูมิเนียม', w: '60.00 กก. × ฿48.00', t: '฿2,880.00' },
    ],
    total: '฿2,450.00',
  },
  '010': {
    no: 'RC670515-010',
    time: '10:05 น.',
    cust: 'คุณวิโลกษณ์ มากมี',
    init: 'วิ',
    bg: 'var(--plum-bg)',
    fg: 'var(--plum)',
    status: 'void',
    weight: '118.50 กก.',
    method: 'เงินสด',
    items: [{ n: 'เหล็ก', w: '118.50 กก. × ฿17.00', t: '฿2,014.50' }],
    total: '฿1,670.00',
  },
  '009': {
    no: 'RC670515-009',
    time: '09:30 น.',
    cust: 'คุณประเสริฐ แสงทอง',
    init: 'ปร',
    bg: 'var(--rose-bg)',
    fg: 'var(--rose)',
    status: 'ok',
    weight: '44.10 กก.',
    method: 'เงินสด',
    items: [{ n: 'กระดาษลัง', w: '44.10 กก. × ฿17.00', t: '฿750.00' }],
    total: '฿750.00',
  },
  '008': {
    no: 'RC670515-008',
    time: '09:10 น.',
    cust: 'คุณนภา พรมดี',
    init: 'นภ',
    bg: 'var(--green-100)',
    fg: 'var(--green-700)',
    status: 'ok',
    weight: '96.80 กก.',
    method: 'พร้อมเพย์',
    items: [
      { n: 'เหล็ก', w: '40.00 กก. × ฿17.00', t: '฿680.00' },
      { n: 'กระดาษลัง', w: '56.80 กก. × ฿10.00', t: '฿570.00' },
    ],
    total: '฿1,250.00',
  },
  '007': {
    no: 'RC670515-007',
    time: '08:52 น.',
    cust: 'คุณธีระ บุญมา',
    init: 'ธี',
    bg: 'var(--amber-bg)',
    fg: 'var(--amber)',
    status: 'ok',
    weight: '31.40 กก.',
    method: 'เงินสด',
    items: [{ n: 'ขวดพลาสติก', w: '31.40 กก. × ฿12.40', t: '฿540.00' }],
    total: '฿540.00',
  },
};

export const INITIAL_ORDER = ['012', '011', '010', '009', '008', '007'];

const ReceiptsContext = createContext(null);

export function ReceiptsProvider({ children }) {
  const [receipts, setReceipts] = usePersistentState('scrapshop_receipts', INITIAL_RECEIPTS);
  const [order, setOrder] = usePersistentState('scrapshop_receipts_order', INITIAL_ORDER);

  // One-time migration: receipts used to have no real calendar date (only a time-of-day
  // string), so the date filter on the Receipts page had nothing to filter by. Anything
  // saved before this gets backfilled with today's date so it doesn't just disappear.
  useEffect(() => {
    const today = todayISO();
    setReceipts((prev) => {
      let changed = false;
      const next = {};
      for (const id in prev) {
        if (!prev[id].date) {
          changed = true;
          next[id] = { ...prev[id], date: today };
        } else {
          next[id] = prev[id];
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addReceipt(data) {
    const id = data.no;
    const date = todayISO();
    setReceipts((prev) => ({ ...prev, [id]: { date, ...data } }));
    setOrder((prev) => [id, ...prev]);
    return data;
  }

  return (
    <ReceiptsContext.Provider value={{ receipts, setReceipts, order, setOrder, addReceipt }}>
      {children}
    </ReceiptsContext.Provider>
  );
}

export function useReceipts() {
  const ctx = useContext(ReceiptsContext);
  if (!ctx) throw new Error('useReceipts must be used within a ReceiptsProvider');
  return ctx;
}
