import { createContext, useContext, useEffect } from 'react';
import { usePersistentState } from '../lib/persist.js';

const MAX_DAYS_PER_WEEK = 6;

// Attendance is tracked per real working day (Mon-Sat) so a partial day can be recorded
// against the specific day it happened, instead of one manually-typed lump decimal.
export const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const ATTENDANCE_VALUE = { full: 1, half: 0.5, off: 0 };
export const ATTENDANCE_LABEL = { full: 'เต็มวัน', half: 'ครึ่งวัน', off: 'ขาด' };

// Shared between the Payroll page (which stamps it onto each new payment record) and
// the Payroll report page (which displays it) so the two never drift out of sync.
export const PAY_METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน', promptpay: 'พร้อมเพย์' };

export function attendanceTotal(attendance) {
  return (attendance || []).reduce((sum, st) => sum + (ATTENDANCE_VALUE[st] ?? 0), 0);
}

// Best-effort reconstruction used only to migrate legacy records that had a lump `days`
// number but no per-day breakdown yet — fills full days from Monday, then one half day.
export function attendanceFromDays(days) {
  let remaining = Math.min(Math.max(parseFloat(days) || 0, 0), MAX_DAYS_PER_WEEK);
  const attendance = [];
  for (let i = 0; i < MAX_DAYS_PER_WEEK; i++) {
    if (remaining >= 1) {
      attendance.push('full');
      remaining -= 1;
    } else if (remaining >= 0.5) {
      attendance.push('half');
      remaining -= 0.5;
    } else {
      attendance.push('off');
    }
  }
  return attendance;
}

export const INITIAL_STAFF = {
  wittaya: { name: 'นายวิทยา ทองสุข', role: 'พนักงานชั่งของ · เริ่มงาน 3 ปี 2 เดือน', init: 'วิ', bg: 'var(--blue-bg)', fg: 'var(--blue)', base: 12000, days: 6, maxDays: 6, attendance: ['full', 'full', 'full', 'full', 'full', 'full'], advance: 1000, otherAmount: 0, otherReasonId: '', otherCustomReason: '', paid: false },
  somsak: { name: 'นายสมศักดิ์ แก้วมณี', role: 'คนขับรถรับซื้อ · เริ่มงาน 1 ปี 6 เดือน', init: 'สม', bg: 'var(--rose-bg)', fg: 'var(--rose)', base: 13500, days: 5, maxDays: 6, attendance: ['full', 'full', 'full', 'full', 'full', 'off'], advance: 0, otherAmount: 0, otherReasonId: '', otherCustomReason: '', paid: false },
  kanjana: { name: 'น.ส.กาญจนา ศรีสุข', role: 'แคชเชียร์ · เริ่มงาน 2 ปี', init: 'กา', bg: 'var(--plum-bg)', fg: 'var(--plum)', base: 10500, days: 6, maxDays: 6, attendance: ['full', 'full', 'full', 'full', 'full', 'full'], advance: 500, otherAmount: 0, otherReasonId: '', otherCustomReason: '', paid: false },
  prasert: { name: 'นายประเสริฐ แสงทอง', role: 'พนักงานคัดแยก · เริ่มงาน 8 เดือน', init: 'ปร', bg: 'var(--amber-bg)', fg: 'var(--amber)', base: 9800, days: 4.5, maxDays: 6, attendance: ['full', 'full', 'full', 'full', 'half', 'off'], advance: 300, otherAmount: 0, otherReasonId: '', otherCustomReason: '', paid: true },
  malee: { name: 'นางมาลี วงศ์ไทย', role: 'พนักงานชั่งของ · เริ่มงาน 4 ปี', init: 'มา', bg: 'var(--green-100)', fg: 'var(--green-700)', base: 12000, days: 6, maxDays: 6, attendance: ['full', 'full', 'full', 'full', 'full', 'full'], advance: 0, otherAmount: 0, otherReasonId: '', otherCustomReason: '', paid: true },
};

export const INITIAL_ORDER = ['wittaya', 'somsak', 'kanjana', 'prasert', 'malee'];

const PayrollContext = createContext(null);

export function PayrollProvider({ children }) {
  const [staff, setStaff] = usePersistentState('scrapshop_payroll_staff', INITIAL_STAFF);
  const [order, setOrder] = usePersistentState('scrapshop_payroll_order', INITIAL_ORDER);
  // Every finalized weekly payment is appended here so past weeks can be reviewed later —
  // unlike component-local state, this survives reloads because it's written to localStorage.
  const [payHistory, setPayHistory] = usePersistentState('scrapshop_payroll_history', []);

  function addPayHistory(record) {
    setPayHistory((prev) => [record, ...prev]);
  }

  // One-time migration: payroll used to run on a ~26-day monthly cycle; it now runs
  // weekly (Mon-Sat, max 6 days). Also, "เบิกล่วงหน้า" (cash advance, subtracted from pay)
  // and "อื่นๆ" (allowances like ค่าเช่าบ้าน/ค่าน้ำมันรถ, added to pay) used to share one
  // combined "deduct" field; they're now separate fields with opposite signs. Anything
  // saved under either old shape gets normalized here so people don't have to clear
  // their browser storage.
  useEffect(() => {
    setStaff((prev) => {
      let changed = false;
      const next = {};
      for (const id in prev) {
        let p = prev[id];
        if ((p.maxDays || 0) > MAX_DAYS_PER_WEEK) {
          changed = true;
          p = { ...p, maxDays: MAX_DAYS_PER_WEEK, days: Math.min(p.days || 0, MAX_DAYS_PER_WEEK) };
        }
        if (p.advance === undefined) {
          changed = true;
          const { deduct, deductReasonId, deductCustomReason, ...rest } = p;
          p = { ...rest, advance: deduct || 0, otherAmount: 0, otherReasonId: '', otherCustomReason: '' };
        }
        if (!Array.isArray(p.attendance)) {
          changed = true;
          p = { ...p, attendance: attendanceFromDays(p.days) };
        }
        next[id] = p;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PayrollContext.Provider value={{ staff, setStaff, order, setOrder, payHistory, addPayHistory }}>
      {children}
    </PayrollContext.Provider>
  );
}

export function usePayroll() {
  const ctx = useContext(PayrollContext);
  if (!ctx) throw new Error('usePayroll must be used within a PayrollProvider');
  return ctx;
}
