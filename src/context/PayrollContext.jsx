import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';

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

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const PayrollContext = createContext(null);

export function PayrollProvider({ children }) {
  const [staff, setStaff] = useState({});
  const [order, setOrder] = useState([]);
  const [payHistory, setPayHistory] = useState([]);

  // Staff roster + weekly attendance/pay state used to live only in this browser's own
  // localStorage. Fetched from the real database behind requireAuth, same as
  // users/customers/products/receipts/deliveries. Per-keystroke fields (advance, other
  // amount/reason, attendance clicks) are NOT pushed to the server as they happen — Payroll.jsx
  // keeps those as a local draft and only calls updateStaff once, on an explicit
  // "บันทึกร่าง"/"จ่ายเงิน" action, matching every other edit form in this app.
  const refresh = useCallback(async () => {
    try {
      const [staffRes, historyRes] = await Promise.all([
        fetch('/api/staff', { headers: authHeaders() }),
        fetch('/api/pay-history', { headers: authHeaders() }),
      ]);
      if (staffRes.ok) {
        const data = await staffRes.json();
        const map = {};
        const ord = [];
        for (const s of data.staff) {
          map[s.id] = s;
          ord.push(s.id);
        }
        setStaff(map);
        setOrder(ord);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setPayHistory(data.payHistory);
      }
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePolling(refresh, 5000);

  async function createStaff(data) {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เพิ่มลูกน้องไม่สำเร็จ');
    setStaff((prev) => ({ ...prev, [result.staff.id]: result.staff }));
    setOrder((prev) => [result.staff.id, ...prev]);
    return result.staff;
  }

  // General patch — covers the profile edit (name/role/base), the draft save
  // (days/attendance/advance/otherAmount/otherReasonId/otherCustomReason/paid), and the
  // one-click "จ่ายแล้ว"/"ค้างจ่าย" badge toggle (paid only).
  async function updateStaff(id, patch) {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกข้อมูลพนักงานไม่สำเร็จ');
    setStaff((prev) => ({ ...prev, [id]: data.staff }));
    return data.staff;
  }

  async function deleteStaff(id) {
    const res = await fetch(`/api/staff/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบข้อมูลพนักงานไม่สำเร็จ');
    }
    setStaff((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  // Finalizes a weekly payment — records the pay_history entry and resets the staff row's
  // week-local fields (days/attendance/advance/other, paid=true) in one atomic server call.
  async function payStaff(id, data) {
    const res = await fetch(`/api/staff/${id}/pay`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'บันทึกการจ่ายเงินไม่สำเร็จ');
    setStaff((prev) => ({ ...prev, [id]: result.staff }));
    setPayHistory((prev) => [result.payRecord, ...prev]);
    return result;
  }

  return (
    <PayrollContext.Provider
      value={{ staff, order, payHistory, createStaff, updateStaff, deleteStaff, payStaff, refresh }}
    >
      {children}
    </PayrollContext.Provider>
  );
}

export function usePayroll() {
  const ctx = useContext(PayrollContext);
  if (!ctx) throw new Error('usePayroll must be used within a PayrollProvider');
  return ctx;
}
