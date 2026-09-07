import { createContext, useContext, useEffect, useMemo } from 'react';
import { usePersistentState } from '../lib/persist.js';
import { IconDroplet, IconCircleX, IconBox, IconMagnet, IconScale, IconCrop, IconEdit } from '../icons.jsx';

function parseCountString(s) {
  return parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
}
function parseMoneyString(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

// Icon components can't survive JSON persistence, so they're re-attached from this
// map (by reason id) every time the persisted data is read, instead of being stored.
const ICON_MAP = {
  wet: IconDroplet,
  dirty: IconCircleX,
  package: IconBox,
  rusty: IconMagnet,
  scale: IconScale,
  broken: IconCrop,
  other: IconEdit,
};

// uses/total are kept as real numbers (not display strings) so they can be incremented
// directly every time a receipt actually applies this reason — see incrementUsage below.
export const INITIAL_REASONS = {
  wet: { name: 'น้ำหนักเปียก', desc: 'สินค้าเปียกน้ำหรือมีความชื้นสูงกว่าปกติ', bg: 'var(--blue-bg)', fg: 'var(--blue)', type: 'percent', value: '5', uses: 0, total: 0, active: true },
  dirty: { name: 'มีสิ่งปนเปื้อน', desc: 'มีดิน ทราย หรือสิ่งแปลกปลอมปนเปื้อน', bg: 'var(--amber-bg)', fg: 'var(--amber)', type: 'percent', value: '8', uses: 0, total: 0, active: true },
  package: { name: 'หักน้ำหนักบรรจุภัณฑ์', desc: 'หักน้ำหนักถุง กล่อง หรือภาชนะที่ปนมา', bg: 'var(--plum-bg)', fg: 'var(--plum)', type: 'fixed', value: '1.5', uses: 0, total: 0, active: true },
  rusty: { name: 'เหล็กเป็นสนิมมาก', desc: 'คุณภาพต่ำกว่ามาตรฐานรับซื้อปกติ', bg: 'var(--rose-bg)', fg: 'var(--rose)', type: 'percent', value: '10', uses: 0, total: 0, active: true },
  scale: { name: 'ปรับตามเครื่องชั่ง', desc: 'ส่วนต่างจากการสอบเทียบเครื่องชั่ง', bg: 'var(--teal-bg, #E4F6F4)', fg: 'var(--teal, #0E8E82)', type: 'fixed', value: '20', uses: 0, total: 0, active: true },
  broken: { name: 'แก้วแตกร้าว', desc: 'ขวดแก้วแตกหรือชำรุดเกินมาตรฐาน', bg: 'var(--bg)', fg: 'var(--ink-500)', type: 'percent', value: '15', uses: 0, total: 0, active: false },
  other: { name: 'อื่นๆ (ระบุเอง)', desc: 'พิมพ์เหตุผลเพิ่มเติมได้เองในหน้ารับซื้อของ', bg: 'var(--green-100)', fg: 'var(--green-700)', type: 'fixed', value: '0', uses: 0, total: 0, active: true },
};

export const INITIAL_ORDER = ['wet', 'dirty', 'package', 'rusty', 'scale', 'broken', 'other'];

export const BLANK_REASON = { name: '', desc: '', bg: 'var(--green-100)', fg: 'var(--green-700)', type: 'fixed', value: '0', uses: 0, total: 0, active: true };

const DeductionsContext = createContext(null);

export function DeductionsProvider({ children }) {
  const [reasonsRaw, setReasons] = usePersistentState('scrapshop_deductions', INITIAL_REASONS);
  const [order, setOrder] = usePersistentState('scrapshop_deductions_order', INITIAL_ORDER);

  // One-time migration: uses/total used to be pre-formatted display strings ("42 ครั้ง",
  // "−฿2,180.00") that never actually changed. They're now real numbers that increment
  // on real usage (see incrementUsage) — old string-shaped data gets parsed back to numbers.
  useEffect(() => {
    setReasons((prev) => {
      let changed = false;
      const next = {};
      for (const id in prev) {
        const r = prev[id];
        if (typeof r.uses === 'string' || typeof r.total === 'string') {
          changed = true;
          next[id] = { ...r, uses: parseCountString(r.uses), total: parseMoneyString(r.total) };
        } else {
          next[id] = r;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reasons = useMemo(() => {
    const withIcons = {};
    for (const id in reasonsRaw) {
      withIcons[id] = { ...reasonsRaw[id], Icon: ICON_MAP[id] || IconEdit };
    }
    return withIcons;
  }, [reasonsRaw]);

  // Called once per reason actually applied on a submitted receipt (see ScrapPurchase.jsx),
  // so "ใช้แล้ว N ครั้ง" / "ยอดหักรวม" reflect real usage instead of frozen seed numbers.
  function incrementUsage(id, moneyAmount) {
    if (!id || !reasonsRaw[id]) return;
    setReasons((prev) => ({
      ...prev,
      [id]: { ...prev[id], uses: (prev[id].uses || 0) + 1, total: (prev[id].total || 0) + (moneyAmount || 0) },
    }));
  }

  // Inverse of incrementUsage — called when a receipt that applied this reason gets voided
  // (see Receipts.jsx handleVoid), so "ใช้แล้ว N ครั้ง" / "ยอดหักรวม" don't stay permanently
  // inflated by a purchase that was fully reversed everywhere else.
  function decrementUsage(id, moneyAmount) {
    if (!id || !reasonsRaw[id]) return;
    setReasons((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        uses: Math.max((prev[id].uses || 0) - 1, 0),
        total: Math.max((prev[id].total || 0) - (moneyAmount || 0), 0),
      },
    }));
  }

  return (
    <DeductionsContext.Provider value={{ reasons, setReasons, order, setOrder, incrementUsage, decrementUsage }}>
      {children}
    </DeductionsContext.Provider>
  );
}

export function useDeductions() {
  const ctx = useContext(DeductionsContext);
  if (!ctx) throw new Error('useDeductions must be used within a DeductionsProvider');
  return ctx;
}
