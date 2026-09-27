import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

export const EXPENSE_CATEGORIES = ['ค่าไฟฟ้า', 'ค่าน้ำประปา', 'ค่าน้ำมัน/แก๊ส', 'ค่าเช่าที่', 'ค่าซ่อมบำรุง', 'ค่าขนส่ง', 'ค่าอุปกรณ์/วัสดุ', 'ค่าโทรศัพท์/อินเทอร์เน็ต', 'ค่าธรรมเนียม/ภาษีท้องถิ่น', 'อื่นๆ'];
export const EXPENSE_PAY_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน', promptpay: 'พร้อมเพย์' };

const ExpensesContext = createContext(null);

export function ExpensesProvider({ children }) {
  const [expenses, setExpenses] = useState({});
  const [order, setOrder] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const e of data.expenses) {
        map[e.id] = e;
        ord.push(e.id);
      }
      setExpenses(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePolling(refresh, 5000);

  async function addExpense(data) {
    const res = await fetch('/api/expenses', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'บันทึกค่าใช้จ่ายไม่สำเร็จ');
    await refresh();
    return result.expense;
  }

  async function updateExpense(id, patch) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(patch) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'แก้ไขค่าใช้จ่ายไม่สำเร็จ');
    setExpenses((prev) => ({ ...prev, [id]: result.expense }));
    return result.expense;
  }

  async function deleteExpense(id) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบค่าใช้จ่ายไม่สำเร็จ');
    }
    setExpenses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  return <ExpensesContext.Provider value={{ expenses, order, addExpense, updateExpense, deleteExpense, refresh }}>{children}</ExpensesContext.Provider>;
}

export function useExpenses() {
  const ctx = useContext(ExpensesContext);
  if (!ctx) throw new Error('useExpenses must be used within an ExpensesProvider');
  return ctx;
}
